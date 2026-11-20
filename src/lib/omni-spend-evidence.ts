/**
 * CODE spending-cap evidence for the OMNI web manifest. Pure and browser-safe.
 *
 * The only trusted proof of the limits Jackboy actually enforces is a Jackboy-signed
 * `omni.permit/v1` permit: the Mothership verifies its HMAC signature and refuses any permit whose
 * limits exceed the owner's caps before recording it (`jackboy-link.server.ts`), and the database
 * refuses a second active permit (one job at a time). A permit is per job and lasts about a
 * minute, so an old recorded permit is history, not proof of today's settings. The cap is reported
 * as verified (and `spendingCapUsd` is sent, which is the only field OMNI web reads) only while the
 * newest signed permit is fresh and within every owner cap. Otherwise it stays unverified with the
 * exact reason; nothing here issues a permit, makes a paid call or changes a limit.
 */

/** Owner-intended caps (USD) and the one-active-job rule. */
export const INTENDED_SPEND_LIMITS = {
  perCallUsd: 0.5,
  perTaskUsd: 1,
  dailyUsd: 5,
  maxActiveJobs: 1,
} as const;

/** A signed permit older than this no longer shows what Jackboy enforces now. */
export const SPEND_EVIDENCE_FRESH_MS = 15 * 60_000;

/** The newest recorded signed permit's limits (already signature-verified before recording). */
export type SignedPermitLimits = {
  perCallUsd: number;
  perTaskUsd: number;
  dailyUsd: number;
  recordedAt: string;
};

/** What the server could read: the newest permit (or none ever), or a read failure. */
export type SpendEvidenceRead =
  | { status: "read"; latest: SignedPermitLimits | null }
  | { status: "unreadable" }
  | { status: "not_read" };

export type SpendingCapState = "verified" | "stale" | "exceeds_caps" | "no_evidence" | "unknown";

export type SpendingCapView = {
  state: SpendingCapState;
  verified: boolean;
  intended: typeof INTENDED_SPEND_LIMITS;
  /** Checks the Mothership itself applies to every permit, whatever Jackboy sends. */
  mothershipChecks: {
    refusesPermitsAboveCaps: true;
    oneActivePermit: true;
  };
  lastSignedPermit:
    | (SignedPermitLimits & { withinCaps: boolean; matchesIntended: boolean; ageSeconds: number })
    | null;
  freshForSeconds: number;
  checkedAt: string;
  reason: string;
};

const within = (v: number, cap: number) => Number.isFinite(v) && v > 0 && v <= cap;

export function spendingCapView(read: SpendEvidenceRead, now: number): SpendingCapView {
  const base = {
    intended: INTENDED_SPEND_LIMITS,
    mothershipChecks: { refusesPermitsAboveCaps: true, oneActivePermit: true } as const,
    freshForSeconds: SPEND_EVIDENCE_FRESH_MS / 1000,
    checkedAt: new Date(now).toISOString(),
  };
  if (read.status !== "read")
    return {
      ...base,
      state: "unknown",
      verified: false,
      lastSignedPermit: null,
      reason:
        read.status === "unreadable"
          ? "The Mothership could not read its signed permit records, so the enforced cap is unknown."
          : "Signed permit records were not read for this response.",
    };
  const p = read.latest;
  if (!p)
    return {
      ...base,
      state: "no_evidence",
      verified: false,
      lastSignedPermit: null,
      reason:
        "Jackboy has never issued a signed permit to this Mothership, so its enforced cap is unproven.",
    };
  const recorded = Date.parse(p.recordedAt);
  const ageMs = Number.isFinite(recorded) ? Math.max(0, now - recorded) : Number.POSITIVE_INFINITY;
  const withinCaps =
    within(p.perCallUsd, INTENDED_SPEND_LIMITS.perCallUsd) &&
    within(p.perTaskUsd, INTENDED_SPEND_LIMITS.perTaskUsd) &&
    within(p.dailyUsd, INTENDED_SPEND_LIMITS.dailyUsd);
  const matchesIntended =
    p.perCallUsd === INTENDED_SPEND_LIMITS.perCallUsd &&
    p.perTaskUsd === INTENDED_SPEND_LIMITS.perTaskUsd &&
    p.dailyUsd === INTENDED_SPEND_LIMITS.dailyUsd;
  const lastSignedPermit = {
    ...p,
    withinCaps,
    matchesIntended,
    ageSeconds: Number.isFinite(ageMs) ? Math.floor(ageMs / 1000) : -1,
  };
  const limits = `$${p.perCallUsd}/call, $${p.perTaskUsd}/job, $${p.dailyUsd}/day`;
  if (!withinCaps)
    return {
      ...base,
      state: "exceeds_caps",
      verified: false,
      lastSignedPermit,
      reason: `The newest signed permit (${p.recordedAt}) shows ${limits}, above the owner caps.`,
    };
  if (!(ageMs <= SPEND_EVIDENCE_FRESH_MS))
    return {
      ...base,
      state: "stale",
      verified: false,
      lastSignedPermit,
      reason: `The newest signed permit (${p.recordedAt}) showed ${limits}, but it is older than ${SPEND_EVIDENCE_FRESH_MS / 60_000} minutes, so it does not prove the cap Jackboy enforces now.`,
    };
  return {
    ...base,
    state: "verified",
    verified: true,
    lastSignedPermit,
    reason: `A signed Jackboy permit from ${p.recordedAt} enforces ${limits}; one job at a time.`,
  };
}

/** The single number OMNI web reads: the daily cap, only while verified. */
export function manifestSpendingCapUsd(view: SpendingCapView): number | undefined {
  return view.verified && view.lastSignedPermit ? view.lastSignedPermit.dailyUsd : undefined;
}
