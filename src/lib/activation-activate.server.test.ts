import { describe, expect, it, vi } from "vitest";
import { runActivation, type ActivationDeps } from "./activation-activate.server";
import { JackboyLinkError } from "./jackboy-link.server";

const ATTEMPT = "aaaaaaaa-0000-4000-8000-000000000001";
const snap = (o: Record<string, unknown> = {}) => ({
  contract: "omni.safety/v1" as const,
  checkedAt: new Date().toISOString(),
  validUntil: new Date(Date.now() + 30_000).toISOString(),
  killSwitch: false,
  emergencyStop: true,
  codeEnabled: true,
  authorization: { id: "c0ffee00-0000-4000-8000-000000000001", expiresAt: new Date(Date.now() + 3600_000).toISOString() },
  autonomousAllowed: false,
  blockedBy: "emergency_stop_engaged",
  manualDiagnosticsAllowed: true,
  activePermits: 0,
  proofDigest: "a".repeat(64),
  ...o,
});

function deps(o: Partial<ActivationDeps> = {}) {
  const d = {
    begin: vi.fn(async () => ({ ok: true, duplicate: false })),
    finish: vi.fn(async (_k, _a, ok: boolean) => (ok ? ("active" as const) : ("failed" as const))),
    connect: vi.fn(async () => {}),
    safety: vi.fn(async () => snap()),
    recordSafety: vi.fn(async () => "engaged"),
    recordSafetyFailure: vi.fn(async () => "unknown"),
    safetyFailureReason: () => "read_http_503_permit_service_unavailable",
    ...o,
  };
  return d as typeof d & ActivationDeps;
}

describe("Step 9/10 activation", () => {
  it("activates the live link after a verified handshake and records the signed safety reading", async () => {
    const d = deps();
    const r = await runActivation("live_link", ATTEMPT, d);
    expect(r).toMatchObject({ ok: true, already: false });
    expect(d.recordSafety).toHaveBeenCalledTimes(1);
    expect(d.finish).toHaveBeenCalledWith("live_link", ATTEMPT, true, "verified", expect.objectContaining({ handshakeAt: expect.any(String) }));
  });
  it("rolls back (finishes failed) when the handshake fails, and reports Jackboy's refusal", async () => {
    const d = deps({ connect: vi.fn().mockRejectedValue(new JackboyLinkError("x", "http", { status: 403, code: "grant_unavailable" })) });
    const r = await runActivation("live_link", ATTEMPT, d);
    expect(r).toMatchObject({ ok: false, reason: "safety_denial" });
    expect(d.finish).toHaveBeenCalledWith("live_link", ATTEMPT, false, "handshake_safety_denial", {});
    expect(d.safety).not.toHaveBeenCalled();
  });
  it("rolls back on a handshake timeout (stale network)", async () => {
    const d = deps({ connect: vi.fn().mockRejectedValue(new JackboyLinkError("t", "timeout", { limitMs: 5000 })) });
    const r = await runActivation("live_link", ATTEMPT, d);
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
    expect(d.finish.mock.calls[0]![2]).toBe(false);
  });
  it("still activates the link when the safety read fails, recording unknown (fail closed)", async () => {
    const d = deps({ safety: vi.fn().mockRejectedValue(new Error("503")) });
    const r = await runActivation("live_link", ATTEMPT, d);
    expect(r.ok).toBe(true);
    expect(d.recordSafetyFailure).toHaveBeenCalledWith("read_http_503_permit_service_unavailable");
    if (r.ok) expect(r.message).toContain("counts as stopped");
  });
  it("never sends anything while another attempt is in progress or prerequisites are missing", async () => {
    for (const reason of ["busy", "step8_proof_not_fresh", "mothership_stop_engaged", "mfa"]) {
      const d = deps({ begin: vi.fn(async () => ({ ok: false, reason })) });
      const r = await runActivation("live_link", ATTEMPT, d);
      expect(r.ok).toBe(false);
      expect(d.connect).not.toHaveBeenCalled();
      expect(d.finish).not.toHaveBeenCalled();
    }
  });
  it("is idempotent: an already-active activation records nothing and sends nothing", async () => {
    const d = deps({ begin: vi.fn(async () => ({ ok: true, duplicate: true })) });
    const r = await runActivation("autonomy", ATTEMPT, d);
    expect(r).toMatchObject({ ok: true, already: true });
    expect(d.connect).not.toHaveBeenCalled();
    expect(d.finish).not.toHaveBeenCalled();
  });
  it("autonomy: refused without a readable safety snapshot or without Jackboy's authorization", async () => {
    const a = deps({ safety: vi.fn().mockRejectedValue(new Error("x")) });
    expect(await runActivation("autonomy", ATTEMPT, a)).toMatchObject({ ok: false, reason: "jackboy_safety" });
    expect(a.finish).toHaveBeenCalledWith("autonomy", ATTEMPT, false, "jackboy_safety_unavailable", {});
    const b = deps({ safety: vi.fn(async () => snap({ authorization: null })) });
    expect(await runActivation("autonomy", ATTEMPT, b)).toMatchObject({ ok: false, reason: "jackboy_authorization" });
    expect(b.finish).toHaveBeenCalledWith("autonomy", ATTEMPT, false, "jackboy_authorization_missing", {});
  });
  it("autonomy: activates as authorization only while the CODE Emergency Stop is engaged, listing what blocks execution", async () => {
    const d = deps();
    const r = await runActivation("autonomy", ATTEMPT, d);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.message).toContain("not running");
      expect(r.blockers).toContain("Jackboy CODE Emergency Stop is engaged.");
      expect(r.blockers.join(" ")).toContain("No OMNI executor");
    }
    const evidence = d.finish.mock.calls[0]![4] as Record<string, unknown>;
    expect(evidence["caps"]).toEqual({ perCallUsd: 0.5, perTaskUsd: 1, dailyUsd: 5, openaiCapUsd: 10 });
  });
  it("autonomy: Mothership cap/metering preflight blocks before anything is begun", async () => {
    const d = deps({ preflight: async () => "today's recorded spend has reached the $5 daily limit." });
    const r = await runActivation("autonomy", ATTEMPT, d);
    expect(r).toMatchObject({ ok: false, reason: "rule" });
    expect(d.begin).not.toHaveBeenCalled();
  });
  it("reports not active when the database supersedes the attempt or the record fails", async () => {
    const a = deps({ finish: vi.fn(async () => "superseded" as const) });
    expect(await runActivation("live_link", ATTEMPT, a)).toMatchObject({ ok: false });
    const b = deps({ finish: vi.fn().mockRejectedValue(new Error("db")) });
    expect(await runActivation("live_link", ATTEMPT, b)).toMatchObject({ ok: false, reason: "not_recorded" });
  });
});
