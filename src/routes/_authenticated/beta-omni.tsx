import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { betaQuery } from "@/lib/beta-query";
import { type OmniEvent } from "@/lib/beta";
import { omniAgentInput, type AgentEvent } from "@/lib/omni-agent";
import {
  cancelOmniAgent,
  readOmniAgentRuns,
  readOmniChatStatus,
} from "@/lib/omni-agent.functions";
import {
  CONTEXT_TURN_CHOICES,
  RUN_STATUS_LABEL,
  chatConnections,
  chatModels,
  providerState,
  savedTurns,
  type ChatTurn,
  type HeldTask,
} from "@/lib/omni-chat";
import { ChatConnections } from "@/components/omnibridge/ChatConnections";
import { ChatHandoffDialog, HeldTaskCard } from "@/components/omnibridge/ChatHandoff";
import { changeBetaPause } from "@/lib/beta.functions";
import { OmniAgentHistory } from "@/components/omnibridge/OmniAgentHistory";
import { supabase } from "@/integrations/supabase/client";
import { useGuardian } from "@/hooks/use-guardian";
import { readCreativePause } from "@/hooks/use-cartoon";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { seo } from "@/lib/seo";
import { useSpeechInput } from "@/hooks/use-speech-input";
import { useSpeechOutput } from "@/hooks/use-speech-output";
import { useMicLevel } from "@/hooks/use-mic-level";
import { OmniOrb } from "@/components/omnibridge/OmniOrb";
import { OmniVoiceBar } from "@/components/omnibridge/OmniVoiceBar";
import {
  canSendTo,
  introFor,
  orbState,
  speakableText,
  speakerLabel,
  voiceAgent,
  type VoiceAgentId,
} from "@/lib/omni-voice";
import { Square, Send, Trash2, Pause, Play, Forward } from "lucide-react";
import { z } from "zod";
const studioSearch = z.object({
  studioGoal: z.string().max(1000).optional().catch(undefined),
  studioProject: z.string().uuid().optional().catch(undefined),
});
export const Route = createFileRoute("/_authenticated/beta-omni")({
  validateSearch: studioSearch,
  head: () =>
    seo(
      "OMNI · Private text agent",
      "Private OMNI text agent with saved conversation history, opt-in earlier-turn context, explicit consent, held-task handoff, streaming, cancellation and account pause. No tools or desktop access.",
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(betaQuery),
  component: LiveOmni,
});
type ChatItem = { kind: "turn"; turn: ChatTurn } | { kind: "task"; task: HeldTask };
function LiveOmni() {
  const { data } = useSuspenseQuery(betaQuery),
    { store: guardian } = useGuardian();
  const draft = Route.useSearch();
  const qc = useQueryClient(),
    cancelRun = useServerFn(cancelOmniAgent),
    pauseAccount = useServerFn(changeBetaPause),
    readRuns = useServerFn(readOmniAgentRuns),
    readStatus = useServerFn(readOmniChatStatus);
  const activeId = useRef<string | null>(null);
  const [projectId, setProject] = useState(
      data.projects.find((p) => p.id === draft.studioProject)?.id ?? data.projects[0]?.id ?? "",
    ),
    [text, setText] = useState(draft.studioGoal ?? ""),
    [consent, setConsent] = useState(false),
    [items, setItems] = useState<ChatItem[]>([]),
    [showSaved, setShowSaved] = useState(true),
    [contextTurns, setContextTurns] = useState(0),
    [handoff, setHandoff] = useState<{ request: string; reply: string } | null>(null),
    [thinking, setThinking] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [usage, setUsage] = useState<Extract<OmniEvent, { type: "done" }> | null>(null);
  const current = useRef<AbortController | null>(null);
  const speech = useSpeechInput((spoken) =>
    setText((prev) => (prev ? prev.trimEnd() + " " : "") + spoken),
  );
  const paused = guardian.paused || data.access?.paused;
  const runsQuery = useQuery({
    queryKey: ["omni-agent-runs", projectId],
    queryFn: () => readRuns({ data: { projectId } }),
    enabled: Boolean(projectId),
    retry: false,
  });
  const statusQuery = useQuery({
    queryKey: ["omni-chat-status"],
    queryFn: () => readStatus(),
    retry: false,
  });
  const provider = providerState(statusQuery.data, !!statusQuery.error);
  const models = chatModels(statusQuery.data);
  const sessionRunIds = useMemo(
    () =>
      new Set(
        items.flatMap((it) => (it.kind === "turn" && it.turn.runId ? [it.turn.runId] : [])),
      ),
    [items],
  );
  const history =
    showSaved && runsQuery.data ? savedTurns(runsQuery.data, sessionRunIds) : [];
  const projectName = data.projects.find((p) => p.id === projectId)?.name ?? "";
  const [agentId, setAgentId] = useState<VoiceAgentId>("omni");
  const [voiceOn, setVoiceOn] = useState(false);
  const voiceOnRef = useRef(false);
  voiceOnRef.current = voiceOn;
  const level = useRef(0);
  const voice = useSpeechOutput();
  useMicLevel(speech.listening, level);
  const agent = voiceAgent(agentId);
  const gate = canSendTo(agentId, {
    provider,
    aiApproved: !!data.access?.ai_approved,
    paused: !!paused,
    hasProject: !!projectId,
    consent,
  });
  // Orb shows why OMNI can't answer, not "Ready", when sending is blocked for reasons other than this message.
  const sendBlock = canSendTo(agentId, {
    provider,
    aiApproved: !!data.access?.ai_approved,
    paused: !!paused,
    hasProject: true,
    consent: true,
  });
  const bump = () => {
    level.current = Math.min(1, level.current + 0.4);
  };
  const say = (line: string) => {
    if (voiceOnRef.current) voice.speak(line, { onWord: bump });
  };
  const changeAgent = (id: VoiceAgentId) => {
    speech.stop();
    voice.cancel();
    setAgentId(id);
    say(introFor(id));
  };
  const toggleVoice = () => {
    if (voiceOn) {
      voice.cancel();
      setVoiceOn(false);
      return;
    }
    voiceOnRef.current = true;
    setVoiceOn(true);
    say(introFor(agentId));
  };
  useEffect(() => () => current.current?.abort(), []);
  useEffect(() => {
    if (paused) current.current?.abort();
  }, [paused]);
  const stop = async () => {
    current.current?.abort();
    const id = activeId.current;
    if (id) {
      try {
        await cancelRun({ data: { id } });
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Saved cancellation not confirmed.");
      }
    }
    await qc.invalidateQueries({ queryKey: ["omni-agent-runs", projectId] });
  };
  const send = async () => {
    if (current.current) return;
    const allowed = canSendTo(agentId, {
      provider,
      aiApproved: !!data.access?.ai_approved,
      paused: !!paused,
      hasProject: !!projectId,
      consent,
    });
    if (!allowed.ok) {
      setNotice(allowed.reason);
      return;
    }
    voice.cancel();
    speech.stop();
    let input;
    try {
      if (paused || readCreativePause()) throw new Error("Guardian or Nexus planning is paused.");
      input = omniAgentInput.parse({
        projectId,
        message: text.replace(/^@omni\s*/i, ""),
        consent,
        requestId: crypto.randomUUID(),
        contextTurns,
      });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Invalid input");
      return;
    }
    activeId.current = input.requestId;
    const abort = new AbortController();
    current.current = abort;
    setBusy(true);
    setThinking("");
    setNotice("");
    setUsage(null);
    const runId = input.requestId,
      now = new Date().toISOString();
    const base = { agent: "omni" as const, runId, model: null, saved: false, contextIds: [] };
    setItems((prev) => [
      ...prev,
      {
        kind: "turn",
        turn: { ...base, key: `${runId}:u`, role: "user", text: input.message, status: null, at: now },
      },
      {
        kind: "turn",
        turn: {
          ...base,
          key: `${runId}:a`,
          role: "assistant",
          text: "",
          status: "running",
          at: now,
          request: input.message,
        },
      },
    ]);
    const patch = (key: string, fn: (t: ChatTurn) => Partial<ChatTurn>) =>
      setItems((prev) =>
        prev.map((it) =>
          it.kind === "turn" && it.turn.key === key
            ? { kind: "turn", turn: { ...it.turn, ...fn(it.turn) } }
            : it,
        ),
      );
    setText("");
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Sign in again; your session expired.");
      const response = await fetch("/api/omni-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify(input),
        signal: abort.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `OMNI unavailable (${response.status}).`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty response.");
      const decoder = new TextDecoder();
      let buffer = "",
        terminal = false,
        reply = "",
        completed = false;
      const consume = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as AgentEvent;
        if (event.type === "text") reply += event.text;
        if (event.type === "text") patch(`${runId}:a`, (t) => ({ text: t.text + event.text }));
        if (event.type === "context") patch(`${runId}:u`, () => ({ contextIds: event.ids }));
        if (event.type === "thinking") setThinking((prev) => prev + event.text);
        if (event.type === "result") {
          const run = event.run;
          terminal = true;
          patch(`${runId}:a`, () => ({
            status: run.status,
            model: run.model,
            at: run.finished_at ?? run.created_at,
          }));
          if (run.status === "completed") completed = true;
          if (run.status === "completed")
            setUsage({
              type: "done",
              inputTokens: run.input_tokens,
              outputTokens: run.output_tokens,
              totalTokens: run.total_tokens,
              actualCharge: null,
              runId: run.gateway_run_id,
            });
          else setNotice(`${run.status}: ${run.error_message ?? "Run stopped; see saved status."}`);
        }
        if (event.type === "error") {
          setNotice(`${event.status}: ${event.message}`);
          terminal = true;
        }
      };
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(consume);
      }
      consume(buffer + decoder.decode());
      if (!terminal) throw new Error("Response ended early. No completed answer recorded.");
      if (completed && reply.trim() && !abort.signal.aborted) say(speakableText(reply));
    } catch (e) {
      patch(`${runId}:a`, (t) =>
        t.status === "running" ? { status: abort.signal.aborted ? "cancelled" : "failed" } : {},
      );
      setNotice(
        abort.signal.aborted
          ? "Stopped. Partial text retained; billed usage may still apply."
          : e instanceof Error
            ? e.message
            : "Request failed.",
      );
    } finally {
      setBusy(false);
      current.current = null;
      activeId.current = null;
      setConsent(false);
      setContextTurns(0);
      await qc.invalidateQueries({ queryKey: ["omni-agent-runs", projectId] });
      await qc.invalidateQueries({ queryKey: ["omni-chat-status"] });
    }
  };
  const renderTurn = (m: ChatTurn) => (
    <Message key={m.key} from={m.role}>
      <p className="text-[10px] text-gold-light">
        {speakerLabel(m.role, m.agent)}
        {m.role === "assistant" ? " / MODEL RESPONSE" : ""}
        {m.saved ? " · SAVED" : ""}
      </p>
      <MessageContent>
        <MessageResponse className="break-words text-sm leading-7">
          {m.text ||
            (m.status === "running" && busy ? "Waiting for the model…" : "No answer received.")}
        </MessageResponse>
      </MessageContent>
      {m.role === "user" && m.contextIds.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Sent with {m.contextIds.length} earlier saved turn
          {m.contextIds.length === 1 ? "" : "s"} you chose as context.
        </p>
      )}
      {m.role === "assistant" && (
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span>
            {m.status ? RUN_STATUS_LABEL[m.status] : "Unknown"}
            {m.at ? ` · ${new Date(m.at).toLocaleString()}` : ""}
            {m.model ? ` · ${m.model}` : ""}
            {m.runId ? ` · ref ${m.runId.slice(0, 8)}` : ""}
          </span>
          {m.status === "completed" && m.text.trim() && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => setHandoff({ request: m.request ?? "", reply: m.text })}
            >
              <Forward size={12} />
              Hand off
            </Button>
          )}
        </div>
      )}
    </Message>
  );
  return (
    <section className="omni-orb-dashboard mx-auto max-w-6xl px-6 py-10">
      <header className="border-b border-border pb-6">
        <p className="eyebrow">OmniBridge / authorized beta channel</p>
        <h1 className="mt-4 text-4xl">OMNI</h1>
        <p className="mt-4 text-xs leading-7 text-muted-foreground">
          Lovable AI · 4,000 output-token budget including reasoning. No tool access. Each run sends
          this message and your selected project name/brief; earlier saved turns are sent only when
          you choose them for that one message. Text-only agent · activation pending verified
          account and protected setup.
        </p>
        <Button asChild variant="signal" size="sm" className="mt-4">
          <Link to="/quantum-studio">Quantum Studio</Link>
        </Button>
        {draft.studioGoal && (
          <p className="mt-3 text-xs text-warning">
            Quantum Studio text draft only. No audio is attached, no request sent automatically, and
            model advice never executes media operations.
          </p>
        )}
      </header>
      <div className="omni-orb-stage mt-6 flex flex-col items-center gap-2 border-b border-border pb-6">
        <OmniOrb
          agentName={agent.name}
          muted={!voiceOn}
          level={level}
          statusText={
            agent.chatPath && !sendBlock.ok && !busy && !speech.listening && !voice.speaking
              ? `Can't answer yet · ${sendBlock.reason}`
              : undefined
          }
          state={orbState({
            agentConnected: !!agent.chatPath,
            listening: speech.listening,
            speaking: voice.speaking,
            busy,
          })}
        />
        <OmniVoiceBar
          agentId={agentId}
          onAgentChange={changeAgent}
          busy={busy}
          dictationSupported={speech.supported}
          listening={speech.listening}
          onToggleMic={() => (speech.listening ? speech.stop() : speech.start())}
          voiceSupported={voice.supported}
          voiceOn={voiceOn}
          onToggleVoice={toggleVoice}
          speaking={voice.speaking}
          onStopSpeaking={voice.cancel}
        />
      </div>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <label className="block text-xs">
            Private project
            <select
              value={projectId}
              disabled={busy}
              onChange={(e) => {
                setProject(e.target.value);
                setItems([]);
                setContextTurns(0);
                setUsage(null);
                setConsent(false);
              }}
              className="exchange-select mt-2 w-full"
            >
              <option value="">Select a project</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block text-xs">
            Model
            <select
              value={models[0]?.id ?? ""}
              disabled
              aria-describedby="model-note"
              className="exchange-select mt-2 w-full"
            >
              {models.length ? (
                models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))
              ) : (
                <option value="">No configured model</option>
              )}
            </select>
            <span id="model-note" className="mt-1 block text-[10px] text-muted-foreground">
              {statusQuery.error
                ? "Model status could not be read."
                : models.length === 1
                  ? "Only one model is set up for this agent, so there is nothing else to pick."
                  : models.length
                    ? "Configured models only."
                    : "No model provider is set up."}
            </span>
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showSaved}
                onChange={(e) => setShowSaved(e.target.checked)}
              />
              Show saved history in this chat
            </label>
            <span className="text-[10px] text-muted-foreground">
              {runsQuery.error
                ? "Saved history unavailable."
                : `${runsQuery.data?.length ?? 0} saved run(s), newest 20 kept visible. Only you can read them.`}
            </span>
          </div>
          <Conversation className="mt-3 h-[480px] min-h-0 border-y border-border">
            <ConversationContent>
              {!history.length && !items.length && (
                <p className="py-12 text-sm text-muted-foreground">
                  No agent response in this session.
                </p>
              )}
              {history.length > 0 && (
                <p className="text-[10px] uppercase text-muted-foreground">
                  Saved history · read back from your project
                </p>
              )}
              {history.map(renderTurn)}
              {history.length > 0 && items.length > 0 && (
                <p className="text-[10px] uppercase text-muted-foreground">This session</p>
              )}
              {items.map((it) =>
                it.kind === "turn" ? (
                  renderTurn(it.turn)
                ) : (
                  <HeldTaskCard
                    key={`task:${it.task.id}`}
                    task={it.task}
                    onChange={(next) =>
                      setItems((prev) =>
                        prev.map((p) =>
                          p.kind === "task" && p.task.id === next.id ? { kind: "task", task: next } : p,
                        ),
                      )
                    }
                  />
                ),
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          {thinking && (
            <details className="mt-4 text-xs text-muted-foreground">
              <summary>Model reasoning summary</summary>
              <p className="mt-2 whitespace-pre-wrap break-words">{thinking}</p>
            </details>
          )}
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="block text-xs">
              Message {agent.name}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
                disabled={busy || !agent.chatPath}
                required
                className="exchange-select mt-2 min-h-28 w-full"
              />
            </label>
            {speech.listening && (
              <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
                Listening… spoken words appear above for your review. Nothing is sent automatically.
              </p>
            )}
            {speech.error && (
              <p role="status" className="mt-2 text-[10px] text-warning">
                {speech.error}
              </p>
            )}
            <label className="mt-4 block text-xs">
              Earlier turns to include as context (this message only)
              <select
                value={contextTurns}
                disabled={busy}
                onChange={(e) => setContextTurns(Number(e.target.value))}
                className="exchange-select mt-2 w-full"
              >
                {CONTEXT_TURN_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "None — send only this message" : `Last ${n} completed saved turns`}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[10px] text-muted-foreground">
                Resets to none after each send. Agent memory notes are never sent from this chat.
              </span>
            </label>
            <label className="mt-4 flex items-start gap-2 text-xs leading-6">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={busy}
              />
              I consent to sending non-sensitive message and selected project context
              {contextTurns ? `, plus up to ${contextTurns} earlier saved turns,` : ""} to Lovable AI.
              Workspace credits are charged; exact charge is not available here. I also consent to
              saving this message and the response privately in my project.
            </label>
            <div className="mt-4 flex gap-2">
              {busy ? (
                <Button type="button" variant="signal" onClick={() => void stop()}>
                  <Square size={14} />
                  Stop agent
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="cosmic"
                  disabled={!gate.ok}
                  title={gate.ok ? undefined : gate.reason}
                >
                  <Send size={14} />
                  {agent.chatPath ? `Run ${agent.name} agent` : `${agent.name} not connected here`}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Clear conversation"
                disabled={busy}
                onClick={() => {
                  setItems([]);
                  setShowSaved(false);
                  setThinking("");
                  setNotice(
                    "Cleared from this screen. Saved agent runs stay in your project; deleting them is not available yet.",
                  );
                  setUsage(null);
                }}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          </form>
        </div>
        <aside className="min-w-0 text-xs leading-7">
          <ChatConnections
            rows={chatConnections({
              provider,
              status: statusQuery.data,
              aiApproved: !!data.access?.ai_approved,
              paused: !!paused,
              dictation: speech.supported,
              voice: voice.supported,
            })}
            refreshing={statusQuery.isFetching}
            onRefresh={() => void statusQuery.refetch()}
          />
          <h2 className="mt-6 text-lg">Request boundaries</h2>
          <p className="mt-4 text-warning">
            {!data.access?.ai_approved
              ? "AWAITING FOUNDER AI APPROVAL"
              : paused
                ? "PAUSED"
                : "APPROVED BETA ACCESS · MEMBERSHIP STILL CHECKED"}
          </p>
          <p className="mt-4">
            One OMNI text agent. No GitHub, installed apps, devices, execution, tools or other
            agents. Plans are suggestions, not approval or test evidence.
          </p>
          <p className="mt-4 text-muted-foreground">
            Activation requires protected membership and saved-run setup. Only a completed saved
            result proves inference. No automatic retries or background autonomy. Account
            pause/revocation is checked during the active request; interrupted outcomes never
            restart automatically.
          </p>
          <Button
            variant="signal"
            size="sm"
            className="mt-4"
            onClick={async () => {
              try {
                await pauseAccount({ data: { paused: !data.access?.paused } });
                if (!data.access?.paused) await stop();
                await qc.invalidateQueries({ queryKey: ["beta-private"] });
                setNotice(
                  data.access?.paused
                    ? "Account AI resumed; every request still requires fresh permission checks."
                    : "Account AI paused. Saved results remain unchanged.",
                );
              } catch (e) {
                setNotice(e instanceof Error ? e.message : "Pause was not confirmed.");
              }
            }}
          >
            {data.access?.paused ? <Play size={14} /> : <Pause size={14} />}
            {data.access?.paused ? "Resume account AI" : "Pause account AI"}
          </Button>
          {usage && (
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="text-sm">Last completed request</h3>
              <p>
                Input tokens: {usage.inputTokens ?? "Unknown"}
                <br />
                Output tokens: {usage.outputTokens ?? "Unknown"}
                <br />
                Total: {usage.totalTokens ?? "Unknown"}
                <br />
                Actual charge: unavailable
                <br />
                Billing: workspace AI credits
              </p>
              <p className="break-all text-[10px]">
                Run reference: {usage.runId || "Not returned"}
              </p>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="ghost">
              <Link to="/beta">Projects</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/members">Members</Link>
            </Button>
          </div>
        </aside>
      </div>
      <OmniAgentHistory projectId={projectId} busy={busy} />
      <ChatHandoffDialog
        source={handoff}
        projectName={projectName}
        onClose={() => setHandoff(null)}
        onQueued={(task) => {
          setItems((prev) => [...prev, { kind: "task", task }]);
          setNotice("Held task saved in OMNI Terminal. Nothing runs until you act there.");
        }}
      />
      {notice && (
        <p
          role="status"
          className="mt-5 break-words border-l border-warning pl-4 text-sm leading-7 text-warning"
        >
          {notice}
        </p>
      )}
    </section>
  );
}
