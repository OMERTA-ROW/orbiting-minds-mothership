import { describe, expect, it } from "vitest";
import {
  CODE_QUEUE_LIMITS,
  DEFAULT_CODE_SERVICE,
  backoffSeconds,
  codeServiceStatus,
  inWindow,
  pickLeasable,
  transition,
  type CodeJob,
  type CodeServiceContext,
} from "./omni-code-queue";

const NOW = Date.parse("2026-11-12T20:00:00Z");
const job = (o: Partial<CodeJob> = {}): CodeJob => ({
  id: "j1",
  agentId: "omni",
  kind: "code_task",
  status: "queued",
  attempts: 0,
  maxAttempts: 3,
  destructive: false,
  approvedAt: null,
  notBefore: null,
  leaseExpiresAt: null,
  checkpoint: null,
  createdAt: NOW - 1000,
  ...o,
});
const live: CodeServiceContext = {
  now: NOW,
  localHour: 2,
  settings: { ...DEFAULT_CODE_SERVICE, alwaysOn: true, alwaysOnUntil: NOW + 3600_000 },
  readinessPassed: true,
  emergencyStopReleased: true,
  killSwitchEnabled: true,
  pausedAgents: new Set(),
  companionHeartbeatAt: NOW - 5000,
  companionIdleSeconds: 3600,
};
const ok = (r: CodeJob | string) => {
  if (typeof r === "string") throw new Error(r);
  return r;
};

describe("CODE job state machine", () => {
  it("runs queued → leased → running → succeeded", () => {
    let j = ok(transition(job(), { type: "lease" }, NOW));
    j = ok(transition(j, { type: "start" }, NOW));
    expect(j.attempts).toBe(1);
    expect(ok(transition(j, { type: "succeed" }, NOW)).status).toBe("succeeded");
  });
  it("retries a retryable failure with backoff, up to the attempt limit", () => {
    let j = ok(transition(ok(transition(job(), { type: "lease" }, NOW)), { type: "start" }, NOW));
    j = ok(transition(j, { type: "fail", retryable: true }, NOW));
    expect(j.status).toBe("retry_wait");
    expect(j.notBefore).toBe(NOW + 30_000);
    expect(typeof transition(j, { type: "lease" }, NOW)).toBe("string"); // not before backoff
    const last = job({ status: "running", attempts: 3 });
    expect(ok(transition(last, { type: "fail", retryable: true }, NOW)).status).toBe("failed");
    expect(backoffSeconds(10)).toBe(CODE_QUEUE_LIMITS.backoffMaxSec);
  });
  it("never retries a destructive job automatically", () =>
    expect(ok(transition(job({ status: "running", attempts: 1, destructive: true }), { type: "fail", retryable: true }, NOW)).status).toBe("failed"));
  it("resumes from its checkpoint when a worker's lease expires", () => {
    const j = job({ status: "running", attempts: 1, checkpoint: "step-4", leaseExpiresAt: NOW - 1 });
    const r = ok(transition(j, { type: "lease_expired" }, NOW));
    expect(r.status).toBe("queued");
    expect(r.checkpoint).toBe("step-4");
    expect(typeof transition({ ...j, leaseExpiresAt: NOW + 1000 }, { type: "lease_expired" }, NOW)).toBe("string");
  });
  it("sends an interrupted destructive job back to the owner instead of resuming it", () =>
    expect(ok(transition(job({ status: "running", attempts: 1, destructive: true, leaseExpiresAt: NOW - 1 }), { type: "lease_expired" }, NOW)).status).toBe("awaiting_approval"));
  it("refuses to lease a file-changing job without approval", () => {
    expect(transition(job({ kind: "file_apply" }), { type: "lease" }, NOW)).toMatch(/approval/);
    const a = ok(transition(job({ kind: "file_apply" }), { type: "approve" }, NOW));
    expect(ok(transition(a, { type: "lease" }, NOW)).status).toBe("leased");
  });
  it("pauses, resumes, stops; finished jobs stay finished", () => {
    const p = ok(transition(job({ status: "running" }), { type: "pause" }, NOW));
    expect(ok(transition(p, { type: "resume" }, NOW)).status).toBe("queued");
    const s = ok(transition(job({ status: "running" }), { type: "stop" }, NOW));
    expect(typeof transition(s, { type: "resume" }, NOW)).toBe("string");
    expect(typeof transition(job({ status: "running" }), { type: "cancel" }, NOW)).toBe("string");
  });
});

describe("CODE service status (fails closed)", () => {
  it("is off by default", () => {
    const r = codeServiceStatus({ ...live, settings: DEFAULT_CODE_SERVICE });
    expect(r.processing).toBe(false);
    expect(r.reasons).toContain("CODE always-on is off.");
  });
  it("stops on Emergency Stop, kill switch, failed readiness or expired authorization", () => {
    expect(codeServiceStatus({ ...live, emergencyStopReleased: null }).processing).toBe(false);
    expect(codeServiceStatus({ ...live, killSwitchEnabled: false }).processing).toBe(false);
    expect(codeServiceStatus({ ...live, readinessPassed: false }).processing).toBe(false);
    expect(codeServiceStatus({ ...live, settings: { ...live.settings, alwaysOnUntil: NOW - 1 } }).processing).toBe(false);
    expect(codeServiceStatus(live).processing).toBe(true);
  });
  it("treats a stale or missing companion heartbeat as disconnected", () => {
    expect(codeServiceStatus({ ...live, companionHeartbeatAt: NOW - 61_000 }).companion).toBe(false);
    expect(codeServiceStatus({ ...live, companionHeartbeatAt: null }).companion).toBe(false);
  });
  it("handles overnight hour windows", () => {
    expect(inWindow(23, 22, 6)).toBe(true);
    expect(inWindow(12, 22, 6)).toBe(false);
    expect(inWindow(12, null, null)).toBe(true);
  });
});

describe("leasing: bounded concurrency, rate and scoping", () => {
  const many = (n: number, agentId = "omni", kind: CodeJob["kind"] = "code_task") =>
    Array.from({ length: n }, (_, i) => job({ id: `${agentId}-${i}`, agentId, kind, createdAt: NOW - 10_000 + i }));
  it("leases nothing while the service is off", () => expect(pickLeasable(many(3), { ...live, settings: DEFAULT_CODE_SERVICE }, {})).toEqual([]));
  it("respects the per-agent and global limits, oldest first", () => {
    expect(pickLeasable(many(5), live, {})).toEqual(["omni-0", "omni-1"]);
    const mixed = [...many(3, "omni"), ...many(3, "razul"), ...many(3, "jax")];
    expect(pickLeasable(mixed, live, {})).toHaveLength(3);
  });
  it("never leases Jackboy jobs or paused agents", () => {
    expect(pickLeasable(many(2, "jackboy"), live, {})).toEqual([]);
    expect(pickLeasable(many(2), { ...live, pausedAgents: new Set(["omni"]) }, {})).toEqual([]);
  });
  it("applies the hourly rate limit per agent", () => expect(pickLeasable(many(2), live, { omni: 20 })).toEqual([]));
  it("runs Mac jobs only with the companion connected and the Mac idle", () => {
    const files = many(1, "omni", "file_inventory");
    expect(pickLeasable(files, live, {})).toEqual(["omni-0"]);
    expect(pickLeasable(files, { ...live, companionHeartbeatAt: null }, {})).toEqual([]);
    expect(pickLeasable(files, { ...live, companionIdleSeconds: 60 }, {})).toEqual([]);
    expect(pickLeasable(files, { ...live, companionIdleSeconds: null }, {})).toEqual([]);
  });
  it("skips unapproved file changes", () => expect(pickLeasable(many(1, "omni", "file_apply"), live, {})).toEqual([]));
});
