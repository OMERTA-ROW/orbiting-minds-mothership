/**
 * RA'SUL — the owner-only conversational front door of the OMNI dashboard.
 * One consolidated thread (session-only, no persistence by design). Research
 * answers use the authenticated Ask Razul path with citations; status,
 * agent discovery and dispatch planning are transparent about what is
 * verified, simulated, or blocked. Dispatches always require explicit owner
 * approval and never execute while Guardian/runner are unconnected.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { askRazul } from "@/lib/razul-feeds.functions";
import {
  buildDispatchRequest,
  classifyIntent,
  planHandoffs,
  rasulFallbackAnswer,
  type DispatchRequest,
  type HandoffNote,
} from "@/lib/rasul-chat";

interface Citation {
  title: string;
  url: string;
  sourceName: string;
  evidenceClass: string;
  confidence: number;
}

interface ChatMessage {
  id: string;
  role: "owner" | "rasul";
  text: string;
  label: "verified" | "simulated" | "blocked";
  handoffs?: HandoffNote[];
  citations?: Citation[];
  dispatch?: DispatchRequest | undefined;
}

const STATUS_STYLE: Record<HandoffNote["status"], string> = {
  verified: "text-emerald-400",
  simulated: "text-amber-400",
  blocked: "text-red-400",
};

let counter = 0;
const nextId = () => `m${++counter}`;

export function RasulChat() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = useServerFn(askRazul);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    const intent = classifyIntent(text);
    const handoffs = planHandoffs(intent, text);
    const ownerMsg: ChatMessage = { id: nextId(), role: "owner", text, label: "verified" };
    const reply: ChatMessage = {
      id: nextId(),
      role: "rasul",
      text: "",
      label: "simulated",
      handoffs,
    };

    if (intent === "dispatch") {
      const req = buildDispatchRequest(nextId(), text);
      reply.label = "blocked";
      reply.text = req
        ? `Dispatch request prepared for ${req.target.toUpperCase()}. It needs your explicit approval, and execution stays blocked until the named prerequisite is resolved — I will not simulate a completed job.`
        : "No specialist was named. Name Jackboy, OMNI, Sabrina, JAX or Guardian so I can prepare a scoped dispatch for your approval.";
      reply.dispatch = req ?? undefined;
    } else if (intent === "agents") {
      reply.label = "verified";
      reply.text =
        "Current specialist passports and their honest states are listed below. Verified means a real connected path exists; simulated means local concept only; blocked names the missing prerequisite.";
    } else if (intent === "status") {
      if (signedIn) {
        try {
          const answer = (await ask({
            data: { question: "current project status and recent activity", agent: "omni" },
          })) as { answerSummary: string; citations: Citation[] };
          reply.label = "verified";
          reply.text = answer.answerSummary;
          reply.citations = answer.citations;
        } catch (err) {
          reply.label = "blocked";
          reply.text = `${rasulFallbackAnswer("status", true)} (${err instanceof Error ? err.message : "unknown error"})`;
        }
      } else {
        reply.label = "blocked";
        reply.text = rasulFallbackAnswer("status", false);
      }
    } else {
      // research
      if (signedIn) {
        try {
          const answer = (await ask({
            data: { question: text, agent: "omni" },
          })) as { answerSummary: string; citations: Citation[]; cached: boolean };
          reply.label = "verified";
          reply.text = answer.answerSummary + (answer.cached ? " (served from the 6-hour answer cache)" : "");
          reply.citations = answer.citations;
        } catch (err) {
          reply.label = "blocked";
          reply.text = `${rasulFallbackAnswer("research", true)} (${err instanceof Error ? err.message : "unknown error"})`;
        }
      } else {
        reply.label = "blocked";
        reply.text = rasulFallbackAnswer("research", false);
      }
    }

    setMessages((prev) => [...prev, ownerMsg, reply]);
    setBusy(false);
  }

  function approveDispatch(id: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.dispatch?.id === id
          ? {
              ...m,
              dispatch: {
                ...m.dispatch,
                status: "blocked",
                // Approval recorded; execution remains blocked by the named
                // prerequisite. Production changes and external actions always
                // need separate explicit owner approval.
              },
            }
          : m,
      ),
    );
  }

  return (
    <section aria-label="RA'SUL conversation" className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3 flex items-center gap-2">
        <Eye className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">RA'SUL — Front Door</h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {signedIn === null ? "checking access…" : signedIn ? "owner session active" : "sign in for live answers"}
        </span>
      </header>

      <div className="mb-3 max-h-96 space-y-3 overflow-y-auto pr-1" role="log" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask about public research, project status, or the specialist agents — or prepare a scoped dispatch.
            One consolidated thread, this session only; nothing is stored.
          </p>
        )}
        {messages.map((m) => (
          <article key={m.id} className={m.role === "owner" ? "ml-8" : "mr-8"}>
            <div
              className={`rounded-lg p-3 text-sm ${
                m.role === "owner" ? "bg-primary/15 text-foreground" : "bg-muted/40 text-foreground"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.role === "rasul" && (
                <p className={`mt-1 text-xs font-medium uppercase tracking-wide ${STATUS_STYLE[m.label]}`}>
                  {m.label}
                </p>
              )}
              {m.citations && m.citations.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
                  {m.citations.map((c) => (
                    <li key={c.url}>
                      <a href={c.url} target="_blank" rel="noreferrer" className="text-primary underline">
                        {c.title}
                      </a>{" "}
                      <span className="text-muted-foreground">
                        — {c.sourceName}, {c.evidenceClass}, confidence {c.confidence}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {m.dispatch && (
                <div className="mt-2 rounded border border-border p-2 text-xs">
                  <p>
                    Dispatch → <strong>{m.dispatch.target.toUpperCase()}</strong>: {m.dispatch.task}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Status: {m.dispatch.status}
                    {m.dispatch.blockedReason ? ` — ${m.dispatch.blockedReason}` : ""}
                  </p>
                  {m.dispatch.status === "pending-approval" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => approveDispatch(m.dispatch!.id)}
                    >
                      <ShieldCheck className="mr-1 h-3 w-3" aria-hidden /> Approve request (execution still blocked)
                    </Button>
                  )}
                </div>
              )}
            </div>
            {m.handoffs && m.handoffs.length > 0 && (
              <ul className="mt-1 space-y-0.5 pl-3 text-xs text-muted-foreground" aria-label="agent handoffs">
                {m.handoffs.map((h, i) => (
                  <li key={i}>
                    <span className="font-medium text-foreground">{h.agent.toUpperCase()}</span> — {h.action}{" "}
                    <span className={STATUS_STYLE[h.status]}>({h.status}: {h.reason})</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask RA'SUL, or “dispatch … to Jackboy”"
          aria-label="Message RA'SUL"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          autoFocus
        />
        <Button type="submit" disabled={busy || !input.trim()} size="sm">
          <Send className="mr-1 h-4 w-4" aria-hidden /> Send
        </Button>
      </form>
    </section>
  );
}
