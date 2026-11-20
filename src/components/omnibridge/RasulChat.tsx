/**
 * RA'SUL — OMNI Mothership's central cross-project intelligence and coordination agent.
 * Owner-only conversational front door; resident watch-agent coordination remains staged.
 * One consolidated thread (session-only, no persistence by design). Research
 * answers use the authenticated Ask Razul path with citations; status uses the
 * owner snapshot. Agent questions show each specialist's real state. Sending
 * work to specialists is not connected, so nothing is prepared or sent here.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Send, ArrowUpRight, Square } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-account";
import { getRazulEye } from "@/lib/razul-eye.functions";
import { askRazul } from "@/lib/razul-feeds.functions";
import {
  classifyIntent,
  planHandoffs,
  rasulFallbackAnswer,
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
  label: "verified" | "blocked";
  handoffs?: HandoffNote[];
  citations?: Citation[];
}

const STATUS_STYLE: Record<HandoffNote["status"], string> = {
  verified: "text-success",
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
  const [notice, setNotice] = useState("");

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    generation.current++;
    setMessages([]);
    setInput("");
    setBusy(false);
    setNotice("");
  }, [user?.id]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setNotice("");
    const current = ++generation.current;
    try {
      const intent = classifyIntent(text);
      const handoffs = planHandoffs(intent);
      const ownerMsg: ChatMessage = { id: nextId(), role: "owner", text, label: "verified" };
      const reply: ChatMessage = {
        id: nextId(),
        role: "rasul",
        text: "",
        label: "blocked",
        handoffs,
      };

      if (intent === "dispatch") {
        reply.label = "blocked";
        reply.text = rasulFallbackAnswer("dispatch", true);
      } else if (intent === "agents") {
        reply.label = "blocked";
        reply.text = rasulFallbackAnswer("agents", true);
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
            reply.text =
              answer.answerSummary +
              (answer.cached ? " (served from the 6-hour answer cache)" : "");
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
        setInput("");
      }
    } catch {
      if (generation.current === current)
        setNotice(
          "Reply failed. Your message is still here; retry when access is available. No dispatch was sent.",
        );
    } finally {
      if (generation.current === current) setBusy(false);
    }
  }

  return (
    <section aria-label="RA'SUL conversation" className="py-5">
      <header className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Eye className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-foreground">Razul Central Intelligence</h2>
            <p className="mt-1 text-xs text-muted-foreground">RA'SUL · Research & coordination</p>
          </div>
        </div>
        <span className="max-w-44 text-right text-xs text-muted-foreground">
          {signedIn === null
            ? "checking access…"
            : signedIn
              ? "signed in · research permission checked on request"
              : "sign in for live answers"}
        </span>
      </header>
      <p className="mb-4 max-w-3xl text-sm leading-6 text-muted-foreground">
        Permissioned project history and lawful public-source research. High-impact actions remain
        subject to Guardian and owner approval.
      </p>
      <details className="mb-4 border-b border-border pb-4">
        <summary>Scope & permissions</summary>
        <div className="pt-3">
          <p className="mb-3 text-sm text-muted-foreground">
            RA'SUL is OMNI Mothership's default speaking intelligence: searchable, permissioned
            historical records across enrolled owned projects and lawful public research. The
            Itanimulli game server is one participating project, not Razul's home or exclusive
            assignment.
          </p>
          <p className="mb-3 text-xs leading-6 text-muted-foreground">
            Proposed: his specialized research/monitoring agents across permitted public topics and
            scoped resident watchers on owner-authorized sites/apps, with sourced reports,
            timestamps, provenance, audit logs, subscriptions and transparent handoffs. No
            unauthorized scanning, blanket surveillance or entire-internet monitoring. Website
            policies, permissions and rate limits apply; recommendations never bypass Guardian or
            owner approval for high-impact actions.
          </p>
        </div>
      </details>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button asChild variant="ghost" size="sm" className="mb-3">
          <Link to="/omni-razul">
            Observatory &amp; history <ArrowUpRight size={14} />
          </Link>
        </Button>
        {!signedIn && (
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        )}
      </div>
      <div
        className="omni-conversation-log mb-3 space-y-3 overflow-y-auto border-y border-border py-6 pr-1"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No messages yet. Conversation is kept for this session only.
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
                <p
                  className={`mt-1 text-xs font-medium uppercase tracking-wide ${STATUS_STYLE[m.label]}`}
                >
                  {m.label}
                </p>
              )}
              {m.citations && m.citations.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
                  {m.citations.map((c) => (
                    <li key={c.url}>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline"
                      >
                        {c.title}
                      </a>{" "}
                      <span className="text-muted-foreground">
                        — {c.sourceName}, {c.evidenceClass}, confidence {c.confidence} · collected{" "}
                        {c.collectedAt ?? "not recorded"} · published{" "}
                        {c.publishedAt ?? "not recorded"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {m.handoffs && m.handoffs.length > 0 && (
              <ul
                className="mt-1 space-y-0.5 pl-3 text-xs text-muted-foreground"
                aria-label="agent handoffs"
              >
                {m.handoffs.map((h, i) => (
                  <li key={i}>
                    <span className="font-medium text-foreground">{h.agent.toUpperCase()}</span> —{" "}
                    {h.action}{" "}
                    <span className={STATUS_STYLE[h.status]}>
                      ({h.status}: {h.reason})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
        <div ref={bottomRef} />
      </div>

      {notice && (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <form onSubmit={send} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask RA'SUL a research or status question"
          aria-label="Message RA'SUL"
          maxLength={500}
          disabled={busy}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        {busy ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              generation.current++;
              setBusy(false);
              setNotice(
                "Stopped waiting for this reply. A sent research request may still finish; no dispatch or tool action was started.",
              );
            }}
          >
            <Square size={14} />
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()} size="sm">
            <Send className="mr-1 h-4 w-4" aria-hidden /> Send
          </Button>
        )}
      </form>
    </section>
  );
}
