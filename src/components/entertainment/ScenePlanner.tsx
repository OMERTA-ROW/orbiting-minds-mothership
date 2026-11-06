import { useState } from "react";
import { Check, Download, History, Save, Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { entertainmentStudios } from "@/data/evolution";
import {
  creativeRoles,
  type CreativeStore,
  type CreativeCommand,
  type CreativePlan,
  type CreativeStep,
  creativeExport,
} from "@/lib/entertainment";
import { downloadCreative } from "./CreativeRegistry";
import storyboard from "@/assets/entertainment-storyboard.jpg";
export function ScenePlanner({
  store,
  worldId,
  selectedId,
  paused,
  dispatch,
}: {
  store: CreativeStore;
  worldId: string;
  selectedId: string;
  paused: boolean;
  dispatch: (c: CreativeCommand) => void;
}) {
  const [chosen, setChosen] = useState(selectedId),
    [notice, setNotice] = useState("");
  const plans = store.plans.filter((p) => p.worldId === worldId);
  const plan = plans.find((p) => p.id === chosen) ?? plans.at(-1);
  const run = (c: CreativeCommand) => {
    try {
      dispatch(c);
      setNotice(
        c.type === "review"
          ? "Human DEMO review recorded. Publishing and execution remain blocked."
          : c.type === "restore"
            ? "Local planning checkpoint restored as a new revision. No media restored."
            : "Local sample record updated; no tools called.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Local action blocked.");
    }
  };
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow">Scene-to-Screen / local planning</p>
          <h2 className="mt-4 text-3xl">Every frame starts with intent.</h2>
        </div>
        <Button
          variant="signal"
          size="sm"
          onClick={() =>
            downloadCreative("scene-to-screen-demo.json", creativeExport(store, worldId))
          }
        >
          <Download size={14} />
          Export this world
        </Button>
      </div>
      {notice && (
        <p
          role="status"
          className="mt-5 border-l border-warning px-4 py-3 text-xs leading-6 text-warning"
        >
          {notice}
        </p>
      )}
      {plans.length > 0 && (
        <label className="mt-6 block text-xs text-muted-foreground">
          Local plan
          <select
            aria-label="Saved creative plan"
            value={plan?.id ?? ""}
            onChange={(e) => setChosen(e.target.value)}
            className="exchange-select mt-2 w-full"
          >
            {plans.map((p) => (
              <option value={p.id} key={p.id}>
                {p.goal.slice(0, 85)} · v{p.revision} · {p.state}
              </option>
            ))}
          </select>
        </label>
      )}
      {!plan ? (
        <p className="mt-8 border-y border-border py-12 text-sm text-muted-foreground">
          No plans in this world. Start with a DEMO template or creative brief.
        </p>
      ) : (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-5 border-y border-border py-5">
            <div>
              <p className="font-mono text-[10px] text-warning">
                {plan.state.toUpperCase()} · v{plan.revision} · UNSIGNED
              </p>
              <p className="mt-3 text-sm">
                {entertainmentStudios.find((s) => s.id === plan.studioId)?.name}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {plan.steps.reduce((n, s) => n + s.duration, 0)} s storyboard · provider cost:
              unconfigured · requests: 0
            </p>
          </div>
          <p className="mt-5 break-words text-sm leading-7">{plan.goal}</p>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {plan.steps.map((s, i) => (
              <ProcessCard
                key={`${plan.id}-${plan.revision}-${s.id}`}
                step={s}
                plan={plan}
                index={i}
                paused={paused}
                save={(patch) =>
                  run({ type: "edit", planId: plan.id, worldId, stepId: s.id, patch })
                }
              />
            ))}
          </div>
          <div className="mt-9 grid gap-8 border-t border-border pt-6 lg:grid-cols-2">
            <div>
              <h3 className="text-xl">Rights / credits / delivery</h3>
              <p className="mt-4 break-words text-xs leading-6 text-muted-foreground">
                Credit declaration: {plan.credit}
                <br />
                Source rights: {plan.rights}
                <br />
                Destination: {plan.destination}
                <br />
                Actual asset storage: none · external media sharing: none
              </p>
              <p className="mt-4 text-xs leading-6 text-warning">
                No private media accepted. Rights declarations are not verified licenses. Generation
                and third-party distribution require separate approvals.
              </p>
              <details className="mt-5">
                <summary className="flex cursor-pointer items-center gap-2 text-xs text-gold-light">
                  <History size={14} />
                  Version checkpoints / local only
                </summary>
                <div className="mt-4 space-y-3">
                  {plan.checkpoints.map((cp) => (
                    <div
                      key={cp.revision}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground">
                        v{cp.revision} · {cp.at}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={
                          paused || plan.state === "Withdrawn" || cp.revision === plan.revision
                        }
                        onClick={() =>
                          run({ type: "restore", planId: plan.id, worldId, revision: cp.revision })
                        }
                      >
                        Restore plan v{cp.revision}
                      </Button>
                    </div>
                  ))}
                </div>
              </details>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-xl">
                <Shield size={18} className="text-gold" />
                Human review / publication gate
              </h3>
              {plan.state === "Proposed" ? (
                <form
                  key={`${plan.id}-${plan.revision}`}
                  className="mt-5 space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    run({
                      type: "review",
                      planId: plan.id,
                      worldId,
                      reviewer: String(f.get("reviewer")),
                      scopes: f.getAll("scope").map(String),
                      rights: f.has("rights"),
                      privacy: f.has("privacy"),
                      publicationIntent: f.has("publication"),
                    });
                  }}
                >
                  <label className="block text-xs text-muted-foreground">
                    Declared human reviewer
                    <input
                      name="reviewer"
                      aria-label="Creative human reviewer"
                      minLength={2}
                      maxLength={80}
                      required
                      className="exchange-select mt-2 w-full"
                    />
                  </label>
                  {[...new Set(plan.steps.flatMap((s) => s.scopes))].map((s) => (
                    <label key={s} className="flex items-start gap-2 text-xs leading-5">
                      <input className="mt-1" name="scope" value={s} type="checkbox" required />
                      Review scope: {s} · declaration, not permission
                    </label>
                  ))}
                  <label className="flex items-start gap-2 text-xs leading-5">
                    <input className="mt-1" type="checkbox" name="rights" required />I reviewed
                    sample rights, likeness and creator credits.
                  </label>
                  <label className="flex items-start gap-2 text-xs leading-5">
                    <input className="mt-1" type="checkbox" name="privacy" required />I reviewed
                    sample privacy; no confidential media is included.
                  </label>
                  {plan.destination !== "No distribution" && (
                    <label className="flex items-start gap-2 text-xs leading-5">
                      <input className="mt-1" type="checkbox" name="publication" required />I
                      confirm this publication-intent rehearsal only; no platform is authorized and
                      nothing will publish.
                    </label>
                  )}
                  <Button type="submit" variant="signal" disabled={paused}>
                    <Check size={14} />
                    Record human DEMO review
                  </Button>
                </form>
              ) : (
                <p className="mt-5 text-xs leading-6 text-warning">
                  {plan.state === "Withdrawn"
                    ? "Consent withdrawn; editing and review blocked."
                    : `Review declared by ${plan.review?.reviewer} for v${plan.review?.revision}. Not verified identity, evidence or publishing authorization.`}
                </p>
              )}
              <p className="mt-5 font-mono text-[10px] leading-6 text-warning">
                PUBLICATION: BLOCKED · TESTS: NOT RUN · SIGNATURE: NONE
              </p>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                Secure owner accounts, authorized destination, source-rights/privacy validation,
                independent tests and final publication confirmation remain required. Local status
                does not bypass them.
              </p>
              {plan.state !== "Withdrawn" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4"
                  onClick={() => run({ type: "withdraw", planId: plan.id, worldId })}
                >
                  <X size={14} />
                  Withdraw local consent
                </Button>
              )}
            </div>
          </div>
          <div className="mt-8 border-t border-border pt-5">
            <h3 className="text-xl">This browser’s plan history</h3>
            {store.events
              .filter((e) => e.planId === plan.id)
              .slice(-6)
              .reverse()
              .map((e, i) => (
                <p
                  key={`${e.at}-${i}`}
                  className="mt-4 border-l border-gold/30 pl-4 text-xs text-muted-foreground"
                >
                  {e.action} · v{e.revision}
                  <time className="mt-2 block font-mono text-[10px]">{e.at}</time>
                </p>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}
function ProcessCard({
  step,
  plan,
  index,
  paused,
  save,
}: {
  step: CreativeStep;
  plan: CreativePlan;
  index: number;
  paused: boolean;
  save: (patch: Pick<CreativeStep, "title" | "shot" | "duration" | "role" | "status">) => void;
}) {
  const [edit, setEdit] = useState(false);
  const blocked = paused || plan.state === "Withdrawn";
  return (
    <article className="min-w-0 overflow-hidden rounded-sm border border-border">
      <div className="relative aspect-video">
        <img
          src={storyboard}
          alt={`Generated fictional lunar concept still reused for shot ${index + 1}; not a rendered sequence`}
          width={1536}
          height={864}
          loading="lazy"
          className="h-full w-full object-cover"
        />
        <span className="absolute bottom-3 left-3 bg-background/90 px-2 py-1 font-mono text-[9px] text-gold-light">
          SHOT {String(index + 1).padStart(2, "0")} · CONCEPT STILL
        </span>
      </div>
      <div className="p-5">
        <p className="font-mono text-[9px] text-warning">
          {step.status.toUpperCase()} · NO EXECUTION
        </p>
        <h3 className="mt-3 break-words text-lg leading-7">{step.title}</h3>
        <p className="mt-3 break-words text-xs leading-6 text-muted-foreground">{step.shot}</p>
        <p className="mt-4 text-[11px] text-gold-light">
          {step.duration} s · {step.role}
        </p>
        <details className="mt-4 text-[11px] leading-6">
          <summary className="cursor-pointer text-gold-light">
            Capabilities / data / test preview
          </summary>
          <p className="mt-3 text-muted-foreground">
            Capability: {step.capability}
            <br />
            Previous process: {index === 0 ? "none" : `shot-${index}`}
            <br />
            Affected sample paths: {step.affected.join(", ")}
            <br />
            Scopes: {step.scopes.join(", ")}
            <br />
            Proposed check: {step.test}
            <br />
            Evidence: NOT RUN · no actual files modified
          </p>
        </details>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          disabled={blocked}
          onClick={() => setEdit(!edit)}
        >
          <Save size={13} />
          {edit ? "Close process editor" : "Edit process"}
        </Button>
        {edit && (
          <form
            className="mt-4 space-y-3 border-t border-border pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              save({
                title: String(f.get("title")),
                shot: String(f.get("shot")),
                duration: Number(f.get("duration")),
                role: String(f.get("role")) as CreativeStep["role"],
                status: String(f.get("status")) as CreativeStep["status"],
              });
            }}
          >
            <label className="block text-[11px]">
              Process title
              <input
                aria-label={`Process ${index + 1} title`}
                name="title"
                defaultValue={step.title}
                minLength={3}
                maxLength={160}
                required
                className="exchange-select mt-2 w-full"
              />
            </label>
            <label className="block text-[11px]">
              Storyboard beat
              <textarea
                aria-label={`Process ${index + 1} storyboard`}
                name="shot"
                defaultValue={step.shot}
                minLength={3}
                maxLength={500}
                required
                rows={3}
                className="exchange-select mt-2 w-full"
              />
            </label>
            <label className="block text-[11px]">
              Duration (seconds)
              <input
                aria-label={`Process ${index + 1} duration`}
                name="duration"
                type="number"
                min={1}
                max={120}
                defaultValue={step.duration}
                required
                className="exchange-select mt-2 w-full"
              />
            </label>
            <label className="block text-[11px]">
              Assigned role
              <select
                aria-label={`Process ${index + 1} role`}
                name="role"
                defaultValue={step.role}
                className="exchange-select mt-2 w-full"
              >
                {creativeRoles.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block text-[11px]">
              Process status
              <select
                aria-label={`Process ${index + 1} status`}
                name="status"
                defaultValue={step.status}
                className="exchange-select mt-2 w-full"
              >
                {["Proposed", "Reviewed DEMO", "Skipped DEMO"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="signal" size="sm" disabled={blocked}>
              <Save size={13} />
              Save process {index + 1}
            </Button>
          </form>
        )}
      </div>
    </article>
  );
}
