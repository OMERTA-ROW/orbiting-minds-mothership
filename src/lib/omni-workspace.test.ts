import { describe, expect, it } from "vitest";
import {
  GLOBAL_LIMITS,
  SELF_TEST_VALID_MS,
  agentGrantInput,
  autonomyActive,
  autonomyInput,
  budgetDecision,
  capHead,
  needsOwnerDecision,
  remoteReply,
  sessionEndReason,
  workspaceGate,
} from "./omni-workspace";

const now = 1_800_000_000_000;
const open = {
  linkConfigured: true,
  selfTestPassedAt: now - 1000,
  killSwitchEnabled: true,
  emergencyStopReleased: true,
  linkApprovalValid: true,
  passkeyFresh: true,
  now,
};

describe("workspace gate", () => {
  it("opens only when every item is true", () => expect(workspaceGate(open).open).toBe(true));
  it("stays closed before the self-test passes", () =>
    expect(workspaceGate({ ...open, selfTestPassedAt: null }).open).toBe(false));
  it("treats a self-test older than 24 hours as not passed", () =>
    expect(workspaceGate({ ...open, selfTestPassedAt: now - SELF_TEST_VALID_MS - 1 }).open).toBe(false));
  it("unreadable kill switch counts as disabled", () =>
    expect(workspaceGate({ ...open, killSwitchEnabled: null }).open).toBe(false));
  it("engaged Emergency Stop blocks", () =>
    expect(workspaceGate({ ...open, emergencyStopReleased: false }).open).toBe(false));
  it("stale passkey blocks", () => expect(workspaceGate({ ...open, passkeyFresh: false }).open).toBe(false));
});

describe("session timeout", () => {
  it("locks after 10 idle minutes", () =>
    expect(sessionEndReason({ startedAt: now - 11 * 60_000, lastActivityAt: now - 10 * 60_000, endedAt: null }, now)).toBe("timeout"));
  it("ends after 60 minutes regardless of activity", () =>
    expect(sessionEndReason({ startedAt: now - 60 * 60_000, lastActivityAt: now, endedAt: null }, now)).toBe("max_age"));
  it("stays open while active", () =>
    expect(sessionEndReason({ startedAt: now - 5 * 60_000, lastActivityAt: now - 9 * 60_000, endedAt: null }, now)).toBeNull());
});

describe("spend limits", () => {
  const big = { task: 100, day: 500, total: 1000 };
  const zero = { task: 0, day: 0, total: 0 };
  it("limits are $1 task, $5 day, $10 total", () => expect(GLOBAL_LIMITS).toEqual({ task: 100, day: 500, total: 1000 }));
  it("stops at $1 for one task", () => expect(budgetDecision({ task: 100, day: 100, total: 100 }, zero, big).allowed).toBe(false));
  it("stops at $5 per day", () => expect(budgetDecision({ task: 0, day: 500, total: 500 }, zero, big).allowed).toBe(false));
  it("stops at $10 total", () => expect(budgetDecision({ task: 0, day: 0, total: 1000 }, zero, big).allowed).toBe(false));
  it("allows under every limit", () => expect(budgetDecision({ task: 99, day: 499, total: 999 }, zero, big).allowed).toBe(true));
  it("an agent with no budget cannot spend", () => expect(budgetDecision(zero, zero, zero).allowed).toBe(false));
  it("one agent's budget is checked against its own usage", () =>
    expect(budgetDecision({ task: 0, day: 300, total: 300 }, { task: 0, day: 50, total: 50 }, { task: 100, day: 200, total: 500 }).allowed).toBe(true));
  it("agent budgets cannot exceed the overall limits", () =>
    expect(agentGrantInput.safeParse({ checkId: crypto.randomUUID(), agentId: "omni", status: "enrolled", allowedActions: [], budgetTaskCents: 101, budgetDayCents: 0, budgetTotalCents: 0 }).success).toBe(false));
});

describe("autonomy and approvals", () => {
  it("expires on time", () => {
    expect(autonomyActive({ expiresAt: now + 1, endedAt: null }, now)).toBe(true);
    expect(autonomyActive({ expiresAt: now, endedAt: null }, now)).toBe(false);
  });
  it("only 15, 30 or 60 minutes", () =>
    expect(autonomyInput.safeParse({ agentId: "omni", on: true, minutes: 120 }).success).toBe(false));
  it("deploys, merges and secrets need the owner even in Autonomous Mode", () => {
    for (const gated of ["merge", "deploy", "secrets"]) expect(needsOwnerDecision({ kind: "command", gated }, true)).toBe(true);
  });
  it("without autonomy, every edit and command waits", () => {
    expect(needsOwnerDecision({ kind: "diff", gated: null }, false)).toBe(true);
    expect(needsOwnerDecision({ kind: "command", gated: null }, true)).toBe(false);
  });
});

describe("untrusted OMNI replies and audit", () => {
  it("rejects unknown gated kinds", () =>
    expect(remoteReply.safeParse({ contract: "omni.workspace/v1", requestNonce: "n", steps: [{ id: "a", kind: "command", gated: "rm" }] }).success).toBe(false));
  it("audit keeps at most 4 KB of output", () => expect(new TextEncoder().encode(capHead("é".repeat(5000))).byteLength).toBeLessThanOrEqual(4096));
});
