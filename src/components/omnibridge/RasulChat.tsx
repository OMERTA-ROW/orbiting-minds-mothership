/**
 * RA'SUL — OMNI Mothership's central cross-project intelligence and coordination agent.
 * Owner-only conversational front door; resident watch-agent coordination remains staged.
 * One consolidated thread (session-only, no persistence by design). Research
 * answers use the authenticated Ask Razul path with citations; status,
 * agent discovery and dispatch planning are transparent about what is
 * verified, simulated, or blocked. Dispatches always require explicit owner
 * approval and never execute while Guardian/runner are unconnected.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Send, ShieldCheck, ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-account";
import { getRazulEye } from "@/lib/razul-eye.functions";
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
  publishedAt?: string | null;
  collectedAt?: string;
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
  verified: "text-success",
  simulated: "text-warning",
  blocked: "text-destructive",
};

let counter = 0;
const nextId = () => `m${++counter}`;

export function RasulChat() {
  const { user, ready } = useAccount();
  const signedIn = ready ? !!user : null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = useServerFn(askRazul);
  const inspect = useServerFn(getRazulEye);
  const bottomRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);

  useEffect(() => () => { generation.current += 1; }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    const current = ++generation.current;
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
          const snapshot = await inspect();
          reply.label = "verified";
          reply.text = `Owner infrastructure snapshot at ${snapshot.readAt}: ${snapshot.projects.length} Passport declarations, ${snapshot.sentinels.length} Sentinel records, ${snapshot.queue.length} dispatch records. Most recent ingestion: ${snapshot.runs[0]?.status ?? "unknown"}, finished ${snapshot.runs[0]?.finished_at ?? "not recorded"}. These are recorded observations, not proof resident watchers or scraping workers are active. Guardian/executor dispatch remains blocked.`;
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

    if (generation.current === current) {
      setMessages((prev) => [...prev, ownerMsg, reply]);
      setBusy(false);
    }
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
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <Eye className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">Razul Central Intelligence</h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {signedIn === null ? "checking access…" : signedIn ? "signed in · research permission checked on request" : "sign in for live answers"}
        </span>
      </header>

      <p className="mb-3 text-sm text-muted-foreground">
        RA'SUL is OMNI Mothership's default speaking intelligence:
        searchable, permissioned historical records across enrolled owned projects and lawful public research.
        The Itanimulli game server is one participating project, not Razul's home or exclusive assignment.
      </p>
      <p className="mb-3 text-xs leading-6 text-muted-foreground">
        Proposed: his specialized research/monitoring agents across permitted public topics and
        scoped resident watchers on owner-authorized sites/apps, with sourced reports, timestamps,
        provenance, audit logs, subscriptions and transparent handoffs. No unauthorized scanning,
        blanket surveillance or entire-internet monitoring. Website policies, permissions and rate
        limits apply; recommendations never bypass Guardian or owner approval for high-impact actions.
      </p>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/omni-razul">History &amp; public-source observatory <ArrowUpRight size={14} /></Link>
      </Button>

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
                        — {c.sourceName}, {c.evidenceClass}, confidence {c.confidence} · collected {c.collectedAt ?? "not recorded"} · published {c.publishedAt ?? "not recorded"}
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
                      onClick={() => {
                        if (m.dispatch) approveDispatch(m.dispatch.id);
                      }}
                    >
                      <ShieldCheck className="mr-1 h-3 w-3" aria-hidden /> Review local request (execution blocked)
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
          maxLength={500}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <Button type="submit" disabled={busy || !input.trim()} size="sm">
          <Send className="mr-1 h-4 w-4" aria-hidden /> Send
        </Button>
      </form>
    </section>
  );
}
