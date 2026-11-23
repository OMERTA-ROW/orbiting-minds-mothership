import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Square, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OwnerCodeForm } from "@/components/account/OwnerCodeForm";
import {
  createFusionSession,
  deleteFusionSession,
  listFusionSessions,
  runFusionReply,
  stopFusionSession,
  type DuoSessionRow,
} from "@/lib/fusion-duo.functions";
import {
  DEFAULT_FUSION_ENGINES,
  FUSION_DUO_LIMITS,
  FUSION_DUO_NAME,
  fusionClaudeWorstCaseCents,
  fusionReasonText,
  fusionSessionInput,
  speakerFor,
  type FusionDuoAgent,
  type FusionEngines,
} from "@/lib/fusion-duo";
import { readClaudeStatus } from "@/lib/claude-engine.functions";
import { DEFAULT_ENGINE_ID, ENGINE_IDS, engineById } from "@/lib/omni-engines";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-60";
const nameOf = (a: string) => FUSION_DUO_NAME[a as FusionDuoAgent] ?? a;
const engineLabel = (id: string) => engineById(id)?.label ?? "Unknown engine";
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
type EngineId = (typeof ENGINE_IDS)[number];

/** Owner-approved Fusion sessions where Dread and Draco take turns, one owner click per reply. */
export function FusionDuo() {
  const list = useServerFn(listFusionSessions);
  const create = useServerFn(createFusionSession);
  const run = useServerFn(runFusionReply);
  const stop = useServerFn(stopFusionSession);
  const remove = useServerFn(deleteFusionSession);
  const readClaude = useServerFn(readClaudeStatus);
  const [engines, setEngines] = useState<FusionEngines>(DEFAULT_FUSION_ENGINES);
  /** Claude model the owner has switched on per agent (Claude tab), or null. */
  const [claudeFor, setClaudeFor] = useState<Partial<Record<FusionDuoAgent, string>>>({});
  const [sessions, setSessions] = useState<DuoSessionRow[] | null>(null);
  const [topic, setTopic] = useState("");
  const [firstAgent, setFirstAgent] = useState<FusionDuoAgent>("draco");
  const [maxReplies, setMaxReplies] = useState(4);
  const [askCode, setAskCode] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await list();
      if (!r.ok) {
        setNotice(r.message);
        setSessions([]);
        return;
      }
      setSessions(r.sessions);
    } catch {
      setNotice("Sessions could not be read. Refresh and retry.");
      setSessions([]);
    }
  }, [list]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    readClaude()
      .then((r) => {
        if (!r.ok) return;
        const on: Partial<Record<FusionDuoAgent, string>> = {};
        for (const row of r.settings)
          if ((row.agent_id === "dread" || row.agent_id === "draco") && row.enabled)
            on[row.agent_id] = row.model;
        setClaudeFor(on);
      })
      .catch(() => setClaudeFor({}));
  }, [readClaude]);
  const worstCase = fusionClaudeWorstCaseCents(firstAgent, maxReplies, engines);

  const open = sessions?.find((s) => s.status === "open") ?? null;
  const past = sessions?.filter((s) => s.status !== "open") ?? [];

  function startApproval() {
    const parsed = fusionSessionInput.safeParse({
      topic,
      firstAgent,
      maxReplies,
      dreadEngine: engines.dread,
      dracoEngine: engines.draco,
    });
    if (!parsed.success) return setNotice(parsed.error.issues[0]?.message ?? "Check the session.");
    setNotice(null);
    setAskCode(true);
  }

  async function approve() {
    setBusy("create");
    setNotice("Approving session…");
    try {
      const r = await create({
        data: {
          topic,
          firstAgent,
          maxReplies,
          dreadEngine: engines.dread as EngineId,
          dracoEngine: engines.draco as EngineId,
        },
      });
      if (!r.ok) return setNotice(r.message);
      setTopic("");
      setAskCode(false);
      setNotice(`Session approved for ${maxReplies} replies. Nothing runs until you click.`);
      await load();
    } catch {
      setNotice("Not confirmed. Refresh before retrying.");
    } finally {
      setBusy(null);
    }
  }

  async function nextReply(s: DuoSessionRow) {
    setBusy("reply");
    const done = s.turns.filter((t) => t.status === "completed").length;
    setNotice(`${nameOf(speakerFor(s.first_agent as FusionDuoAgent, done + 1))} is replying…`);
    try {
      const r = await run({ data: { sessionId: s.id } });
      setNotice(r.ok ? (r.sessionFinished ? "Session finished." : null) : r.message);
      await load();
    } catch {
      setNotice("Not confirmed. Refresh before retrying; nothing is retried automatically.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function stopSession(id: string) {
    setBusy("stop");
    try {
      const r = await stop({ data: { sessionId: id } });
      setNotice(r.ok ? "Session stopped. A reply in progress stops within a second." : r.message);
      await load();
    } catch {
      setNotice("Not confirmed. Refresh and retry.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSession(id: string) {
    setBusy("delete");
    try {
      const r = await remove({ data: { sessionId: id } });
      setNotice(r.ok ? "Session deleted." : r.message);
      await load();
    } catch {
      setNotice("Not confirmed. Refresh and retry.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="fusion-duo" className="space-y-4">
      <div className="space-y-1">
        <h2 id="fusion-duo" className="flex items-center gap-2 text-sm font-medium">
          <Users size={16} aria-hidden /> Fusion: Dread &amp; Draco
        </h2>
        <p role="note" className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
          Dread and Draco take turns on your topic, each in its own voice. You approve a session
          with a fresh two-step code, then click for every reply. Limits:{" "}
          {FUSION_DUO_LIMITS.minReplies}–{FUSION_DUO_LIMITS.maxReplies} replies per session, up to{" "}
          {FUSION_DUO_LIMITS.replyChars.toLocaleString()} characters each,{" "}
          {FUSION_DUO_LIMITS.sessionsPerDay} sessions and {FUSION_DUO_LIMITS.repliesPerDay} replies
          per 24 hours, one AI request at a time. A reply runs only while the Emergency Stop is
          released and AI is approved, and stops within a second if either changes. They can't run
          anything, approve, spend or touch the Stop. Each reply is one small paid AI call.
        </p>
      </div>

      {open ? (
        <div className="space-y-3 rounded-lg border bg-card p-4 text-sm">
          <p className="font-medium">Open session</p>
          <p className="whitespace-pre-wrap break-words text-muted-foreground">{open.topic}</p>
          <p className="text-xs text-muted-foreground">
            Engines (fixed for this session): Dread · {engineLabel(open.engines.dread)}, Draco ·{" "}
            {engineLabel(open.engines.draco)}
          </p>
          <Transcript session={open} />
          {(() => {
            const done = open.turns.filter((t) => t.status === "completed").length;
            const attempts = open.turns.length;
            const next = nameOf(speakerFor(open.first_agent as FusionDuoAgent, done + 1));
            const outOfAttempts = attempts >= open.max_replies + FUSION_DUO_LIMITS.extraAttempts;
            return (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={busy !== null || outOfAttempts}
                  onClick={() => void nextReply(open)}
                >
                  Run reply {done + 1} of {open.max_replies} ({next})
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy === "stop"}
                  onClick={() => void stopSession(open.id)}
                >
                  <Square size={14} aria-hidden /> Stop session
                </Button>
                {outOfAttempts && (
                  <span className="text-xs text-muted-foreground">
                    {fusionReasonText("attempt_limit")}
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        <form
          className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            startApproval();
          }}
        >
          <label className="space-y-1 text-sm md:col-span-2">
            Topic for Dread and Draco (no keys or tokens)
            <Textarea
              rows={3}
              maxLength={FUSION_DUO_LIMITS.topicChars}
              value={topic}
              disabled={askCode}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. How should we roll out the new task view safely?"
            />
          </label>
          <label className="space-y-1 text-sm">
            Who speaks first
            <select
              className={selectClass}
              value={firstAgent}
              disabled={askCode}
              onChange={(e) => setFirstAgent(e.target.value as FusionDuoAgent)}
            >
              <option value="draco">Draco (proposes a plan)</option>
              <option value="dread">Dread (investigates first)</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Replies to approve
            <select
              className={selectClass}
              value={maxReplies}
              disabled={askCode}
              onChange={(e) => setMaxReplies(Number(e.target.value))}
            >
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} replies
                </option>
              ))}
            </select>
          </label>
          {(["dread", "draco"] as const).map((a) => {
            const claude = claudeFor[a];
            return (
              <label key={a} className="space-y-1 text-sm">
                {FUSION_DUO_NAME[a]}'s engine
                <select
                  className={selectClass}
                  value={engines[a]}
                  disabled={askCode}
                  onChange={(e) => setEngines((prev) => ({ ...prev, [a]: e.target.value }))}
                >
                  <option value={DEFAULT_ENGINE_ID}>{engineLabel(DEFAULT_ENGINE_ID)}</option>
                  {claude && <option value={claude}>{engineLabel(claude)}</option>}
                </select>
                {!claude && (
                  <span className="block text-xs text-muted-foreground">
                    Claude is off for {FUSION_DUO_NAME[a]}. Turn it on in the Claude tab to choose
                    it.
                  </span>
                )}
              </label>
            );
          })}
          <p className="text-xs text-muted-foreground md:col-span-2">
            {worstCase > 0
              ? `Claude cost for this session: at most ${usd(worstCase)} (each Claude reply or retry up to $0.50). The $5-a-day Claude limit still applies, and the engines can't change after you approve.`
              : "Both agents use the current engine. The engines can't change after you approve."}
          </p>
          <div className="md:col-span-2">
            {askCode ? (
              <div className="space-y-2">
                <OwnerCodeForm
                  intro={`Enter your two-step code to approve up to ${maxReplies} replies. Each still needs your click.`}
                  successText="Verified."
                  disabled={busy !== null}
                  onVerified={approve}
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => setAskCode(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button type="submit" disabled={busy !== null}>
                Approve session…
              </Button>
            )}
          </div>
        </form>
      )}

      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      <div className="space-y-2">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Past sessions</h3>
        {sessions === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {sessions !== null && past.length === 0 && (
          <p className="text-sm text-muted-foreground">No finished sessions yet.</p>
        )}
        {past.map((s) => (
          <details key={s.id} className="rounded-lg border bg-card p-3 text-sm">
            <summary className="cursor-pointer">
              {s.topic.slice(0, 80)}
              {s.topic.length > 80 ? "…" : ""} · {s.status} ·{" "}
              {new Date(s.created_at).toLocaleString()}
            </summary>
            <div className="mt-3 space-y-3">
              <Transcript session={s} />
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => void deleteSession(s.id)}
              >
                <Trash2 size={14} aria-hidden /> Delete session
              </Button>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function Transcript({ session }: { session: DuoSessionRow }) {
  if (session.turns.length === 0)
    return <p className="text-xs text-muted-foreground">No replies yet.</p>;
  return (
    <ol className="space-y-2">
      {session.turns.map((t) => (
        <li key={t.id} className="space-y-1 rounded-md border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {nameOf(t.agent_id)} · reply {t.turn_no} · {t.status}·{" "}
            {engineById(t.model)?.attribution ?? "Unknown engine"}
          </p>
          {t.reply ? (
            <p className="whitespace-pre-wrap break-words">{t.reply}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t.status === "running"
                ? "Writing…"
                : fusionReasonText(t.error_reason ?? "provider_error")}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
