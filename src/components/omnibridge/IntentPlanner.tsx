import { useState } from "react";
import { useOmniDownload } from "@/hooks/use-omni-download";
import { Check, Download, GitBranch, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { omniGoalExamples, omniConnectors } from "@/data/evolution";
import { omniExport, type OmniCommand, type OmniStore, type OmniTarget } from "@/lib/omnibridge";
import { downloadOmni } from "./CapabilityGraph";
export function IntentPlanner({
  store,
  worldId,
  paused,
  ready,
  dispatch,
}: {
  store: OmniStore;
  worldId: string;
  paused: boolean;
  ready: boolean;
  dispatch: (c: OmniCommand) => void;
}) {
  const { download, downloadNotice } = useOmniDownload();
  const [goal, setGoal] = useState(""),
    [targets, setTargets] = useState<OmniTarget[]>([]),
    [consent, setConsent] = useState(false),
    [selected, setSelected] = useState(""),
    [issue, setIssue] = useState("");
  const plans = store.plans.filter((p) => p.projectId === worldId);
  const p = plans.find((v) => v.id === selected) ?? plans.at(-1);
  const run = (c: OmniCommand) => {
    try {
      dispatch(c);
      setIssue("Recorded locally. No provider called, files changed or tool executed.");
      return true;
    } catch (e) {
      setIssue(e instanceof Error ? e.message : "Action blocked");
      return false;
    }
  };
  return (
    <div>
      {downloadNotice && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          {downloadNotice}
        </p>
      )}
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <section className="min-w-0">
          <p className="eyebrow">Intent / explainable proposal</p>
          <h2 className="mt-4 text-2xl">A goal. A visible chain.</h2>
          <p className="mt-4 text-xs leading-6 text-muted-foreground">
            DEMO keyword templates · not an OMNI model response · no inference provider configured
            for OmniBridge.
          </p>
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              run({ type: "propose", input: { projectId: worldId, goal, targets, consent } });
            }}
          >
            <label className="text-xs text-gold-light" htmlFor="omni-goal">
              Non-sensitive goal
            </label>
            <textarea
              id="omni-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              minLength={10}
              maxLength={2000}
              required
              rows={5}
              className="mt-3 w-full resize-y rounded-sm border border-input bg-background p-4 text-sm leading-6"
              placeholder="Prepare a reviewed scene pipeline for this sample world…"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {omniGoalExamples.map((v) => (
                <Button
                  type="button"
                  key={v.label}
                  size="sm"
                  variant="ghost"
                  onClick={() => setGoal(v.goal)}
                >
                  {v.label}
                </Button>
              ))}
            </div>
            <fieldset className="mt-6">
              <legend className="text-xs text-gold-light">
                Explicit draft routing · nothing sent
              </legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    { id: "local", label: "Local template" },
                    { id: "openai", label: "OpenAI draft" },
                    { id: "anthropic", label: "Anthropic draft" },
                  ] as const
                ).map((t) => (
                  <Button
                    key={t.id}
                    type="button"
                    size="sm"
                    variant={targets.includes(t.id) ? "signal" : "ghost"}
                    aria-pressed={targets.includes(t.id)}
                    onClick={() =>
                      setTargets((prev) =>
                        prev.includes(t.id) ? prev.filter((v) => v !== t.id) : [...prev, t.id],
                      )
                    }
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </fieldset>
            <label className="mt-6 flex items-start gap-3 text-xs leading-5 text-muted-foreground">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1"
                required
              />
              I consent to storing fictional goal text in this editable browser only; no credentials
              or private data.
            </label>
            <Button type="submit" variant="cosmic" className="mt-6" disabled={!ready || paused}>
              <Send size={14} />
              Propose task plan
            </Button>
          </form>
          {issue && (
            <p
              role="status"
              className="mt-5 border-l border-warning pl-4 text-xs leading-6 text-warning"
            >
              {issue}
            </p>
          )}
          <div className="mt-8 border-t border-border pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg">This world’s records</h3>
              <Button
                variant="ghost"
                size="icon"
                title="Export this world’s DEMO plans"
                aria-label="Export this world’s DEMO plans"
                onClick={() =>
                  download(() =>
                    downloadOmni(omniExport(store, worldId), "omnibridge-world-demo.json"),
                  )
                }
              >
                <Download size={15} />
              </Button>
            </div>
            {plans.length ? (
              <div className="mt-3 space-y-2">
                {plans
                  .slice()
                  .reverse()
                  .map((v) => (
                    <Button
                      key={v.id}
                      variant="ghost"
                      className="h-auto w-full justify-start whitespace-normal border-b border-border px-0 py-4 text-left"
                      onClick={() => setSelected(v.id)}
                      aria-pressed={p?.id === v.id}
                    >
                      <span className="min-w-0">
                        <span className="line-clamp-2 block break-words text-xs">{v.goal}</span>
                        <span className="mt-2 block font-mono text-[9px] text-warning">
                          {v.state}
                        </span>
                      </span>
                    </Button>
                  ))}
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">No local plan in this world.</p>
            )}
          </div>
        </section>
        <section
          className="min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
          aria-label="Explainable task plan"
        >
          {p ? (
            <>
              <div className="flex flex-wrap justify-between gap-3">
                <h2 className="text-2xl">Plan preview</h2>
                <span className="font-mono text-[10px] text-warning">{p.state.toUpperCase()}</span>
              </div>
              <p className="mt-4 break-words text-sm leading-6">{p.goal}</p>
              <p className="mt-3 font-mono text-[10px] text-muted-foreground">
                LOCAL RECORD · 0 PROVIDER CALLS · EXECUTION BLOCKED
              </p>
              <ol className="mt-6 divide-y divide-border">
                {p.steps.map((s, i) => (
                  <li key={s.id} className="py-5">
                    <div className="flex items-start gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-gold/30 font-mono text-[10px] text-gold-light">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-sans text-sm font-semibold">{s.title}</h3>
                        <p className="mt-2 text-[10px] text-warning">
                          {omniConnectors.find((c) => c.id === s.connector)?.state} ·{" "}
                          {s.highImpact ? "HUMAN CHECKPOINT" : "SCOPED SOURCE REVIEW"}
                        </p>
                        <p className="mt-3 text-xs leading-6 text-muted-foreground">{s.reason}</p>
                        <details className="mt-3 text-xs">
                          <summary className="cursor-pointer text-gold-light">
                            Data, scopes & action preview
                          </summary>
                          <dl className="mt-3 space-y-3 leading-6 text-muted-foreground">
                            <div>
                              <dt className="text-foreground">Affected data / files</dt>
                              <dd className="break-words">{s.affected.join(" · ")}</dd>
                            </div>
                            <div>
                              <dt className="text-foreground">Required scopes</dt>
                              <dd className="break-words font-mono text-[10px]">
                                {s.scopes.join(" · ")}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-foreground">Preview / approval</dt>
                              <dd>
                                {s.preview} {s.approval}
                              </dd>
                            </div>
                            <div>
                              <dt className="flex items-center gap-2 text-foreground">
                                <GitBranch size={12} />
                                Dependencies
                              </dt>
                              <dd>{s.dependsOn.join(", ") || "No prior step"}</dd>
                            </div>
                          </dl>
                        </details>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="space-y-3 border-y border-border py-5">
                {p.notices.map((n) => (
                  <p key={n} className="text-[11px] leading-6 text-warning">
                    {n}
                  </p>
                ))}
              </div>
              {p.state === "Proposed" && (
                <form
                  key={p.id}
                  className="mt-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    run({
                      type: "review",
                      planId: p.id,
                      projectId: worldId,
                      input: {
                        reviewer: String(f.get("reviewer")),
                        scopes: f.getAll("scope").map(String),
                        consent: f.has("consent"),
                      },
                    });
                  }}
                >
                  <h3 className="text-lg">Human review · DEMO declaration</h3>
                  <label className="mt-4 block text-xs text-muted-foreground">
                    Declared human reviewer
                    <input
                      aria-label="Declared human reviewer"
                      name="reviewer"
                      minLength={2}
                      maxLength={80}
                      required
                      className="mt-2 h-10 w-full rounded-sm border border-input bg-background px-3 text-sm"
                    />
                  </label>
                  <fieldset className="mt-5 space-y-3">
                    <legend className="mb-3 text-xs text-gold-light">
                      Review every scope · no real grant
                    </legend>
                    {[...new Set(p.steps.flatMap((s) => s.scopes))].map((s) => (
                      <label
                        key={s}
                        className="flex items-start gap-3 break-words font-mono text-[10px] text-muted-foreground"
                      >
                        <input type="checkbox" name="scope" value={s} required />
                        {s}
                      </label>
                    ))}
                  </fieldset>
                  <label className="mt-5 flex items-start gap-3 text-xs leading-5 text-muted-foreground">
                    <input type="checkbox" name="consent" required className="mt-1" />I reviewed
                    affected samples, high-impact checkpoints and missing evidence. This is not
                    execution approval or verified identity.
                  </label>
                  <Button
                    type="submit"
                    variant="signal"
                    className="mt-5"
                    disabled={paused || !ready}
                  >
                    <Check size={14} />
                    Record human review
                  </Button>
                </form>
              )}
              {p.reviewer && (
                <p className="mt-5 text-xs text-muted-foreground">
                  Declared review: {p.reviewer} · {p.reviewedAt} · local / unauthenticated
                </p>
              )}
              {p.state !== "Withdrawn" && (
                <Button
                  variant="ghost"
                  className="mt-4 px-0 text-warning"
                  onClick={() => run({ type: "withdraw", planId: p.id, projectId: worldId })}
                >
                  <X size={14} />
                  Withdraw local plan
                </Button>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                Withdrawal changes this record only. No file/device rollback is available.
              </p>
              <h3 className="mt-6 text-lg">Editable local history</h3>
              {store.events
                .filter((e) => e.planId === p.id)
                .map((e) => (
                  <p
                    key={e.id}
                    className="mt-3 border-l border-gold/25 pl-3 text-[10px] leading-5 text-muted-foreground"
                  >
                    {e.action} · {e.at}
                  </p>
                ))}
            </>
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center text-center">
              <GitBranch className="text-gold" size={32} />
              <h2 className="mt-5 text-xl">No proposal yet</h2>
              <p className="mt-4 max-w-sm text-xs leading-6 text-muted-foreground">
                No model reply, external activity, test result or executed task exists.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
