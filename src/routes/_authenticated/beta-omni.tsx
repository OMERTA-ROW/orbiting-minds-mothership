import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { betaQuery } from "@/lib/beta-query";
import { type OmniEvent } from "@/lib/beta";
import { omniAgentInput, type AgentEvent } from "@/lib/omni-agent";
import { cancelOmniAgent } from "@/lib/omni-agent.functions";
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
import { Square, Send, Trash2, Mic, Pause, Play } from "lucide-react";
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
      "Private single-turn OMNI agent with explicit consent, project-scoped saved results, streaming, cancellation and account pause. No tools or desktop access.",
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(betaQuery),
  component: LiveOmni,
});
function LiveOmni() {
  const { data } = useSuspenseQuery(betaQuery),
    { store: guardian } = useGuardian();
  const draft = Route.useSearch();
  const qc = useQueryClient(),
    cancelRun = useServerFn(cancelOmniAgent),
    pauseAccount = useServerFn(changeBetaPause);
  const activeId = useRef<string | null>(null);
  const [projectId, setProject] = useState(
      data.projects.find((p) => p.id === draft.studioProject)?.id ?? data.projects[0]?.id ?? "",
    ),
    [text, setText] = useState(draft.studioGoal ?? ""),
    [consent, setConsent] = useState(false),
    [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]),
    [thinking, setThinking] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [usage, setUsage] = useState<Extract<OmniEvent, { type: "done" }> | null>(null);
  const current = useRef<AbortController | null>(null);
  const speech = useSpeechInput((spoken) =>
    setText((prev) => (prev ? prev.trimEnd() + " " : "") + spoken),
  );
  const paused = guardian.paused || data.access?.paused;
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
    let input;
    try {
      if (paused || readCreativePause()) throw new Error("Guardian or Nexus planning is paused.");
      input = omniAgentInput.parse({
        projectId,
        message: text.replace(/^@omni\s*/i, ""),
        consent,
        requestId: crypto.randomUUID(),
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
    const index = messages.length + 1;
    setMessages((prev) => [
      ...prev,
      { role: "user", text: input.message },
      { role: "assistant", text: "" },
    ]);
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
        terminal = false;
      const consume = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as AgentEvent;
        if (event.type === "text")
          setMessages((prev) =>
            prev.map((m, i) => (i === index ? { ...m, text: m.text + event.text } : m)),
          );
        if (event.type === "thinking") setThinking((prev) => prev + event.text);
        if (event.type === "result") {
          const run = event.run;
          terminal = true;
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
    } catch (e) {
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
      await qc.invalidateQueries({ queryKey: ["omni-agent-runs", projectId] });
    }
  };
  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <header className="border-b border-border pb-6">
        <p className="eyebrow">OmniBridge / authorized beta channel</p>
        <h1 className="mt-4 text-4xl">OMNI</h1>
        <p className="mt-4 text-xs leading-7 text-muted-foreground">
          Lovable AI · openai/gpt-6-astra · 4,000 output-token budget including reasoning. No tool
          access. Each run sends only this message and your selected project name/brief; history is
          not resent. Text-only agent · activation pending verified account and protected setup.
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
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <label className="block text-xs">
            Private project
            <select
              value={projectId}
              disabled={busy}
              onChange={(e) => {
                setProject(e.target.value);
                setMessages([]);
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
          <Conversation className="mt-5 h-[480px] min-h-0 border-y border-border">
            <ConversationContent>
              {!messages.length && (
                <p className="py-12 text-sm text-muted-foreground">
                  No agent response in this session.
                </p>
              )}
              {messages.map((m, i) => (
                <Message key={i} from={m.role}>
                  <p className="text-[10px] text-gold-light">
                    {m.role === "user" ? "YOU" : "OMNI / MODEL RESPONSE"}
                  </p>
                  <MessageContent>
                    <MessageResponse className="break-words text-sm leading-7">
                      {m.text || (busy ? "Waiting for the model…" : "No answer received.")}
                    </MessageResponse>
                  </MessageContent>
                </Message>
              ))}
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
              Message OMNI
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
                disabled={busy}
                required
                className="exchange-select mt-2 min-h-28 w-full"
              />
            </label>
            {speech.supported && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => (speech.listening ? speech.stop() : speech.start())}
                >
                  <Mic size={14} />
                  {speech.listening ? "Stop dictation" : "Dictate"}
                </Button>
                <p className="text-[10px] leading-5 text-muted-foreground">
                  {speech.listening
                    ? "Listening… dictated text appears above for your review. Nothing is sent automatically."
                    : "Optional browser dictation; your browser may process audio with its own service. Typed input always works."}
                </p>
              </div>
            )}
            {speech.error && (
              <p role="status" className="mt-2 text-[10px] text-warning">
                {speech.error}
              </p>
            )}
            <label className="mt-4 flex items-start gap-2 text-xs leading-6">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={busy}
              />
              I consent to sending non-sensitive message and selected project context to Lovable AI.
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
                  disabled={!consent || !projectId || paused || !data.access?.ai_approved}
                >
                  <Send size={14} />
                  Run OMNI agent
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Clear conversation"
                disabled={busy}
                onClick={() => {
                  setMessages([]);
                  setThinking("");
                  setNotice("Conversation cleared. Saved agent runs are unchanged.");
                  setUsage(null);
                }}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          </form>
        </div>
        <aside className="min-w-0 text-xs leading-7">
          <h2 className="text-lg">Request boundaries</h2>
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
