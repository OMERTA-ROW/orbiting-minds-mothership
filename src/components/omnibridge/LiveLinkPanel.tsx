import { CheckCircle2, CircleDashed, Loader2, Power, ShieldAlert, XCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { LiveLinkStatus, SystemStates } from "@/lib/live-link";
import type { SafetyView } from "@/lib/jackboy-safety";

export type LiveLinkOutcome = {
  ok: boolean;
  message: string;
  details?: Array<{ label: string; detail: string }>;
  at: string;
};

export type ActivationView = {
  kind: "live_link" | "autonomy";
  status: "inactive" | "activating" | "active" | "failed" | "revoked";
  reason: string;
  activatedAt: string | null;
  updatedAt: string;
  effective: boolean;
};

export type PanelAction = "activate_link" | "activate_autonomy" | "check" | "safety" | "deactivate";

const STATE_TEXT: Record<LiveLinkStatus["state"], string> = {
  earlier_steps: "Waiting on earlier steps",
  awaiting_step9: "Waiting for your Step 9 approval",
  blocked: "Blocked on Mothership",
  ready_to_check: "Allowed · not verified recently",
  verified: "Verified live",
};

const LINK_TEXT: Record<SystemStates["link"]["state"], string> = {
  not_configured: "Not activated",
  configured: "Activated · not verified recently",
  connected: "Activated · connected",
};
const RUN_TEXT: Record<SystemStates["autonomous"]["state"], string> = {
  not_configured: "Not authorized",
  configured_blocked: "Authorized — blocked",
  armed: "Armed — not running (no executor)",
  running: "Running",
};

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "never";
}

function Result({ result }: { result: LiveLinkOutcome | null }) {
  if (!result) return null;
  return (
    <div
      role="status"
      className={`space-y-1 rounded border p-2 text-xs ${result.ok ? "" : "border-destructive/50"}`}
    >
      <p className={result.ok ? "" : "text-destructive"}>
        {result.message} <span className="text-muted-foreground">· {when(result.at)}</span>
      </p>
      {result.details?.map((d, i) => (
        <p key={`${d.label}-${i}`} className="text-muted-foreground">
          <strong>{d.label}:</strong> {d.detail}
        </p>
      ))}
    </div>
  );
}

function StateRow(props: { label: string; value: string; good: boolean; bad?: boolean }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b py-1.5 last:border-b-0">
      <span className="text-muted-foreground">{props.label}</span>
      <strong className={props.bad ? "text-destructive" : props.good ? "text-primary" : ""}>
        {props.value}
      </strong>
    </li>
  );
}

function activationLine(a: ActivationView | undefined) {
  if (!a) return "unreadable";
  if (a.effective) return `active since ${when(a.activatedAt)}`;
  if (a.status === "active") return "recorded, but no longer in effect (approvals or Step 7 window changed)";
  if (a.status === "inactive") return "never activated";
  return `${a.status}${a.reason ? ` (${a.reason.replace(/_/g, " ")})` : ""} · ${when(a.updatedAt)}`;
}

export function LiveLinkPanel(props: {
  liveLink: LiveLinkStatus;
  system: SystemStates;
  activations: ActivationView[];
  safety: SafetyView;
  sandbox: { configured: boolean; enabled: boolean };
  step10Approved: boolean;
  mfaFresh: boolean;
  busy: boolean;
  pending: PanelAction | null;
  elapsedSeconds: number;
  linkConfirmed: boolean;
  onLinkConfirmedChange: (value: boolean) => void;
  autonomyConfirmed: boolean;
  onAutonomyConfirmedChange: (value: boolean) => void;
  onActivate: (kind: "live_link" | "autonomy") => void;
  onDeactivate: (kind: "live_link" | "autonomy") => void;
  onCheck: () => void;
  onRefreshSafety: () => void;
  linkResult: LiveLinkOutcome | null;
  autonomyResult: LiveLinkOutcome | null;
  result: LiveLinkOutcome | null;
  safetyResult: LiveLinkOutcome | null;
}) {
  const { liveLink, system, safety, sandbox } = props;
  const link = props.activations.find((a) => a.kind === "live_link");
  const autonomy = props.activations.find((a) => a.kind === "autonomy");
  const linkOn = Boolean(link?.effective);
  const autoOn = Boolean(autonomy?.effective);
  const canActivateLink = liveLink.canCheck && !linkOn && props.mfaFresh && props.linkConfirmed && !props.busy;
  const canActivateAuto =
    linkOn && props.step10Approved && !autoOn && props.mfaFresh && props.autonomyConfirmed && !props.busy;
  const spinner = (a: PanelAction) =>
    props.pending === a && (
      <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
    );
  const waiting = (a: PanelAction) =>
    props.pending === a && (
      <span className="text-xs text-muted-foreground" role="status">
        Waiting for Jackboy… {props.elapsedSeconds} s
      </span>
    );
  return (
    <section
      id="live-link"
      aria-labelledby="live-link-title"
      className="scroll-mt-24 space-y-4 rounded-lg border bg-card p-4"
    >
      <div>
        <h2 id="live-link-title" className="text-lg">
          Live link, autonomy, CODE and stops — separate states
        </h2>
        <p className="text-xs text-muted-foreground">
          Read from the server on every refresh. Activating records configuration only; nothing on this
          panel releases a stop, turns a Jackboy switch or starts a job.
        </p>
      </div>

      <ul aria-label="System states" className="rounded border px-3 text-sm">
        <StateRow
          label="Live link (Step 9)"
          value={LINK_TEXT[system.link.state]}
          good={system.link.state === "connected"}
        />
        <StateRow
          label="OMNI autonomous mode (Step 10)"
          value={RUN_TEXT[system.autonomous.state]}
          good={false}
          bad={system.autonomous.state === "running"}
        />
        <StateRow
          label="CODE through OMNI"
          value={RUN_TEXT[system.code.state]}
          good={false}
          bad={system.code.state === "running"}
        />
        <StateRow
          label="Jackboy CODE Emergency Stop"
          value={system.emergencyStop.jackboy}
          good={false}
          bad={system.emergencyStop.jackboy !== "released"}
        />
        <StateRow
          label="Mothership Emergency Stop"
          value={system.emergencyStop.mothership}
          good={false}
          bad={system.emergencyStop.mothership !== "released"}
        />
        <StateRow
          label="Jackboy System Kill Switch"
          value={system.killSwitch}
          good={false}
          bad={system.killSwitch !== "off"}
        />
      </ul>

      <div className="grid gap-4 md:grid-cols-2">
        <article aria-labelledby="live-link-sub" className="space-y-2 rounded border p-3">
          <h3 id="live-link-sub" className="font-medium">
            Step 9 · Live signed link
          </h3>
          <p className="text-sm">
            Activation: <strong>{activationLine(link)}</strong>
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Gates: {STATE_TEXT[liveLink.state]}</li>
            <li>Last verified handshake: {when(liveLink.lastConnectedAt)}</li>
            {liveLink.lastAttemptFailed && (
              <li className="text-destructive">The latest handshake attempt did not complete.</li>
            )}
            <li>Step 8 signed self-test approved: {when(liveLink.step8ApprovedAt)}</li>
            <li>Step 7 window ends: {when(liveLink.step7EndsAt)}</li>
          </ul>
          <ul className="space-y-1 text-xs" aria-label="Mothership link gates">
            {liveLink.items.map((item) => (
              <li key={item.key} className="flex gap-1.5">
                {item.ok ? (
                  <CheckCircle2 size={14} aria-hidden className="mt-0.5 shrink-0 text-primary" />
                ) : (
                  <XCircle size={14} aria-hidden className="mt-0.5 shrink-0 text-destructive" />
                )}
                <span>
                  <strong>{item.label}</strong> ({item.ok ? "ready" : "not ready"}): {item.detail}
                </span>
              </li>
            ))}
          </ul>
          {liveLink.blocker && (
            <p className="text-xs text-muted-foreground" role="note">
              {liveLink.blocker}
            </p>
          )}
          {!linkOn && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={props.linkConfirmed}
                disabled={!liveLink.canCheck || props.busy}
                onChange={(e) => props.onLinkConfirmedChange(e.target.checked)}
              />
              <span>
                I authorize activating the live link: one signed handshake and one signed safety read.
                No job, self-test or CODE request is sent.
              </span>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!linkOn && (
              <Button size="sm" disabled={!canActivateLink} onClick={() => props.onActivate("live_link")}>
                {spinner("activate_link")}
                Activate live link
              </Button>
            )}
            {linkOn && (
              <Button
                size="sm"
                variant="outline"
                disabled={props.busy || !props.mfaFresh}
                onClick={props.onCheck}
              >
                {spinner("check")}
                Check live connection
              </Button>
            )}
            {linkOn && (
              <Button
                size="sm"
                variant="outline"
                disabled={props.busy}
                onClick={() => props.onDeactivate("live_link")}
              >
                Deactivate live link
              </Button>
            )}
            {waiting("activate_link")}
            {waiting("check")}
            {liveLink.canCheck && !props.mfaFresh && (
              <span className="text-xs text-muted-foreground">Enter a fresh two-step code first.</span>
            )}
          </div>
          <Result result={props.linkResult} />
          <Result result={props.result} />
        </article>

        <article aria-labelledby="code-sub" className="space-y-2 rounded border p-3">
          <h3 id="code-sub" className="flex items-center gap-1.5 font-medium">
            <Power size={14} aria-hidden /> Step 10 · Autonomy authorization
          </h3>
          <p className="text-sm">
            Activation: <strong>{activationLine(autonomy)}</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            Authorization only. Caps enforced on every job: $0.50 per AI call, $1 reserved per task, $5 per
            day, $10 total. Execution also needs every stop released, a fresh Jackboy reading that allows
            autonomy, and a Jackboy permit per job renewed every 20 seconds.
          </p>
          <p className="text-xs font-medium">What blocks execution now:</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {system.autonomous.blockers.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {!autoOn && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={props.autonomyConfirmed}
                disabled={!linkOn || !props.step10Approved || props.busy}
                onChange={(e) => props.onAutonomyConfirmedChange(e.target.checked)}
              />
              <span>
                I authorize activating OMNI autonomy authorization under these caps. It starts nothing and
                releases no stop.
              </span>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!autoOn && (
              <Button size="sm" disabled={!canActivateAuto} onClick={() => props.onActivate("autonomy")}>
                {spinner("activate_autonomy")}
                Activate autonomy authorization
              </Button>
            )}
            {autoOn && (
              <Button
                size="sm"
                variant="outline"
                disabled={props.busy}
                onClick={() => props.onDeactivate("autonomy")}
              >
                Deactivate autonomy authorization
              </Button>
            )}
            {waiting("activate_autonomy")}
            {!linkOn && <span className="text-xs text-muted-foreground">Activate the live link first.</span>}
            {linkOn && !props.step10Approved && (
              <span className="text-xs text-muted-foreground">Approve Step 10 first.</span>
            )}
          </div>
          <Result result={props.autonomyResult} />
        </article>

        <article aria-labelledby="safety-sub" className="space-y-2 rounded border p-3">
          <h3 id="safety-sub" className="flex items-center gap-1.5 font-medium">
            <ShieldAlert size={14} aria-hidden /> Jackboy safety (signed, synced)
          </h3>
          <p className="text-sm">
            Status: <strong className={safety.clear ? "" : "text-destructive"}>{safety.label}</strong>
          </p>
          <p className="text-xs text-muted-foreground">{safety.detail}</p>
          <ul className="space-y-1 text-xs text-muted-foreground" aria-label="Jackboy safety details">
            <li>
              Kill Switch: <strong>{safety.killSwitch}</strong> · CODE Emergency Stop:{" "}
              <strong>{safety.codeStop}</strong> · CODE setting: <strong>{safety.codeEnabled}</strong>
            </li>
            <li>
              Jackboy allows OMNI autonomy: <strong>{safety.autonomousAllowed}</strong>
              {safety.blockedBy ? ` (${safety.blockedBy.replace(/_/g, " ")})` : ""}
            </li>
            <li>Jackboy authorization until: {when(safety.authorizationExpiresAt)}</li>
            <li>Checked by Jackboy: {when(safety.observedAt)}</li>
            <li>
              Recorded here: {when(safety.recordedAt)} ({safety.source})
            </li>
          </ul>
          <Button size="sm" variant="outline" disabled={props.busy} onClick={props.onRefreshSafety}>
            {spinner("safety")}
            Refresh safety state
          </Button>
          <Result result={props.safetyResult} />
          <p className="text-xs text-muted-foreground">
            The CODE Emergency Stop and Kill Switch are controlled only in Jackboy (passkey) and are never
            changed here. Under Jackboy's permit contract a stop there revokes OMNI's permits, and an OMNI
            job holding one halts at its next 20-second renewal; this page records the stop on the next
            scheduled safety read or when you refresh. Unknown or stale counts as stopped. Not yet proven
            live: Jackboy's permit service must be installed and no OMNI executor is connected.
          </p>
        </article>

        <article aria-labelledby="terminal-sub" className="space-y-2 rounded border p-3">
          <h3 id="terminal-sub" className="flex items-center gap-1.5 font-medium">
            <CircleDashed size={14} aria-hidden /> Manual OMNI Terminal (separate from CODE)
          </h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>
              Not affected by the CODE Emergency Stop. Refused only while a verified Jackboy reading says
              its System Kill Switch is on
              {safety.manualBlocked ? (
                <strong className="text-destructive"> — that is the case now.</strong>
              ) : (
                " (not the case now)."
              )}
            </li>
            <li>
              The command bar (for example <code>status</code> or <code>probe</code>) answers from
              Mothership's own records and never sends a job or CODE request.
            </li>
            <li>
              Cloud sandbox commands need their own settings and gates:{" "}
              {sandbox.configured
                ? sandbox.enabled
                  ? "settings present and switch on; a fresh passkey, the terminal switch and a passing sandbox self-test are still required."
                  : "settings present, but OMNI_SANDBOX_ENABLED is off."
                : "sandbox settings are not set, so sandbox commands stay unavailable."}
            </li>
            <li>
              Mothership's own Emergency Stop is changed only in{" "}
              <Link to="/omni-terminal" className="underline">
                OMNI Terminal
              </Link>
              .
            </li>
          </ul>
        </article>
      </div>
    </section>
  );
}
