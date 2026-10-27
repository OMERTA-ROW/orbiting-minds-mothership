import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { ArrowUpRight, Download, Shield, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoreGeometry, DemoBadge } from "@/components/evo";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { nexusProjects, omniConnectors } from "@/data/evolution";
import { omniTemplateReply, takeOmniHandoff } from "@/lib/omni-assistant";
import { reviewOmniPlan, type OmniPlan, type OmniTarget } from "@/lib/omnibridge";
import { useGuardian } from "@/hooks/use-guardian";
import { useNexus } from "@/hooks/use-nexus";
import { readCreativePause } from "@/hooks/use-cartoon";
import { downloadCreative } from "@/components/entertainment/CreativeRegistry";
import { OmniActivation } from "./OmniActivation";

export function OmniAssistant({
  worldId,
  onWorldChange,
}: {
  worldId: string;
  onWorldChange: (id: string) => void;
}) {
  const { store: g, ready: gr } = useGuardian(),
    { store: n, ready: nr } = useNexus();
  const [messages, setMessages] = useState<UIMessage[]>([]),
    [text, setText] = useState(""),
    [consent, setConsent] = useState(false),
    [targets, setTargets] = useState<OmniTarget[]>(["local"]),
    [plan, setPlan] = useState<OmniPlan | null>(null),
    [notice, setNotice] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const paused = g.paused || n.paused;
  const world = nexusProjects.find((p) => p.id === worldId);
  useEffect(() => {
    try {
      const staged = takeOmniHandoff(worldId, readCreativePause());
      if (staged) setText(staged);
    } catch {
      takeOmniHandoff(worldId, true);
      setNotice("Local safety preferences unavailable; draft transfer blocked.");
    }
    textarea.current?.focus();
  }, [worldId]);
  const send = (raw: string) => {
    try {
      if (!gr || !nr) throw new Error("Local safety preferences loading.");
      const response = omniTemplateReply(
        raw,
        worldId,
        targets,
        consent,
        crypto.randomUUID(),
        new Date().toISOString(),
        paused || readCreativePause(),
      );
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: raw }] },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          parts: [{ type: "text", text: response.text }],
        },
      ]);
      if (response.plan) setPlan(response.plan);
      setNotice("");
      setText("");
      textarea.current?.focus();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Template planning blocked.");
      setText(raw);
      textarea.current?.focus();
    }
  };
  return (
    <main className="mx-auto max-w-[1600px] px-5 pb-20 pt-8 md:px-10">
      <header className="relative overflow-hidden border-b border-gold/30 pb-7">
        <CoreGeometry className="pointer-events-none absolute -right-16 -top-36 w-96 opacity-25" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <span className="eyebrow">OmniBridge / dedicated coordinator</span>
            <DemoBadge label="DEMO · MODEL NOT CONNECTED" />
          </div>
          <h1 className="mt-5 text-5xl">OMNI</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Your intent. A clear plan. Permission before action.
          </p>
          <p className="mt-5 max-w-4xl text-xs leading-6 text-warning">
            Local template conversation only, not AI inference. No authenticated OMNI model or live
            agent; no tools execute. OMNI is a coordinator identity, not a trained proprietary model
            or sentient being.
          </p>
        </div>
      </header>
      <OmniActivation />
      <div className="my-6 flex flex-wrap items-center justify-between gap-4">
        <label className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
          Selected world
          <select
            aria-label="OMNI world"
            value={worldId}
            onChange={(e) => onWorldChange(e.target.value)}
            className="exchange-select max-w-full"
          >
            {nexusProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · DEMO
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button asChild variant="cosmic" size="sm"><Link to="/beta-omni">Authorized beta OMNI<ArrowUpRight size={13} /></Link></Button>
          <Button asChild variant="signal" size="sm">
            <Link to="/omnibridge">
              Capability graph
              <ArrowUpRight size={13} />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear temporary OMNI conversation"
            title="Clear temporary conversation"
            onClick={() => {
              setMessages([]);
              setPlan(null);
              setNotice("");
              setText("");
              textarea.current?.focus();
            }}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>
      <p className="mb-5 text-xs leading-6 text-muted-foreground">
        {world?.context} One temporary conversation. Changing worlds clears this view; nothing is
        stored or sent.
      </p>
      {(notice || paused) && (
        <p
          role="status"
          className="mb-5 border-l border-warning px-4 py-3 text-xs leading-6 text-warning"
        >
          {paused ? "Guardian or Nexus local planning paused. No endpoints affected. " : ""}
          {notice}
        </p>
      )}
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 border-y border-border" aria-label="OMNI conversation">
          <div className="flex flex-wrap justify-between gap-3 border-b border-border py-4 text-[10px]">
            <span className="font-mono text-gold-light">OMNI / TEMPLATE CHANNEL</span>
            <span className="text-muted-foreground">
              MODEL: NONE · REQUESTS: 0 · COST: NO PROVIDER CALL
            </span>
          </div>
          <Conversation initial="instant" resize="instant" className="h-[430px] min-h-0">
            <ConversationContent className="gap-6 px-2 py-6 md:px-5">
              {!messages.length ? (
                <div className="py-12">
                  <div className="relative mx-auto h-24 w-24 overflow-hidden" aria-hidden="true">
                    <CoreGeometry className="h-full w-full" />
                  </div>
                  <h2 className="mt-6 text-center text-2xl">What shall we map next?</h2>
                  <p className="mx-auto mt-4 max-w-md text-center text-xs leading-6 text-muted-foreground">
                    DEMO template channel · no model answers. Oracle: research and evidence. OMNI:
                    tool coordination. Guardian: permissions and safety.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {[
                      "@omni capabilities",
                      "@omni Plan a Blender scene with human review and safe rollback.",
                    ].map((v) => (
                      <Button
                        key={v}
                        variant="ghost"
                        size="sm"
                        className="h-auto max-w-full whitespace-normal py-2 text-xs"
                        onClick={() => {
                          setText(v);
                          textarea.current?.focus();
                        }}
                      >
                        {v}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <Message key={m.id} from={m.role}>
                    <span
                      className={`text-[9px] font-mono ${m.role === "assistant" ? "text-warning" : "text-muted-foreground"}`}
                    >
                      {m.role === "assistant"
                        ? "OMNI · DEMO TEMPLATE / NO MODEL"
                        : "YOU / TEMPORARY SAMPLE"}
                    </span>
                    <MessageContent
                      className={
                        m.role === "user"
                          ? "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground"
                          : ""
                      }
                    >
                      {m.parts.map((part, i) =>
                        part.type === "text" ? (
                          <MessageResponse key={i} className="break-words text-sm leading-7">
                            {part.text}
                          </MessageResponse>
                        ) : null,
                      )}
                    </MessageContent>
                  </Message>
                ))
              )}
            </ConversationContent>
            <ConversationScrollButton aria-label="Scroll to latest OMNI message" />
          </Conversation>
          <div className="border-t border-border py-5">
            <PromptInput onSubmit={({ text: submitted }) => send(submitted)}>
              <PromptInputTextarea
                ref={textarea}
                aria-label="Message OMNI"
                placeholder="@omni describe a fictional goal, or ask capabilities…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
                disabled={paused}
                className="min-h-28 text-sm"
              />
              <PromptInputFooter className="justify-between">
                <span className="min-w-0 text-[10px] text-muted-foreground">
                  @omni · temporary local template
                </span>
                <PromptInputSubmit
                  status="ready"
                  aria-label="Send to OMNI template"
                  disabled={!gr || !nr || paused || !consent || !text.trim()}
                  className="shrink-0"
                />
              </PromptInputFooter>
            </PromptInput>
            <label className="mt-4 flex items-start gap-2 text-xs leading-5">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I consent to temporary local planning with fictional, non-sensitive text only. No
              model request or storage.
            </label>
          </div>
        </section>
        <aside className="min-w-0">
          <h2 className="text-xl">Routing & permissions</h2>
          <p className="mt-4 text-xs leading-6 text-muted-foreground">
            Explicit handoff previews only. No broadcast, outside thread access or approved live
            agents.
          </p>
          <div className="mt-4 flex flex-wrap gap-2" aria-label="OMNI handoff previews">
            {(["local", "openai", "anthropic"] as const).map((t) => (
              <Button
                key={t}
                variant={targets.includes(t) ? "signal" : "ghost"}
                size="sm"
                aria-pressed={targets.includes(t)}
                disabled={t === "local" || paused}
                onClick={() =>
                  setTargets((prev) =>
                    prev.includes(t) ? prev.filter((v) => v !== t) : [...prev, t],
                  )
                }
              >
                {t === "local" ? "OMNI template" : `${t} · NOT SENT`}
              </Button>
            ))}
          </div>
          <p className="mt-5 font-mono text-[10px] leading-6 text-warning">
            INFERENCE: NOT CONNECTED
            <br />
            LIVE DISCOVERY: NOT PERFORMED
            <br />
            FUTURE COST / TOKEN LIMITS: UNCONFIGURED
            <br />
            SCOPE: SELECTED FICTIONAL BRIEF ONLY
          </p>
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-lg">Next task / human checkpoint</h3>
            {!plan ? (
              <p className="mt-4 text-xs leading-6 text-muted-foreground">
                No current task proposal. No jobs are running.
              </p>
            ) : (
              <>
                <p className="mt-4 text-xs text-warning">{plan.state} · no execution</p>
                <p className="mt-3 break-words text-xs leading-6">{plan.goal}</p>
                <ol className="mt-4 space-y-4">
                  {plan.steps.map((s) => (
                    <li key={s.id} className="border-l border-gold/30 pl-3">
                      <p className="text-xs text-gold-light">
                        {s.id} / {s.title}
                      </p>
                      <details className="mt-2 text-[10px] leading-6">
                        <summary className="cursor-pointer text-muted-foreground">
                          Scope, files, approval & cost preview
                        </summary>
                        <p>
                          {s.reason}
                          <br />
                          Affected: {s.affected.join(", ")}
                          <br />
                          Scopes: {s.scopes.join(", ")}
                          <br />
                          Depends on: {s.dependsOn.join(", ") || "none"}
                          <br />
                          Approval: {s.approval}
                          <br />
                          {s.preview}
                          <br />
                          Cost: {omniConnectors.find((c) => c.id === s.connector)?.cost}
                          <br />
                          Status: PROPOSED · NOT RUN
                        </p>
                      </details>
                    </li>
                  ))}
                </ol>
                {plan.state === "Proposed" && (
                  <form
                    className="mt-5 space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      try {
                        const f = new FormData(e.currentTarget);
                        setPlan(
                          reviewOmniPlan(
                            plan,
                            {
                              reviewer: String(f.get("reviewer")),
                              scopes: f.getAll("scope").map(String),
                              consent: f.has("consent"),
                            },
                            new Date().toISOString(),
                            paused || readCreativePause(),
                          ),
                        );
                        setNotice(
                          "Human DEMO plan review recorded. No permissions granted, no handoffs sent.",
                        );
                      } catch (err) {
                        setNotice(err instanceof Error ? err.message : "Review blocked.");
                      }
                    }}
                  >
                    <label className="block text-xs">
                      Declared human reviewer
                      <input
                        aria-label="OMNI reviewer"
                        name="reviewer"
                        required
                        minLength={2}
                        maxLength={80}
                        className="exchange-select mt-2 w-full"
                      />
                    </label>
                    {[...new Set(plan.steps.flatMap((s) => s.scopes))].map((s) => (
                      <label key={s} className="flex items-start gap-2 text-[11px] leading-5">
                        <input name="scope" value={s} type="checkbox" required />
                        Review {s}; no permission grant
                      </label>
                    ))}
                    <label className="flex items-start gap-2 text-[11px] leading-5">
                      <input name="consent" type="checkbox" required />I reviewed this proposed
                      plan; execution remains blocked.
                    </label>
                    <Button type="submit" variant="signal" size="sm" disabled={paused}>
                      <Shield size={13} />
                      Record DEMO review
                    </Button>
                  </form>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      downloadCreative("omni-temporary-plan.json", {
                        mode: "DEMO",
                        model: null,
                        authenticated: false,
                        providerCalls: 0,
                        executionAllowed: false,
                        plan,
                      })
                    }
                  >
                    <Download size={13} />
                    Export plan
                  </Button>
                  {plan.state !== "Withdrawn" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPlan({ ...plan, state: "Withdrawn" })}
                    >
                      Withdraw plan
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
          <nav className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
            <Button asChild variant="ghost" size="sm">
              <Link to="/knowledge-fusion">
                Oracle / evidence
                <ArrowUpRight size={13} />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/guardian">
                Guardian / safety
                <ArrowUpRight size={13} />
              </Link>
            </Button>
          </nav>
        </aside>
      </div>
    </main>
  );
}
