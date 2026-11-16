/**
 * One coherent OMNI ↔ Jackboy activation: pure sequencing and a truthful readiness checklist.
 * Client-safe; the server function supplies the real, gated steps. Nothing here grants, releases
 * a stop, enables CODE, changes caps or starts work, and nothing reports "ready" on missing proof.
 */

export const REVIEWED_RELEASE = "omni-bounded-plan-1";

export type OrchestrationSelection = { liveLink: boolean; autonomy: boolean; arm: boolean };
export type StageId = "live_link" | "autonomy" | "arm";
export type StageStatus = "done" | "already" | "failed" | "skipped" | "not_selected";
export type StageResult = { id: StageId; status: StageStatus; message: string };

export type ExecutorInspect =
  | { ok: true; release: string; enabled: boolean; reviewedRelease: string | null }
  | { ok: false; issue: "not_configured" | "unreachable" | "invalid_reply" };

export type OrchestrationDeps = {
  effective(kind: "live_link" | "autonomy"): Promise<boolean>;
  activate(
    kind: "live_link" | "autonomy",
    attemptId: string,
  ): Promise<{ ok: boolean; already?: boolean; message: string }>;
  inspectExecutor(): Promise<ExecutorInspect>;
  /** Mothership's own reviewed-release setting equals the accepted release. */
  pinned(): boolean;
  /** Fresh signed Jackboy state: armed or not (throws when unverifiable). */
  armed(): Promise<boolean>;
  /** Fresh executor verification (Jackboy disarms on verify), then arm. Throws on refusal. */
  verifyAndArm(): Promise<void>;
};

export const STAGE_LABEL: Record<StageId, string> = {
  live_link: "Step 9 live link",
  autonomy: "Step 10 autonomy authorization (verify executor, then configure)",
  arm: "Arm bounded executor",
};

/** Exact staging-executor (Vultr)/Mothership setting the owner must change; null when the executor allows arming. */
export function executorOwnerAction(inspect: ExecutorInspect, pinned: boolean): string | null {
  if (!inspect.ok)
    return inspect.issue === "not_configured"
      ? "Mothership has no executor settings: add OMNI_EXECUTOR_ORIGIN and OMNI_EXECUTOR_CONTROL_SECRET in Mothership's secrets."
      : "The staging executor (Vultr) did not give a signed answer. Check that omni-executor.service is running on the Vultr server and that its env file has the same executor settings Mothership already has, then restart omni-executor.service.";
  if (inspect.release !== REVIEWED_RELEASE)
    return `The staging executor (Vultr) runs release ${inspect.release}, not ${REVIEWED_RELEASE}. Deploy the reviewed services/omni-autonomous release on the Vultr server, then restart omni-executor.service.`;
  if (inspect.reviewedRelease !== REVIEWED_RELEASE)
    return `Edit the executor's env file on the Vultr server: set OMNI_AUTONOMY_REVIEWED_RELEASE=${REVIEWED_RELEASE}, then restart omni-executor.service.`;
  if (!inspect.enabled)
    return "Edit the executor's env file on the Vultr server: set OMNI_AUTONOMOUS_ENABLED=true, then restart omni-executor.service. (Verification works while it is off; arming and plans do not.)";
  if (!pinned)
    return `In Mothership's secrets, set OMNI_AUTONOMY_REVIEWED_RELEASE=${REVIEWED_RELEASE}, then publish.`;
  return null;
}

/**
 * Runs only the selected scopes, in dependency order, each through its own gated activation.
 * Already-effective stages are never re-run (a new Step 9 connect would also clear Jackboy's
 * executor verification). A failed stage is rolled back by its own activation; later stages are
 * not attempted; earlier stages stay as they are — each is its own approved scope.
 */
export async function orchestrate(
  selection: OrchestrationSelection,
  attempts: { live_link: string; autonomy: string },
  deps: OrchestrationDeps,
): Promise<{ stages: StageResult[]; summary: string; partial: boolean; ownerAction: string | null }> {
  const stages: StageResult[] = [];
  let ownerAction: string | null = null;
  let blockedBy: string | null = null;
  const skip = (id: StageId, why: string) => stages.push({ id, status: "skipped", message: why });

  for (const kind of ["live_link", "autonomy"] as const) {
    const selected = kind === "live_link" ? selection.liveLink : selection.autonomy;
    if (blockedBy) {
      if (selected) skip(kind, `Not attempted: ${blockedBy}`);
      else stages.push({ id: kind, status: "not_selected", message: "Not selected." });
      continue;
    }
    let on: boolean;
    try {
      on = await deps.effective(kind);
    } catch {
      stages.push({
        id: kind,
        status: "failed",
        message: "Its current state could not be read, so nothing was sent.",
      });
      blockedBy = `${STAGE_LABEL[kind]} state is unknown.`;
      continue;
    }
    if (on) {
      stages.push({ id: kind, status: "already", message: "Already in effect; not re-run." });
      continue;
    }
    if (!selected) {
      stages.push({ id: kind, status: "not_selected", message: "Not selected and not in effect." });
      blockedBy = `${STAGE_LABEL[kind]} is not in effect.`;
      continue;
    }
    const result = await deps.activate(kind, attempts[kind]);
    stages.push({
      id: kind,
      status: result.ok ? (result.already ? "already" : "done") : "failed",
      message: result.message,
    });
    if (!result.ok) blockedBy = `${STAGE_LABEL[kind]} failed.`;
  }

  if (!selection.arm) stages.push({ id: "arm", status: "not_selected", message: "Not selected." });
  else if (blockedBy) skip("arm", `Not attempted: ${blockedBy}`);
  else {
    try {
      if (await deps.armed()) {
        stages.push({ id: "arm", status: "already", message: "Already armed; not re-run." });
      } else {
        const action = executorOwnerAction(await deps.inspectExecutor(), deps.pinned());
        if (action) {
          ownerAction = action;
          skip("arm", `Not attempted: ${action}`);
        } else {
          await deps.verifyAndArm();
          stages.push({
            id: "arm",
            status: "done",
            message:
              "Executor verified and armed for bounded plans. No plan was started and no stop was released. Jackboy accepts plans only within 15 minutes of that verification.",
          });
        }
      }
    } catch (error) {
      stages.push({
        id: "arm",
        status: "failed",
        message: `Not armed: ${error instanceof Error ? error.message : "Jackboy refused or could not be verified"}. Step 10 stays configured, not armed.`,
      });
    }
  }

  const failed = stages.filter((s) => s.status === "failed" || s.status === "skipped");
  const reached = stages.filter((s) => s.status === "done" || s.status === "already");
  const partial = failed.length > 0 && reached.length > 0;
  const inEffect = reached.map((s) => STAGE_LABEL[s.id]).join(", ");
  const summary =
    failed.length === 0
      ? reached.length
        ? `In effect: ${inEffect}. Nothing is running.`
        : "Nothing was selected."
      : partial
        ? `Partly done. In effect: ${inEffect}. Not in effect: ${failed.map((s) => STAGE_LABEL[s.id]).join(", ")} (any failed step was rolled back). Nothing is running.`
        : `Nothing was activated: ${failed.map((s) => STAGE_LABEL[s.id]).join(", ")}. Nothing is running.`;
  return { stages, summary, partial, ownerAction };
}

// ---------------------------------------------------------------------------------------------
// Readiness checklist (read-only)
// ---------------------------------------------------------------------------------------------

export type CheckStatus = "ok" | "action" | "blocked" | "unknown" | "info";
export type CheckItem = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Counts toward "autonomy operational"; the manual terminal and CODE are separate. */
  required: boolean;
};

export type ReadinessInput = {
  now: number;
  jackboyBuild: { commit: string | null; builtAt: string | null } | null;
  /** Earlier of Step 7's window and Jackboy's link approval (as configured in Mothership). */
  windowEndsAt: string | null;
  step9Approved: boolean;
  step10Approved: boolean;
  linkEffective: boolean;
  autonomyEffective: boolean;
  mothershipStop: boolean | null;
  jackboy: {
    connected: boolean;
    configured: boolean;
    armed: boolean;
    running: boolean;
    emergencyStop: boolean;
    killSwitch: boolean;
    executorRelease: string | null;
    cancellationPending: boolean;
  } | null;
  executor: ExecutorInspect | null;
  pinned: boolean;
  codeEnabled: boolean | null;
  codeAllowed: boolean | null;
  activePermits: number | null;
  sandbox: { configured: boolean; enabled: boolean };
};

export function readinessChecklist(r: ReadinessInput): {
  items: CheckItem[];
  operational: boolean;
  headline: string;
  nextAction: string;
} {
  const items: CheckItem[] = [];
  const add = (i: CheckItem) => items.push(i);
  const j = r.jackboy;

  add({
    id: "jackboy_build",
    label: "Jackboy live build",
    status: r.jackboyBuild?.commit ? "info" : "unknown",
    detail: r.jackboyBuild?.commit
      ? `Jackboy's public marker reports commit ${r.jackboyBuild.commit.slice(0, 7)}${r.jackboyBuild.builtAt ? `, built ${r.jackboyBuild.builtAt.slice(0, 16).replace("T", " ")} UTC` : ""}. This names the build only; it proves no setting.`
      : "Jackboy's public build marker could not be read.",
    required: false,
  });

  const ends = Date.parse(r.windowEndsAt ?? "");
  add({
    id: "window",
    label: "Approval window",
    status: !Number.isFinite(ends) || ends <= r.now ? "action" : ends - r.now < 30 * 60_000 ? "action" : "ok",
    detail: !Number.isFinite(ends) || ends <= r.now
      ? "No current window: renew Step 7 and Jackboy's link approval (and OMNI_LINK_APPROVAL_EXPIRES_AT in Mothership)."
      : `Ends ${new Date(ends).toISOString().slice(11, 16)} UTC (earlier of Step 7 and Jackboy's link approval).${ends - r.now < 30 * 60_000 ? " Ends within 30 minutes — renew both first." : ""}`,
    required: true,
  });

  add({
    id: "stops",
    label: "Stops",
    status:
      r.mothershipStop === null || !j
        ? "unknown"
        : r.mothershipStop || j.emergencyStop || j.killSwitch
          ? "blocked"
          : "ok",
    detail:
      r.mothershipStop === null || !j
        ? "A fresh signed reading is unavailable, so everything counts as stopped."
        : [
            `Mothership Emergency Stop ${r.mothershipStop ? "engaged" : "released"}`,
            `Jackboy CODE Emergency Stop ${j.emergencyStop ? "engaged" : "released"}`,
            `Jackboy Kill Switch ${j.killSwitch ? "on" : "off"}`,
          ].join(" · ") + ". Stops are only changed by you, never by this workflow.",
    required: true,
  });

  add({
    id: "step9",
    label: "Step 9 live link",
    status: r.linkEffective && j?.connected ? "ok" : !r.step9Approved ? "blocked" : "action",
    detail: r.linkEffective && j?.connected
      ? "Activated and Jackboy's signed state shows the connection."
      : r.linkEffective
        ? "Recorded as active, but Jackboy's signed state does not show the connection. Deactivate and activate it again."
        : r.step9Approved
          ? "Approved, not activated. Include it below."
          : "Approve Step 9 first.",
    required: true,
  });

  const execAction = r.executor ? executorOwnerAction(r.executor, true) : null;
  add({
    id: "executor",
    label: "Staging executor (Vultr)",
    status: !r.executor ? "unknown" : execAction ? "action" : "ok",
    detail: !r.executor
      ? "Not checked yet."
      : r.executor.ok
        ? `Signed answer: release ${r.executor.release}, reviewed ${r.executor.reviewedRelease ?? "none"}, autonomous execution ${r.executor.enabled ? "enabled" : "disabled"}.${execAction ? ` ${execAction}` : ""}`
        : (execAction ?? "No signed answer."),
    required: true,
  });

  add({
    id: "pin",
    label: "Mothership reviewed-release setting",
    status: r.pinned ? "ok" : "action",
    detail: r.pinned
      ? `Set to ${REVIEWED_RELEASE}.`
      : `Set OMNI_AUTONOMY_REVIEWED_RELEASE=${REVIEWED_RELEASE} in Mothership's secrets, then publish.`,
    required: true,
  });

  add({
    id: "step10",
    label: "Step 10 autonomy authorization",
    status:
      r.autonomyEffective && j?.configured ? "ok" : !r.step10Approved ? "blocked" : "action",
    detail: r.autonomyEffective && j?.configured
      ? `Configured at Jackboy (executor release ${j.executorRelease ?? "not reported"}).`
      : r.step10Approved
        ? "Approved, not activated. Including it verifies the executor first, then configures Jackboy."
        : "Approve Step 10 first.",
    required: true,
  });

  add({
    id: "armed",
    label: "Executor armed for bounded plans",
    status: j?.armed ? "ok" : "action",
    detail: j?.armed
      ? `Armed${j.running ? " and a plan is running" : ", nothing running"}. Plans are accepted only within 15 minutes of the last verification; verifying again disarms.`
      : "Not armed. Arming is its own choice below; it needs the staging executor (Vultr) enabled.",
    required: true,
  });

  add({
    id: "cancellation",
    label: "Cancellation and lease",
    status: !j ? "unknown" : j.cancellationPending ? "blocked" : "ok",
    detail: !j
      ? "Unknown."
      : j.cancellationPending
        ? "Cancellation is pending at Jackboy; do not treat work as stopped. Reconcile first."
        : `No cancellation pending. Each plan needs a Jackboy permit (renewed every 20 s) and a one-second lease refreshed every 250 ms; active permits: ${r.activePermits ?? "unknown"}.`,
    required: true,
  });

  add({
    id: "code",
    label: "CODE routing (Jackboy)",
    status: "info",
    detail:
      r.codeEnabled === null
        ? "Jackboy's CODE setting is unknown."
        : `Jackboy CODE ${r.codeEnabled ? "on" : "off"}${r.codeAllowed === null ? "" : `; OMNI authorization ${r.codeAllowed ? "includes" : "does not include"} CODE jobs`}. OMNI autonomy never routes to CODE by itself: each CODE job needs its own Jackboy permit and spend checks.`,
    required: false,
  });

  add({
    id: "terminal",
    label: "Manual terminal host",
    status: r.sandbox.configured && r.sandbox.enabled ? "info" : "action",
    detail:
      r.sandbox.configured && r.sandbox.enabled
        ? "One sandbox host is configured and switched on; the manual terminal still needs its own passkey, self-test and per-command approval. It is separate from autonomy."
        : r.sandbox.configured
          ? "A sandbox host is configured but OMNI_SANDBOX_ENABLED is not true. The manual terminal stays off (separate from autonomy)."
          : "No sandbox host is configured: deploy services/omni-sandbox on Railway, then add OMNI_SANDBOX_ORIGIN, OMNI_SANDBOX_CLIENT_ID and OMNI_SANDBOX_HMAC_SECRET and set OMNI_SANDBOX_ENABLED=true in Mothership. Separate from autonomy.",
    required: false,
  });

  const required = items.filter((i) => i.required);
  const operational = required.every((i) => i.status === "ok");
  const first = required.find((i) => i.status !== "ok");
  return {
    items,
    operational,
    headline: operational
      ? "Operational: armed for bounded plans, nothing started."
      : `Not operational: ${required.filter((i) => i.status !== "ok").length} of ${required.length} required items need attention.`,
    nextAction: first ? `${first.label}: ${first.detail}` : "None. Starting a plan is still a separate, explicit owner action.",
  };
}
