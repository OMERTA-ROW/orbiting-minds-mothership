import { describe, expect, it, vi } from "vitest";
import {
  executorOwnerAction,
  orchestrate,
  readinessChecklist,
  type OrchestrationDeps,
  type ReadinessInput,
} from "./activation-orchestration";

const ATTEMPTS = {
  live_link: "11111111-1111-4111-8111-111111111111",
  autonomy: "22222222-2222-4222-8222-222222222222",
};
const ENABLED = {
  ok: true as const,
  release: "omni-bounded-plan-1",
  reviewedRelease: "omni-bounded-plan-1",
  enabled: true,
};

function deps(over: Partial<OrchestrationDeps> = {}) {
  const on = { live_link: false, autonomy: false };
  const d = {
    effective: vi.fn(async (k: "live_link" | "autonomy") => on[k]),
    activate: vi.fn(async (k: "live_link" | "autonomy") => {
      on[k] = true;
      return { ok: true, message: `${k} ok` };
    }),
    inspectExecutor: vi.fn(async () => ENABLED),
    pinned: vi.fn(() => true),
    armed: vi.fn(async () => false),
    verifyAndArm: vi.fn(async () => {}),
    ...over,
  };
  return d;
}
const ALL = { liveLink: true, autonomy: true, arm: true };

describe("combined activation sequencing", () => {
  it("runs Step 9, then Step 10, then arm, in order, once each", async () => {
    const d = deps();
    const r = await orchestrate(ALL, ATTEMPTS, d);
    expect(d.activate.mock.calls).toEqual([
      ["live_link", ATTEMPTS.live_link],
      ["autonomy", ATTEMPTS.autonomy],
    ]);
    expect(d.verifyAndArm).toHaveBeenCalledTimes(1);
    expect(r.stages.map((s) => s.status)).toEqual(["done", "done", "done"]);
    expect(r.partial).toBe(false);
  });

  it("never re-runs a step already in effect (a new connect would clear verification)", async () => {
    const d = deps({ effective: vi.fn(async () => true), armed: vi.fn(async () => true) });
    const r = await orchestrate(ALL, ATTEMPTS, d);
    expect(d.activate).not.toHaveBeenCalled();
    expect(d.verifyAndArm).not.toHaveBeenCalled();
    expect(r.stages.map((s) => s.status)).toEqual(["already", "already", "already"]);
  });

  it("a failed Step 9 stops Step 10 and arming", async () => {
    const d = deps({ activate: vi.fn(async () => ({ ok: false, message: "refused" })) });
    const r = await orchestrate(ALL, ATTEMPTS, d);
    expect(d.activate).toHaveBeenCalledTimes(1);
    expect(d.verifyAndArm).not.toHaveBeenCalled();
    expect(r.stages.map((s) => s.status)).toEqual(["failed", "skipped", "skipped"]);
    expect(r.summary).toMatch(/^Nothing was activated/);
  });

  it("a failed Step 10 is reported as partial with Step 9 still in effect", async () => {
    const d = deps({
      activate: vi.fn(async (k: "live_link" | "autonomy") =>
        k === "live_link" ? { ok: true, message: "ok" } : { ok: false, message: "rolled back" },
      ),
    });
    const r = await orchestrate(ALL, ATTEMPTS, d);
    expect(r.partial).toBe(true);
    expect(r.stages.map((s) => s.status)).toEqual(["done", "failed", "skipped"]);
    expect(r.summary).toContain("In effect: Step 9 live link");
    expect(d.verifyAndArm).not.toHaveBeenCalled();
  });

  it("does not arm while the Railway executor is disabled and names the exact setting", async () => {
    const d = deps({ inspectExecutor: vi.fn(async () => ({ ...ENABLED, enabled: false })) });
    const r = await orchestrate(ALL, ATTEMPTS, d);
    expect(d.verifyAndArm).not.toHaveBeenCalled();
    expect(r.stages[2]!.status).toBe("skipped");
    expect(r.ownerAction).toContain("OMNI_AUTONOMOUS_ENABLED=true");
  });

  it("never arms unless arming was selected", async () => {
    const d = deps();
    await orchestrate({ liveLink: true, autonomy: true, arm: false }, ATTEMPTS, d);
    expect(d.verifyAndArm).not.toHaveBeenCalled();
    expect(d.inspectExecutor).not.toHaveBeenCalled();
  });

  it("does not start Step 10 when Step 9 is neither in effect nor selected", async () => {
    const d = deps();
    const r = await orchestrate({ liveLink: false, autonomy: true, arm: false }, ATTEMPTS, d);
    expect(d.activate).not.toHaveBeenCalled();
    expect(r.stages[1]!.status).toBe("skipped");
  });

  it("an unreadable state sends nothing", async () => {
    const d = deps({ effective: vi.fn(async () => Promise.reject(new Error("x"))) });
    const r = await orchestrate(ALL, ATTEMPTS, d);
    expect(d.activate).not.toHaveBeenCalled();
    expect(r.stages[0]!.status).toBe("failed");
  });

  it("an arm refusal leaves Step 10 configured and says so", async () => {
    const d = deps({ verifyAndArm: vi.fn(async () => Promise.reject(new Error("Jackboy blocks"))) });
    const r = await orchestrate(ALL, ATTEMPTS, d);
    expect(r.stages[2]).toMatchObject({ status: "failed" });
    expect(r.stages[2]!.message).toContain("Step 10 stays configured, not armed");
  });
});

describe("executor owner action", () => {
  it("asks for the Railway reviewed-release setting before the enable switch", () => {
    expect(executorOwnerAction({ ...ENABLED, reviewedRelease: null, enabled: false }, true)).toContain(
      "OMNI_AUTONOMY_REVIEWED_RELEASE=omni-bounded-plan-1 on the omni-autonomous",
    );
  });
  it("asks for Mothership's pin when Railway is ready", () => {
    expect(executorOwnerAction(ENABLED, false)).toContain("Mothership's secrets");
    expect(executorOwnerAction(ENABLED, true)).toBeNull();
  });
});

const NOW = Date.parse("2026-11-16T22:30:00Z");
function ready(over: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    now: NOW,
    jackboyBuild: { commit: "9081a4187c4f8e691e209f12ec3afd1db3b75b91", builtAt: "2026-11-16T21:55:36Z" },
    windowEndsAt: "2026-11-17T03:49:58.534Z",
    step9Approved: true,
    step10Approved: true,
    linkEffective: true,
    autonomyEffective: true,
    mothershipStop: false,
    jackboy: {
      connected: true,
      configured: true,
      armed: true,
      running: false,
      emergencyStop: false,
      killSwitch: false,
      executorRelease: "omni-bounded-plan-1",
      cancellationPending: false,
    },
    executor: ENABLED,
    pinned: true,
    codeEnabled: true,
    codeAllowed: null,
    activePermits: 0,
    sandbox: { configured: false, enabled: false },
    ...over,
  };
}

describe("readiness checklist", () => {
  it("is operational only when every required item is proven", () => {
    expect(readinessChecklist(ready()).operational).toBe(true);
  });
  it("is not operational while the Railway executor is disabled", () => {
    const r = readinessChecklist(ready({ executor: { ...ENABLED, enabled: false } }));
    expect(r.operational).toBe(false);
    expect(r.items.find((i) => i.id === "executor")!.detail).toContain("OMNI_AUTONOMOUS_ENABLED=true");
  });
  it("counts an unavailable signed reading as stopped", () => {
    const r = readinessChecklist(ready({ jackboy: null }));
    expect(r.operational).toBe(false);
    expect(r.items.find((i) => i.id === "stops")!.status).toBe("unknown");
  });
  it("treats an engaged Jackboy stop as blocked, never ready", () => {
    const j = ready().jackboy!;
    const r = readinessChecklist(ready({ jackboy: { ...j, emergencyStop: true } }));
    expect(r.items.find((i) => i.id === "stops")!.status).toBe("blocked");
    expect(r.operational).toBe(false);
  });
  it("keeps the manual terminal separate from autonomy readiness", () => {
    const r = readinessChecklist(ready());
    const t = r.items.find((i) => i.id === "terminal")!;
    expect(t.required).toBe(false);
    expect(t.detail).toContain("OMNI_SANDBOX_ORIGIN");
  });
  it("flags a window ending within 30 minutes", () => {
    const r = readinessChecklist(ready({ windowEndsAt: "2026-11-16T22:45:00Z" }));
    expect(r.items.find((i) => i.id === "window")!.status).toBe("action");
  });
});
