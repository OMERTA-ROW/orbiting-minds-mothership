import { describe, expect, it } from "vitest";
import {
  buildDispatchRequest,
  classifyIntent,
  dispatchTarget,
  planHandoffs,
  rasulFallbackAnswer,
  SPECIALIST_CAPABILITIES,
} from "./rasul-chat";

describe("classifyIntent", () => {
  it("routes dispatch verbs to dispatch", () => {
    expect(classifyIntent("Dispatch this fix to Jackboy")).toBe("dispatch");
    expect(classifyIntent("assign Sabrina a campaign review")).toBe("dispatch");
  });
  it("routes agent discovery and status questions", () => {
    expect(classifyIntent("Which agents can review code?")).toBe("agents");
    expect(classifyIntent("What is the status of the gateway?")).toBe("status");
  });
  it("defaults to research", () => {
    expect(classifyIntent("What did CISA publish this week?")).toBe("research");
  });
});

describe("dispatchTarget", () => {
  it("finds named specialists case-insensitively", () => {
    expect(dispatchTarget("send this to JAX")).toBe("jax");
    expect(dispatchTarget("guardian review please")).toBe("guardian");
  });
  it("returns null when none is named", () => {
    expect(dispatchTarget("dispatch the task")).toBeNull();
  });
});

describe("buildDispatchRequest", () => {
  it("always starts pending owner approval, never auto-executes", () => {
    const req = buildDispatchRequest("d1", "dispatch a patch to jackboy");
    expect(req?.status).toBe("pending-approval");
    expect(req?.target).toBe("jackboy");
  });
  it("carries the blocked reason for unconnected specialists", () => {
    const req = buildDispatchRequest("d2", "dispatch audit to guardian");
    expect(req?.blockedReason).toMatch(/policy engine/i);
  });
  it("returns null without a named target", () => {
    expect(buildDispatchRequest("d3", "dispatch something")).toBeNull();
  });
});

describe("planHandoffs", () => {
  it("dispatch plans name rasul preparation plus the target with its honest status", () => {
    const plan = planHandoffs("dispatch", "dispatch to sabrina");
    expect(plan[0]?.agent).toBe("rasul");
    expect(plan[1]?.agent).toBe("sabrina");
    expect(plan[1]?.status).toBe("simulated");
  });
  it("agents intent lists every specialist capability", () => {
    expect(planHandoffs("agents", "")).toHaveLength(SPECIALIST_CAPABILITIES.length);
  });
});

describe("capabilities and fallbacks", () => {
  it("no specialist is marked verified without a connected backend path", () => {
    for (const c of SPECIALIST_CAPABILITIES) {
      expect(c.status).not.toBe("verified");
      expect(c.reason.length).toBeGreaterThan(10);
    }
  });
  it("fallbacks never claim completed work", () => {
    for (const intent of ["research", "status", "agents", "dispatch"] as const) {
      expect(rasulFallbackAnswer(intent, true)).not.toMatch(/completed|done|executed successfully/i);
    }
    expect(rasulFallbackAnswer("research", false)).toMatch(/sign in/i);
  });
});
