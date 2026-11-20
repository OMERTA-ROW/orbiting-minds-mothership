import { describe, expect, it } from "vitest";
import {
  classifyIntent,
  dispatchTarget,
  planHandoffs,
  rasulFallbackAnswer,
  SPECIALIST_CAPABILITIES,
  DEFAULT_OMNI_CONVERSATION,
} from "./rasul-chat";

describe("OMNI default conversation", () => {
  it("defaults to Razul without replacing the OMNI execution specialist", () => {
    expect(DEFAULT_OMNI_CONVERSATION).toBe("rasul");
    expect(SPECIALIST_CAPABILITIES.find((c) => c.agent === "omni")?.status).toBe("blocked");
  });
});

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

describe("planHandoffs", () => {
  it("agents intent lists every specialist capability", () => {
    expect(planHandoffs("agents")).toHaveLength(SPECIALIST_CAPABILITIES.length);
  });
  it("other intents prepare no local plan", () => {
    for (const intent of ["research", "status", "dispatch"] as const)
      expect(planHandoffs(intent)).toEqual([]);
  });
});

describe("no simulated specialists", () => {
  it("Sabrina and JAX are blocked, not simulated", () => {
    expect(SPECIALIST_CAPABILITIES.find((c) => c.agent === "sabrina")?.status).toBe("blocked");
    expect(SPECIALIST_CAPABILITIES.find((c) => c.agent === "jax")?.status).toBe("blocked");
  });
  it("a dispatch request names OMNI Terminal and claims nothing was sent", () => {
    expect(rasulFallbackAnswer("dispatch", true)).toMatch(/nothing was prepared or sent/);
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
      expect(rasulFallbackAnswer(intent, true)).not.toMatch(
        /completed|done|executed successfully/i,
      );
    }
    expect(rasulFallbackAnswer("research", false)).toMatch(/sign in/i);
  });
});
