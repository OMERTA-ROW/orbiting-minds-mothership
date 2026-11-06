import { describe, expect, it } from "vitest";
import { assertJackboyLinkScope, jackboyLinkRequestSchema } from "./jackboy-link-scope";

const projectId = "11111111-1111-4111-8111-111111111111";
const approvalId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const configuration = { owner: "owner", project: projectId, approval: approvalId };

describe("Jackboy link scope", () => {
  it("only accepts fixed operations and exact request shapes", () => {
    const base = { projectId, approvalId };
    expect(jackboyLinkRequestSchema.safeParse({ ...base, action: "handshake" }).success).toBe(true);
    expect(
      jackboyLinkRequestSchema.safeParse({ ...base, action: "run", jobId, confirm: true }).success,
    ).toBe(true);
    for (const input of [
      { ...base, action: "shell", jobId },
      { ...base, action: "run", jobId, command: "echo" },
      { ...base, action: "run" },
      { ...base, action: "run", jobId },
      { ...base, action: "handshake", jobId },
    ])
      expect(jackboyLinkRequestSchema.safeParse(input).success).toBe(false);
  });
  it("rejects missing and mismatched owner, project and approval", () => {
    const request = jackboyLinkRequestSchema.parse({
      action: "status",
      projectId,
      approvalId,
      jobId,
    });
    expect(() => assertJackboyLinkScope(request, "owner", configuration)).not.toThrow();
    expect(() => assertJackboyLinkScope(request, "other", configuration)).toThrow();
    expect(() => assertJackboyLinkScope(request, "owner", {})).toThrow();
    expect(() =>
      assertJackboyLinkScope(request, "owner", { ...configuration, project: jobId }),
    ).toThrow();
    expect(() =>
      assertJackboyLinkScope(request, "owner", { ...configuration, approval: jobId }),
    ).toThrow();
  });
  it("requires a separate explicit opt-in to submit or run the fixed test", () => {
    const request = jackboyLinkRequestSchema.parse({
      action: "run",
      projectId,
      approvalId,
      jobId,
      confirm: true,
    });
    expect(() => assertJackboyLinkScope(request, "owner", configuration)).toThrow();
    expect(() =>
      assertJackboyLinkScope(request, "owner", { ...configuration, selfTestEnabled: "true" }),
    ).not.toThrow();
  });
});
