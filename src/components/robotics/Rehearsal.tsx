import { useEffect, useState } from "react";
import { Download, FlaskConical, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { RoboticsScenario } from "@/data/evolution";
import {
  defaultRoboticsConfig,
  roboticsPassport,
  roboticsReadiness,
  type RoboticsConfig,
} from "@/lib/robotics";
import { useRobotics } from "@/hooks/use-robotics";
import { useGuardian } from "@/hooks/use-guardian";
import { downloadJson } from "@/lib/genesis-sdk";
export function RoboticsRehearsal({ scenario }: { scenario: RoboticsScenario }) {
  const { store, ready, issue, dispatch } = useRobotics();
  const guardian = useGuardian();
  const [config, setConfig] = useState<RoboticsConfig>(() => defaultRoboticsConfig(scenario.model));
  const [operator, setOperator] = useState("");
  const [consent, setConsent] = useState(false);
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<"Request changes" | "Ready for expert review">(
    "Request changes",
  );
  const [reviewConsent, setReviewConsent] = useState(false);
  const [message, setMessage] = useState("");
  const status = roboticsReadiness(store, scenario.id);
  const run = status.run;
  useEffect(() => {
    setReviewConsent(false);
  }, [run?.id]);
  const perform = (f: () => void, text: string) => {
    try {
      f();
      setMessage(text);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Local action unavailable");
    }
  };
  const change = (key: string, value: number) => {
    setConfig((c) => ({ ...c, [key]: value }));
    setConsent(false);
  };
  const fields =
    config.model === "reaction"
      ? [
          {
            key: "speedMps",
            label: "Virtual speed · m/s",
            value: config.speedMps,
            min: 0,
            max: 2,
            step: 0.1,
          },
          {
            key: "latencyMs",
            label: "Synthetic sensing delay · ms",
            value: config.latencyMs,
            min: 0,
            max: 2000,
            step: 1,
          },
          {
            key: "clearanceM",
            label: "Fictional clearance budget · m",
            value: config.clearanceM,
            min: 0,
            max: 10,
            step: 0.1,
          },
        ]
      : config.model === "energy"
        ? [
            {
              key: "powerKw",
              label: "Fictional input power · kW",
              value: config.powerKw,
              min: 0,
              max: 22,
              step: 0.1,
            },
            {
              key: "durationMin",
              label: "Duration · minutes",
              value: config.durationMin,
              min: 1,
              max: 180,
              step: 1,
            },
            {
              key: "capacityKwh",
              label: "Fictional battery capacity · kWh",
              value: config.capacityKwh,
              min: 1,
              max: 120,
              step: 1,
            },
            {
              key: "startPercent",
              label: "Fictional initial charge · %",
              value: config.startPercent,
              min: 0,
              max: 100,
              step: 1,
            },
          ]
        : [
            {
              key: "tileCount",
              label: "Fictional tile count",
              value: config.tileCount,
              min: 1,
              max: 1000,
              step: 1,
            },
            {
              key: "ratePerMin",
              label: "Synthetic tiles per minute",
              value: config.ratePerMin,
              min: 0,
              max: 20,
              step: 0.1,
            },
            {
              key: "durationMin",
              label: "Duration · minutes",
              value: config.durationMin,
              min: 1,
              max: 120,
              step: 1,
            },
          ];
  return (
    <section className="mt-12 border-t border-border pt-8" aria-label="Local simulation rehearsal">
      <h2 className="flex items-center gap-3 text-2xl">
        <FlaskConical className="text-gold" />
        Educational model rehearsal
      </h2>
      <p className="mt-4 max-w-4xl text-sm leading-loose text-warning">{scenario.limitation}</p>
      <p className="mt-3 text-xs leading-loose text-muted-foreground">
        Local records are not confidential, authenticated or tamper-evident. Non-sensitive sample
        names only; no source code or sensor data is executed.
      </p>
      {issue && (
        <p role="status" className="mt-4 text-sm text-warning">
          {issue}
        </p>
      )}
      {!ready ? (
        <p role="status" className="mt-6">
          Loading local lab records…
        </p>
      ) : (
        <>
          <form
            className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (guardian.store.paused) return;
              perform(
                () => dispatch({ type: "run", scenarioId: scenario.id, config, operator, consent }),
                "Local arithmetic recorded; no independent tests, code or hardware ran.",
              );
              setConsent(false);
            }}
          >
            <label className="text-xs text-muted-foreground">
              Declared demo operator
              <Input
                aria-label="Declared lab operator"
                value={operator}
                maxLength={80}
                onChange={(e) => {
                  setOperator(e.target.value);
                  setConsent(false);
                }}
                className="mt-2"
              />
            </label>
            {fields.map((f) => (
              <label className="text-xs text-muted-foreground" key={f.key}>
                {f.label}
                <Input
                  aria-label={f.label}
                  type="number"
                  value={Number.isFinite(f.value) ? f.value : ""}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  required
                  onChange={(e) =>
                    change(f.key, e.target.value === "" ? NaN : Number(e.target.value))
                  }
                  className="mt-2"
                />
              </label>
            ))}
            {config.model === "reaction" && (
              <label className="text-xs text-muted-foreground">
                Synthetic event
                <select
                  aria-label="Synthetic event"
                  value={config.event}
                  onChange={(e) => {
                    const event = e.target.value;
                    if (
                      event === "Clear fixture" ||
                      event === "Stale sensor" ||
                      event === "Conflicting commands" ||
                      event === "Stop requested"
                    ) {
                      setConfig({ ...config, event });
                      setConsent(false);
                    }
                  }}
                  className="exchange-select mt-2 w-full"
                >
                  {["Clear fixture", "Stale sensor", "Conflicting commands", "Stop requested"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
            )}
            <label className="flex items-start gap-3 text-xs leading-loose sm:col-span-2 lg:col-span-3">
              <Checkbox
                aria-label="Consent to local arithmetic rehearsal"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                className="mt-1"
              />
              <span>
                I consent to this local arithmetic rehearsal only, not code execution, ROS
                validation or hardware control.
              </span>
            </label>
            <Button
              variant="cosmic"
              type="submit"
              disabled={
                !consent || operator.trim().length < 2 || !guardian.ready || guardian.store.paused
              }
              className="h-auto min-h-11 whitespace-normal sm:col-span-2 lg:col-span-3 lg:justify-self-start"
            >
              Record demo calculation
            </Button>
            {guardian.store.paused && (
              <p role="status" className="text-sm text-warning sm:col-span-2 lg:col-span-3">
                Guardian emergency pause is active. Resume Guardian planning before a new rehearsal;
                no real machine is stopped.
              </p>
            )}
          </form>
          {run && (
            <div className="mt-8 border-y border-border py-7" aria-label="Latest model result">
              <p className="font-mono text-xs text-gold-light">
                LATEST LOCAL RUN · {run.result.outcome}
              </p>
              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-3xl">{run.result.metric}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{run.result.unit}</p>
                </div>
                <div>
                  <p className="text-3xl">{run.result.auxiliary}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{run.result.auxiliaryUnit}</p>
                </div>
              </div>
              <p className="mt-5 text-xs leading-loose text-muted-foreground">
                {run.operator} · self-declared · {run.at} · {run.modelVersion}
                <br />
                No safety score, independent test, hardware evidence or real-world clearance.
              </p>
            </div>
          )}
          <div className="mt-9 grid gap-10 lg:grid-cols-2">
            <div>
              <h3 className="text-xl">Guardian Physical Safety Lock</h3>
              <p className="mt-4 font-mono text-xs text-warning">
                HARDWARE RELEASE BLOCKED · NOT CERTIFIED
              </p>
              <p className="mt-4 text-sm leading-loose text-muted-foreground">
                Latest local decision: {status.status}. A distinct demo name can recommend expert
                review, never approve a robot, vehicle, protection claim or deployment.
              </p>
              <form
                className="mt-6 grid gap-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!run) return;
                  perform(
                    () =>
                      dispatch({
                        type: "review",
                        runId: run.id,
                        reviewer,
                        note,
                        decision,
                        consent: reviewConsent,
                      }),
                    "Local review recorded; expert, owner and physical safety approvals remain unverified.",
                  );
                  setReviewConsent(false);
                }}
              >
                <label className="text-xs text-muted-foreground">
                  Distinct declared human reviewer
                  <Input
                    aria-label="Lab human reviewer"
                    maxLength={80}
                    value={reviewer}
                    onChange={(e) => {
                      setReviewer(e.target.value);
                      setReviewConsent(false);
                    }}
                    className="mt-2"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Local decision
                  <select
                    aria-label="Lab review decision"
                    className="exchange-select mt-2 w-full"
                    value={decision}
                    onChange={(e) => {
                      setDecision(
                        e.target.value === "Ready for expert review"
                          ? "Ready for expert review"
                          : "Request changes",
                      );
                      setReviewConsent(false);
                    }}
                  >
                    <option>Request changes</option>
                    <option>Ready for expert review</option>
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  Evidence gaps and proposed changes
                  <Textarea
                    aria-label="Lab review notes"
                    value={note}
                    maxLength={1200}
                    onChange={(e) => {
                      setNote(e.target.value);
                      setReviewConsent(false);
                    }}
                    className="mt-2"
                  />
                </label>
                <label className="flex items-start gap-3 text-xs leading-loose">
                  <Checkbox
                    aria-label="Consent to proposed-only lab review"
                    checked={reviewConsent}
                    onCheckedChange={(v) => setReviewConsent(v === true)}
                    className="mt-1"
                  />
                  <span>
                    Proposed-only local review; no verified identity, independent test,
                    certification or hardware approval.
                  </span>
                </label>
                <Button
                  variant="signal"
                  type="submit"
                  className="h-auto min-h-11 whitespace-normal justify-self-start"
                  disabled={
                    !run ||
                    !reviewConsent ||
                    reviewer.trim().length < 2 ||
                    note.trim().length < 10 ||
                    guardian.store.paused
                  }
                >
                  Record proposed-only review
                </Button>
              </form>
            </div>
            <div>
              <h3 className="text-xl">Who reviewed this?</h3>
              {store.reviews.filter((r) => r.scenarioId === scenario.id).length === 0 ? (
                <p className="mt-5 text-sm text-muted-foreground">
                  No local reviews recorded. Owner, domain-expert and independent-test sign-off: NOT
                  VERIFIED.
                </p>
              ) : (
                <ol className="mt-5 space-y-5">
                  {store.reviews
                    .filter((r) => r.scenarioId === scenario.id)
                    .slice()
                    .reverse()
                    .map((r) => (
                      <li key={r.id} className="border-l border-gold/30 pl-4">
                        <p className="break-words text-sm text-gold-light">
                          {r.reviewer} · declared/unverified · {r.decision}
                        </p>
                        <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-loose text-muted-foreground">
                          {r.note}
                        </p>
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          {r.at} ·{" "}
                          {r.runId === run?.id
                            ? "Latest run"
                            : "Historical run · not current sign-off"}
                        </p>
                      </li>
                    ))}
                </ol>
              )}
              <Button
                variant="signal"
                className="mt-7 h-auto min-h-11 whitespace-normal"
                onClick={() =>
                  perform(
                    () =>
                      downloadJson(
                        `DEMO-robotics-${scenario.id}.json`,
                        roboticsPassport(store, scenario.id),
                      ),
                    "Unsigned local passport downloaded; no signing, release or distribution.",
                  )
                }
              >
                <Download size={15} />
                Download DEMO research passport
              </Button>
              <Button
                disabled
                variant="outline"
                className="mt-4 flex h-auto min-h-11 whitespace-normal"
              >
                <LockKeyhole size={15} />
                Connect / deploy to hardware · disabled
              </Button>
            </div>
          </div>
          <p role="status" className="mt-6 break-words text-sm text-warning">
            {message}
          </p>
          <details className="mt-8 border-t border-border pt-6">
            <summary className="cursor-pointer text-sm text-gold-light">
              Recorded calculation history ·{" "}
              {store.runs.filter((r) => r.scenarioId === scenario.id).length}
            </summary>
            <ol className="mt-4 space-y-4">
              {store.runs
                .filter((r) => r.scenarioId === scenario.id)
                .slice()
                .reverse()
                .map((r) => (
                  <li
                    key={r.id}
                    className="break-words text-xs leading-loose text-muted-foreground"
                  >
                    {r.at} · {r.operator} · {r.result.metric} {r.result.unit} · {r.result.outcome}
                    <pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(r.config)}</pre>
                  </li>
                ))}
            </ol>
          </details>
        </>
      )}
    </section>
  );
}
