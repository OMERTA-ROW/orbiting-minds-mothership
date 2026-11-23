const SPEND_LIMITS = Object.freeze({
  callUsd: 0.5,
  jobUsd: 1,
  dayUsd: 5,
  totalUsd: 10,
});

function refused(job, reason, deps) {
  deps.log({ jobId: job?.id, reason });
  return { ok: false, reason };
}

export function checkSandboxJob(job, deps) {
  const approval = deps.getApproval(job?.id);
  if (!approval || (approval.approved !== true && approval.status !== "approved"))
    return refused(job, "not_approved", deps);

  if (deps.isStopped()) return refused(job, "stopped", deps);

  const spend = deps.spend();
  if (
    !spend ||
    Object.entries(SPEND_LIMITS).some(
      ([key, limit]) => !Number.isFinite(spend[key]) || spend[key] < 0 || spend[key] > limit,
    )
  )
    return refused(job, "cap_reached", deps);

  if (deps.flagEnabled?.() !== true) return refused(job, "execution_disabled", deps);

  return { ok: true };
}
