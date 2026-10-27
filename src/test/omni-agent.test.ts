import { describe, expect, it } from "vitest";
import { assertAgentMembership, isAgentTerminal, omniAgentInput } from "@/lib/omni-agent";
const input = {
  requestId: "fa4b071c-8c52-4b78-98eb-6321af2823dd",
  projectId: "cc276f60-142b-4d5d-83cf-b83fb53d5562",
  message: "Omni connection test",
  consent: true,
};
describe("One private text agent", () => {
  it("requires explicit AI and persistence consent", () => {
    expect(omniAgentInput.safeParse({ ...input, consent: false }).success).toBe(false);
  });
  it("accepts a bounded connection test", () => {
    expect(omniAgentInput.parse(input).message).toBe("Omni connection test");
  });
  it("refuses shell or network tools even if supplied by the caller", () => {
    expect(omniAgentInput.safeParse({ ...input, tools: ["shell", "fetch"] }).success).toBe(false);
  });
  it("does not accept user identity overrides", () => {
    expect(omniAgentInput.safeParse({ ...input, ownerId: input.requestId }).success).toBe(false);
  });
  it("requires a stable request identity for deduplication", () => {
    expect(omniAgentInput.safeParse({ ...input, requestId: undefined }).success).toBe(false);
  });
  it("rejects oversized input", () => {
    expect(omniAgentInput.safeParse({ ...input, message: "x".repeat(2001) }).success).toBe(false);
  });
  it.each([null, undefined, "unavailable", "unassigned", "first visitor"])(
    "does not infer membership from %s",
    (role) => {
      expect(() => assertAgentMembership(role)).toThrow("membership");
    },
  );
  it.each(["owner", "admin", "tester"])("accepts explicitly assigned %s membership", (role) => {
    expect(() => assertAgentMembership(role)).not.toThrow();
  });
  it("never restarts cancelled or failed runs", () => {
    expect(isAgentTerminal("cancelled")).toBe(true);
    expect(isAgentTerminal("failed")).toBe(true);
    expect(isAgentTerminal("running")).toBe(false);
  });
});
