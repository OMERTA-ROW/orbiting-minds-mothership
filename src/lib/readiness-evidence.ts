/**
 * Read-only readiness evidence: for each gate, the latest recorded timestamp and where it came
 * from. Pure; it only describes records the server already read. "current" means the evidence is
 * recent enough for its own rule; it never means a switch is released or work may run.
 */
import type { SafetyView } from "./jackboy-safety";

export const HANDSHAKE_FRESH_MS = 30 * 60_000; // Jackboy's Step 9 checklist window.
export const SELF_TEST_PROOF_MS = 24 * 3600_000;

export type EvidenceStatus = "current" | "stale" | "expired" | "missing" | "unreadable";
export type EvidenceGroup = "handshake" | "permit" | "authorization" | "expiry" | "stops";

export interface EvidenceRow {
  id: string;
  group: EvidenceGroup;
  label: string;
  /** What the record says (e.g. "engaged", "approved"); never an inferred value. */
  value: string;
  status: EvidenceStatus;
  /** The timestamp the row is about (ISO), or null when nothing is recorded. */
  at: string | null;
  /** What `at` means, e.g. "accepted at", "expires at". */
  atLabel: string;
  /** The record the value came from, and whether it is signed by Jackboy. */
  source: string;
  signed: boolean;
  detail: string;
}

export interface PermitRecord {
  kind: string;
  status: string;
  issuedAt: string;
  expiresAt: string;
  closedAt: string | null;
  closedReason: string | null;
}

export interface EvidenceInput {
  now: number;
  handshake: { lastConnectedAt: string | null; lastAttemptAt: string | null };
  safety: SafetyView;
  /** Latest recorded Jackboy permit; null = none recorded; "unreadable" = read failed. */
  permit: PermitRecord | null | "unreadable";
  approvals: Array<{ step: number; status: string; decided_at: string | null; approval_expires_at: string | null }>;
  activations: Array<{ kind: "live_link" | "autonomy"; status: string; activatedAt: string | null; updatedAt: string; effective: boolean }> | null;
  selfTest: { action: string; occurred_at: string } | null;
  mothershipStop: { engaged: boolean | null; changedAt: string | null };
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

const SAFETY_SOURCE: Record<SafetyView["source"], { text: string; signed: boolean }> = {
  poll: { text: "Signed Jackboy safety reading (omni.safety/v1), verified by Mothership", signed: true },
  event: { text: "Signed Jackboy stop event, verified by Mothership", signed: true },
  failure: { text: "Failed safety read recorded by Mothership (not signed by Jackboy)", signed: false },
  stale: { text: "Expired Jackboy safety reading recorded by Mothership", signed: false },
  none: { text: "No Jackboy safety reading has been recorded", signed: false },
};

function safetyEvidence(s: SafetyView): EvidenceStatus {
  if (s.source === "none") return "missing";
  if (s.source === "failure") return "unreadable";
  if (s.source === "stale" || s.state === "stale") return "stale";
  return s.state === "unknown" ? "unreadable" : "current";
}

export function readinessEvidence(i: EvidenceInput): EvidenceRow[] {
  const rows: EvidenceRow[] = [];
  const step = (n: number) => i.approvals.find((r) => r.step === n);

  // 1. Live handshake.
  const hs = ms(i.handshake.lastConnectedAt);
  const age = i.now - hs;
  const attemptAfter =
    i.handshake.lastAttemptAt !== null &&
    (i.handshake.lastConnectedAt === null || i.handshake.lastConnectedAt < i.handshake.lastAttemptAt);
  rows.push({
    id: "handshake",
    group: "handshake",
    label: "Live signed handshake",
    value: Number.isFinite(hs) ? "accepted" : "none recorded",
    status: !Number.isFinite(hs) ? "missing" : age >= -60_000 && age <= HANDSHAKE_FRESH_MS ? "current" : "stale",
    at: i.handshake.lastConnectedAt,
    atLabel: "accepted at",
    source: "Mothership audit log: Jackboy's signed session reply, verified by Mothership",
    signed: Number.isFinite(hs),
    detail:
      (Number.isFinite(hs)
        ? "Jackboy's Step 9 checklist needs one within the last 30 minutes."
        : "No signed handshake has been accepted yet.") +
      (attemptAfter ? ` A later attempt at ${i.handshake.lastAttemptAt} did not complete.` : ""),
  });
  const src = SAFETY_SOURCE[i.safety.source];
  rows.push({
    id: "safety_read",
    group: "handshake",
    label: "Latest Jackboy safety reading",
    value: i.safety.label,
    status: safetyEvidence(i.safety),
    at: i.safety.observedAt ?? i.safety.recordedAt,
    atLabel: i.safety.observedAt ? "observed by Jackboy at" : "recorded at",
    source: src.text,
    signed: src.signed,
    detail: i.safety.detail,
  });

  // 2. Signed permit decision.
  if (i.permit === "unreadable") {
    rows.push({
      id: "permit", group: "permit", label: "Latest signed permit decision", value: "unreadable",
      status: "unreadable", at: null, atLabel: "issued at",
      source: "Mothership permit mirror (jackboy permits record)", signed: false,
      detail: "The permit record could not be read, so no permit is treated as valid.",
    });
  } else if (!i.permit) {
    rows.push({
      id: "permit", group: "permit", label: "Latest signed permit decision", value: "none issued",
      status: "missing", at: null, atLabel: "issued at",
      source: "Mothership permit mirror (jackboy permits record)", signed: false,
      detail: "Jackboy has never issued OMNI a permit. Only signature-verified permits are stored; refusals are not.",
    });
  } else {
    const p = i.permit;
    const live = p.status === "active" && ms(p.expiresAt) > i.now;
    rows.push({
      id: "permit", group: "permit", label: "Latest signed permit decision",
      value: `${p.kind} permit ${p.status}${p.closedReason ? ` (${p.closedReason.replace(/_/g, " ")})` : ""}`,
      status: live ? "current" : "expired",
      at: p.issuedAt, atLabel: "issued at",
      source: "Signed Jackboy permit (omni.permit/v1), verified and mirrored by Mothership", signed: true,
      detail: live
        ? `Valid until ${p.expiresAt}; it must keep renewing.`
        : `Closed${p.closedAt ? ` at ${p.closedAt}` : ""}; no work may rely on it.`,
    });
  }

  // 3. Owner authorization.
  const decided = [step(9), step(10)].filter((r) => r?.status === "approved" && r.decided_at) as Array<{
    step: number; decided_at: string;
  }>;
  rows.push({
    id: "owner_approvals", group: "authorization", label: "Owner approvals, Steps 9–10",
    value: decided.length === 2 ? "both approved" : decided.length === 1 ? `only Step ${decided[0].step} approved` : "not approved",
    status: decided.length === 2 ? "current" : "missing",
    at: decided.length ? decided.map((r) => r.decided_at).sort().at(-1)! : null,
    atLabel: "last approved at",
    source: "Mothership activation approvals record (owner, two-step verified)", signed: false,
    detail: "Approval records your decision; activation is a separate owner action.",
  });
  for (const kind of ["live_link", "autonomy"] as const) {
    const a = i.activations?.find((x) => x.kind === kind);
    const name = kind === "live_link" ? "Owner activation, live link (Step 9)" : "Owner activation, autonomy (Step 10)";
    rows.push({
      id: `activation_${kind}`, group: "authorization", label: name,
      value: !i.activations ? "unreadable" : !a ? "no record" : a.effective ? "in effect" : a.status === "active" ? "recorded, no longer in effect" : a.status,
      status: !i.activations ? "unreadable" : a?.effective ? "current" : a?.status === "active" ? "expired" : "missing",
      at: a ? (a.effective || a.status === "active" ? a.activatedAt : a.status === "inactive" ? null : a.updatedAt) : null,
      atLabel: a?.effective || a?.status === "active" ? "activated at" : "last changed at",
      source: "Mothership activation record; in-effect verdict from the database", signed: false,
      detail: a?.effective ? "Configuration only; it starts no work." : "Use the matching Activate button with a fresh two-step code.",
    });
  }
  const authExp = ms(i.safety.authorizationExpiresAt);
  rows.push({
    id: "jackboy_authorization", group: "authorization", label: "Jackboy authorization for OMNI autonomy",
    value: i.safety.autonomousAllowed === "yes" ? "allowed" : i.safety.autonomousAllowed === "no" ? "not allowed" : "unknown",
    status: i.safety.source === "none" ? "missing"
      : safetyEvidence(i.safety) !== "current" ? safetyEvidence(i.safety)
      : Number.isFinite(authExp) ? (authExp > i.now ? "current" : "expired") : "missing",
    at: i.safety.authorizationExpiresAt, atLabel: "expires at",
    source: src.text, signed: src.signed,
    detail: Number.isFinite(authExp)
      ? "Set by your passkey in Jackboy; Mothership only reads it."
      : "No Jackboy authorization has been reported. Authorize OMNI autonomy in Jackboy with your passkey.",
  });

  // 4. Approval expiry.
  const s7 = step(7);
  const s7exp = ms(s7?.approval_expires_at);
  rows.push({
    id: "step7_window", group: "expiry", label: "Step 7 approval window",
    value: s7?.status === "approved" ? "approved" : (s7?.status ?? "no record"),
    status: !Number.isFinite(s7exp) ? "missing" : s7exp > i.now && s7?.status === "approved" ? "current" : "expired",
    at: s7?.approval_expires_at ?? null, atLabel: "expires at",
    source: "Mothership activation approvals record", signed: false,
    detail: "Steps 9–10 activations stop being in effect when this window ends.",
  });
  const st = ms(i.selfTest?.occurred_at);
  const passed = i.selfTest?.action === "self_test_passed";
  rows.push({
    id: "step8_proof", group: "expiry", label: "Step 8 signed self-test proof",
    value: !i.selfTest ? "none recorded" : passed ? "passed" : "failed",
    status: !Number.isFinite(st) ? "missing" : passed && st + SELF_TEST_PROOF_MS > i.now ? "current" : "expired",
    at: Number.isFinite(st) ? new Date(st + SELF_TEST_PROOF_MS).toISOString() : null,
    atLabel: "proof valid until",
    source: "Mothership audit log: runner result signed by Jackboy, verified by Mothership", signed: Number.isFinite(st),
    detail: Number.isFinite(st) ? `Recorded ${i.selfTest!.occurred_at}; valid for 24 hours.` : "Run the Step 8 self-test.",
  });

  // 5. Stops.
  const m = i.mothershipStop.engaged;
  rows.push({
    id: "mothership_stop", group: "stops", label: "Mothership Emergency Stop",
    value: m === null ? "unknown" : m ? "engaged" : "released",
    status: m === null ? "unreadable" : "current",
    at: i.mothershipStop.changedAt, atLabel: "last changed at",
    source: "Mothership terminal controls record", signed: false,
    detail: m === null ? "Unreadable, so autonomous and CODE work stay halted." : "Read directly from Mothership's own record.",
  });
  const sEv = safetyEvidence(i.safety);
  for (const [id, label, value] of [
    ["jackboy_code_stop", "Jackboy CODE Emergency Stop", i.safety.codeStop],
    ["jackboy_kill_switch", "Jackboy System Kill Switch", i.safety.killSwitch],
  ] as const) {
    rows.push({
      id, group: "stops", label, value, status: sEv,
      at: i.safety.observedAt ?? i.safety.recordedAt,
      atLabel: i.safety.observedAt ? "observed by Jackboy at" : "recorded at",
      source: src.text, signed: src.signed,
      detail: sEv === "current" ? "From the latest signed reading." : "No current signed reading, so this counts as blocked.",
    });
  }
  return rows;
}
