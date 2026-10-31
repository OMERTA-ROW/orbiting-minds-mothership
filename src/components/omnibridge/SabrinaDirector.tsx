import { useEffect, useState, type FormEvent } from "react";
import { Radar, Trash2 } from "lucide-react";
import { ZodError } from "zod";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/evo";
import type { CampaignDraft, Prospect, SabrinaInsight } from "@/lib/omni-angel-tech";
import {
  SABRINA_STORE_KEY,
  createFeedback,
  createMemory,
  feedbackKinds,
  loadSabrinaStore,
  opportunityRadar,
  recallMemories,
  saveSabrinaStore,
  weeklyBrief,
  type FeedbackKind,
  type Opportunity,
  type SabrinaStore,
} from "@/lib/omni-sabrina";

const emptyStore: SabrinaStore = { memories: [], briefs: [], feedback: [] };
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const errorText = (error: unknown) =>
  error instanceof ZodError
    ? (error.issues[0]?.message ?? "Invalid record.")
    : error instanceof Error
      ? error.message
      : "Invalid record.";

type Props = { insights: SabrinaInsight[]; prospects: Prospect[]; drafts: CampaignDraft[] };

/**
 * Sabrina director sections: Opportunity Radar, strategic memory, weekly
 * ecosystem brief and structured Jackboy feedback. All computation is local
 * over owner-entered records; nothing is crawled, inferred, sent or connected.
 */
export function SabrinaDirector({ insights, prospects, drafts }: Props) {
  const [store, setStore] = useState<SabrinaStore>(emptyStore);
  const [radar, setRadar] = useState<Opportunity[] | null>(null);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setStore(loadSabrinaStore(localStorage.getItem(SABRINA_STORE_KEY)));
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(SABRINA_STORE_KEY, saveSabrinaStore(store));
  }, [loaded, store]);

  const activeMemories = recallMemories(store.memories, new Date());
  const latestBrief = store.briefs[0];

  function runRadar() {
    const result = opportunityRadar(insights, prospects);
    setRadar(result);
    setNotice(
      result.length
        ? "Opportunity Radar ranked local matches. Scores are keyword overlap over owner-entered records, not verified research."
        : "No matches yet. Save intelligence notes and prospects with overlapping focus areas first.",
    );
  }

  function saveMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const memory = createMemory(
        {
          lesson: text(form, "lesson"),
          source: text(form, "source"),
          confidence: Number(text(form, "confidence") || 0),
          expiresInDays: Number(text(form, "expiresInDays") || 0),
        },
        crypto.randomUUID(),
        new Date(),
      );
      setStore((current) => ({ ...current, memories: [memory, ...current.memories] }));
      setNotice("Strategic memory saved locally with provenance and expiry. No model was retrained.");
      event.currentTarget.reset();
    } catch (error) {
      setNotice(errorText(error));
    }
  }

  function deleteMemory(id: string) {
    setStore((current) => ({
      ...current,
      memories: current.memories.filter((memory) => memory.id !== id),
    }));
    setNotice("Memory deleted. Deletion stops retrieval immediately; nothing else changes.");
  }

  function generateBrief() {
    const brief = weeklyBrief(insights, prospects, drafts, store.memories, new Date());
    setStore((current) => ({ ...current, briefs: [brief, ...current.briefs].slice(0, 12) }));
    setNotice("Weekly ecosystem brief generated from local owner-entered records only.");
  }

  function saveFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const feedback = createFeedback(
        {
          kind: text(form, "kind") as FeedbackKind,
          summary: text(form, "summary"),
          relatedName: text(form, "relatedName") || undefined,
        },
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      setStore((current) => ({ ...current, feedback: [feedback, ...current.feedback] }));
      setNotice("Feedback recorded for Jackboy as a local handoff. No message was sent or queued externally.");
      event.currentTarget.reset();
    } catch (error) {
      setNotice(errorText(error));
    }
  }

  return (
    <>
      {notice && (
        <p
          role="status"
          className="mt-6 border border-gold/30 bg-accent/20 px-4 py-3 text-xs leading-6 text-gold-light"
        >
          {notice}
        </p>
      )}

      <section className="mt-8 border border-border p-5" aria-labelledby="opportunity-radar">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="opportunity-radar" className="text-2xl">
              4 · Opportunity Radar
            </h2>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-muted-foreground">
              Ranks intelligence notes against recorded prospects by shared focus terms,
              compatibility evidence and approval state. Gated matches are shown with their
              blockers and are never auto-advanced.
            </p>
          </div>
          <Button variant="cosmic" size="sm" onClick={runRadar}>
            <Radar size={14} /> Run radar
          </Button>
        </div>
        {radar !== null && (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {radar.length === 0 ? (
              <p className="text-xs leading-6 text-muted-foreground">No opportunities matched.</p>
            ) : (
              radar.map((opportunity) => (
                <article
                  key={`${opportunity.insightId}-${opportunity.prospectId}`}
                  className="border border-border/70 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg text-gold-light">
                      {opportunity.invention} × {opportunity.prospectName}
                    </h3>
                    <DemoBadge
                      label={opportunity.gate === "gated" ? "GATED" : "READY FOR REVIEW"}
                    />
                  </div>
                  <p className="mt-2 font-mono text-xs text-gold">
                    Match {opportunity.score}/100
                  </p>
                  <ul className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
                    {opportunity.reasons.map((reason) => (
                      <li key={reason}>· {reason}</li>
                    ))}
                  </ul>
                  {opportunity.gateReasons.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs leading-5 text-warning">
                      {opportunity.gateReasons.map((reason) => (
                        <li key={reason}>Blocked: {reason}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))
            )}
          </div>
        )}
      </section>

      <section className="mt-8 border border-border p-5" aria-labelledby="strategic-memory">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="strategic-memory" className="text-2xl">
              5 · Strategic memory
            </h2>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-muted-foreground">
              Consented local lessons with provenance, confidence and expiry. This is not model
              retraining or self-modification; deletion stops retrieval immediately.
            </p>
          </div>
          <DemoBadge label="LOCAL · NOT MODEL TRAINING" />
        </div>
        <form className="mt-5 grid gap-4 lg:grid-cols-2" onSubmit={saveMemory}>
          <label className="block text-xs lg:col-span-2">
            Lesson
            <textarea
              required
              name="lesson"
              minLength={10}
              className="exchange-select mt-1 min-h-20 w-full"
              placeholder="What Sabrina should remember when planning…"
            />
          </label>
          <label className="block text-xs">
            Source / provenance
            <input required name="source" className="exchange-select mt-1 w-full" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-xs">
              Confidence (0–100)
              <input
                required
                name="confidence"
                type="number"
                min="0"
                max="100"
                defaultValue="50"
                className="exchange-select mt-1 w-full"
              />
            </label>
            <label className="block text-xs">
              Expires in days (1–365)
              <input
                required
                name="expiresInDays"
                type="number"
                min="1"
                max="365"
                defaultValue="90"
                className="exchange-select mt-1 w-full"
              />
            </label>
          </div>
          <div className="lg:col-span-2">
            <Button type="submit" variant="cosmic">
              Save memory
            </Button>
          </div>
        </form>
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {activeMemories.length === 0 ? (
            <p className="text-xs leading-6 text-muted-foreground">No active strategic memories.</p>
          ) : (
            activeMemories.map((memory) => (
              <article key={memory.id} className="border border-border/70 p-4">
                <p className="text-xs leading-6">{memory.lesson}</p>
                <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
                  Source: {memory.source} · confidence {memory.confidence}% · expires{" "}
                  {memory.expiresAt.slice(0, 10)}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-3"
                  onClick={() => deleteMemory(memory.id)}
                >
                  <Trash2 size={13} /> Delete (stops retrieval)
                </Button>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="mt-8 border border-border p-5" aria-labelledby="weekly-brief">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="weekly-brief" className="text-2xl">
              6 · Weekly ecosystem brief
            </h2>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-muted-foreground">
              Aggregates local notes, prospects, drafts and active memories into a dated planning
              brief. Generated on demand; no scheduled job or delivery exists.
            </p>
          </div>
          <Button variant="cosmic" size="sm" onClick={generateBrief}>
            Generate brief
          </Button>
        </div>
        {latestBrief && (
          <pre className="mt-5 whitespace-pre-wrap border border-gold/25 bg-accent/10 p-4 text-xs leading-6 text-muted-foreground">
            {latestBrief.body}
          </pre>
        )}
      </section>

      <section className="mt-8 border border-border p-5" aria-labelledby="jackboy-feedback">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="jackboy-feedback" className="text-2xl">
              7 · Structured feedback to Jackboy
            </h2>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-muted-foreground">
              Records capability gaps, quality notes, defensive-security concerns and partnership
              signals for Jackboy review. Local handoff only; no task is dispatched.
            </p>
          </div>
          <DemoBadge label="LOCAL HANDOFF" />
        </div>
        <form className="mt-5 grid gap-4 lg:grid-cols-2" onSubmit={saveFeedback}>
          <label className="block text-xs">
            Kind
            <select name="kind" className="exchange-select mt-1 w-full" defaultValue="capability-gap">
              {feedbackKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind.replaceAll("-", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Related prospect or note (optional)
            <input name="relatedName" className="exchange-select mt-1 w-full" />
          </label>
          <label className="block text-xs lg:col-span-2">
            Summary
            <textarea
              required
              name="summary"
              minLength={10}
              className="exchange-select mt-1 min-h-20 w-full"
            />
          </label>
          <div className="lg:col-span-2">
            <Button type="submit" variant="cosmic">
              Record feedback
            </Button>
          </div>
        </form>
        <ul className="mt-6 space-y-3">
          {store.feedback.map((item) => (
            <li key={item.id} className="border border-border/70 p-4 text-xs leading-6">
              <span className="font-mono text-[10px] uppercase text-gold">
                {item.kind.replaceAll("-", " ")}
              </span>
              {item.relatedName && (
                <span className="text-muted-foreground"> · {item.relatedName}</span>
              )}
              <p className="mt-1">{item.summary}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {item.createdAt.slice(0, 10)} · local handoff, not dispatched
              </p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
