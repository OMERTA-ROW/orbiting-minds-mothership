import { CheckCircle2, CircleDashed, Loader2, Power, XCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { CodeStatus, LiveLinkStatus } from "@/lib/live-link";
import type { SafetyView } from "@/lib/jackboy-safety";

export type LiveLinkOutcome = {
  ok: boolean;
  message: string;
  details?: Array<{ label: string; detail: string }>;
  at: string;
};

const STATE_TEXT: Record<LiveLinkStatus["state"], string> = {
  earlier_steps: "Waiting on earlier steps",
  awaiting_step9: "Waiting for your Step 9 approval",
  blocked: "Blocked on Mothership",
  ready_to_check: "Allowed · not verified recently",
  verified: "Verified live",
};

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "never";
}

export function LiveLinkPanel(props: {
  liveLink: LiveLinkStatus;
  code: CodeStatus;
  sandbox: { configured: boolean; enabled: boolean };
  mfaFresh: boolean;
  busy: boolean;
  running: boolean;
  elapsedSeconds: number;
  confirmed: boolean;
  onConfirmedChange: (value: boolean) => void;
  onCheck: () => void;
  result: LiveLinkOutcome | null;
  safety: SafetyView;
  safetyBusy: boolean;
  onRefreshSafety: () => void;
  safetyResult: LiveLinkOutcome | null;
}) {
  const { liveLink, code, sandbox, safety } = props;
  const stop = liveLink.items.find((i) => i.key === "stop");
  const canClick = liveLink.canCheck && props.mfaFresh && props.confirmed && !props.busy;
  return (
    <section
      id="live-link"
      aria-labelledby="live-link-title"
      className="scroll-mt-24 space-y-4 rounded-lg border bg-card p-4"
    >
      <div>
        <h2 id="live-link-title" className="text-lg">
          Live link, terminal and CODE — separate controls
        </h2>
        <p className="text-xs text-muted-foreground">
          Read from the server on every refresh. Nothing on this panel turns a switch, stop or CODE
          on or off.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <article aria-labelledby="live-link-sub" className="space-y-2 rounded border p-3">
          <h3 id="live-link-sub" className="font-medium">
            Live signed link (Steps 8–9)
          </h3>
          <p className="text-sm">
            Status: <strong>{STATE_TEXT[liveLink.state]}</strong>
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
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
          <p className="text-xs text-muted-foreground">
            Jackboy also refuses every link request while its own global Kill Switch is on. That
            switch is controlled only in Jackboy and is never changed here.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={props.confirmed}
              disabled={!liveLink.canCheck || props.busy}
              onChange={(e) => props.onConfirmedChange(e.target.checked)}
            />
            <span>
              I authorize one connection-only check: a signed handshake with Jackboy. No job,
              self-test or CODE request is sent.
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!canClick} onClick={props.onCheck}>
              {props.running && (
                <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
              )}
              Check live connection
            </Button>
            {props.running && (
              <span className="text-xs text-muted-foreground" role="status">
                Waiting for Jackboy… {props.elapsedSeconds} s
              </span>
            )}
            {liveLink.canCheck && !props.mfaFresh && (
              <span className="text-xs text-muted-foreground">
                Enter a fresh two-step code first.
              </span>
            )}
          </div>
          {props.result && (
            <div
              role="status"
              className={`space-y-1 rounded border p-2 text-xs ${props.result.ok ? "" : "border-destructive/50"}`}
            >
              <p className={props.result.ok ? "" : "text-destructive"}>
                {props.result.message}{" "}
                <span className="text-muted-foreground">· {when(props.result.at)}</span>
              </p>
              {props.result.details?.map((d, i) => (
                <p key={`${d.label}-${i}`} className="text-muted-foreground">
                  <strong>{d.label}:</strong> {d.detail}
                </p>
              ))}
            </div>
          )}
        </article>

        <div className="space-y-4">
          <article aria-labelledby="safety-sub" className="space-y-2 rounded border p-3">
            <h3 id="safety-sub" className="font-medium">
              Jackboy safety state (synced)
            </h3>
            <p className="text-sm">
              Status:{" "}
              <strong className={safety.clear ? "" : "text-destructive"}>{safety.label}</strong>
            </p>
            <p className="text-xs text-muted-foreground">{safety.detail}</p>
            <ul className="space-y-1 text-xs text-muted-foreground" aria-label="Jackboy safety details">
              <li>
                Jackboy Kill Switch: <strong>{safety.killSwitch}</strong>
              </li>
              <li>
                Jackboy CODE Emergency Stop: <strong>{safety.codeStop}</strong>
              </li>
              <li>
                Jackboy CODE switch: <strong>{safety.codeEnabled}</strong>
              </li>
              <li>Observed by Jackboy: {when(safety.observedAt)}</li>
              <li>
                Recorded here: {when(safety.recordedAt)} ({safety.source})
              </li>
            </ul>
            <Button
              size="sm"
              variant="outline"
              disabled={props.safetyBusy}
              onClick={props.onRefreshSafety}
            >
              {props.safetyBusy && (
                <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
              )}
              Refresh safety state
            </Button>
            {props.safetyResult && (
              <p
                role="status"
                className={`text-xs ${props.safetyResult.ok ? "text-muted-foreground" : "text-destructive"}`}
              >
                {props.safetyResult.message}
              </p>
            )}
          </article>

          <article aria-labelledby="code-sub" className="space-y-2 rounded border p-3">
            <h3 id="code-sub" className="flex items-center gap-1.5 font-medium">
              <Power size={14} aria-hidden /> Autonomy &amp; CODE (Step 10)
            </h3>
            <p className="text-sm">
              Status:{" "}
              <strong>
                {code.state === "authorized_not_running" ? "Authorized — not running" : "Not authorized"}
              </strong>{" "}
              <span className="text-xs text-muted-foreground">· {code.headline}</span>
            </p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {code.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </article>

          <article aria-labelledby="stop-sub" className="space-y-2 rounded border p-3">
            <h3 id="stop-sub" className="font-medium">
              Emergency stops
            </h3>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>
                <strong>Mothership Emergency Stop:</strong>{" "}
                {stop ? (stop.ok ? "Released" : "Engaged or unreadable") : "Unreadable"}. It covers
                every Jackboy link request from Mothership, including the connection check above;
                it is not a CODE-only stop. Change it only in{" "}
                <Link to="/omni-terminal" className="underline">
                  OMNI Terminal
                </Link>
                .
              </li>
              <li>
                <strong>Jackboy CODE Emergency Stop</strong> and <strong>Jackboy Kill Switch</strong>
                : separate controls in Jackboy's Settings, each needing Jackboy's passkey. Mothership
                only reads their signed state (above) and never changes them. While either is on, or
                the reading is missing or stale, OMNI autonomy and CODE are halted; the manual
                terminal's local commands keep working.
              </li>
            </ul>
          </article>

          <article aria-labelledby="terminal-sub" className="space-y-2 rounded border p-3">
            <h3 id="terminal-sub" className="flex items-center gap-1.5 font-medium">
              <CircleDashed size={14} aria-hidden /> Manual OMNI Terminal (separate from CODE)
            </h3>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>
                The terminal's command bar (for example <code>status</code> or <code>probe</code>)
                answers from Mothership's own records and never sends a job or CODE request.
              </li>
              <li>
                Cloud sandbox commands need their own settings and gates:{" "}
                {sandbox.configured
                  ? sandbox.enabled
                    ? "sandbox settings present and switch on; a fresh passkey, the terminal switch and a passing sandbox self-test are still required."
                    : "sandbox settings present, but OMNI_SANDBOX_ENABLED is off."
                  : "sandbox settings (OMNI_SANDBOX_ORIGIN, client ID and signing secret) are not set, so sandbox commands stay unavailable."}
              </li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
