import { describe, expect, it } from "vitest";
import {
  autonomyTaskInput,
  canTransition,
  decideStep,
  goalProtectedHints,
  readinessFor,
  transition,
} from "@/lib/omni-autonomy";

const task = {
  allowlist: [{ host: "example.com", actions: ["read", "navigate"] as ("read" | "navigate")[] }],
  grants: [] as never[],
  maxSteps: 2,
};

describe("autonomous task rules", () => {
  it("denies sites not on the allowlist", () => {
    expect(decideStep(task, { host: "evil.com", action: "read" }, 0).allowed).toBe(false);
  });
  it("allows only listed actions on listed sites", () => {
    expect(decideStep(task, { host: "Example.com", action: "read" }, 0).allowed).toBe(true);
    expect(decideStep(task, { host: "example.com", action: "type" }, 0).allowed).toBe(false);
  });
  it("never auto-allows spending, deletion, credentials, publishing or messages, even when granted", () => {
    for (const action of [
      "spend",
      "delete",
      "credential_change",
      "public_publish",
      "external_message",
    ] as const) {
      expect(decideStep(task, { host: "example.com", action }, 0).allowed).toBe(false);
      expect(
        decideStep({ ...task, grants: [action] }, { host: "example.com", action }, 0).allowed,
      ).toBe(false);
    }
  });
  it("stops at the step limit", () => {
    expect(decideStep(task, { host: "example.com", action: "read" }, 2).allowed).toBe(false);
  });
  it("blocks every account until an executor exists; non-members blocked earlier", () => {
    expect(readinessFor("owner", true).state).toBe(
      "Blocked: executor/host companion not connected",
    );
    expect(readinessFor("hacker", true).state).toBe("Blocked: private membership");
    expect(readinessFor(null, false).state).toBe("Blocked: sign in");
  });
  it("cannot reach completed from blocked, and stop/revoke are final", () => {
    expect(canTransition("blocked", "completed")).toBe(false);
    expect(canTransition("blocked", "running")).toBe(false);
    expect(() => transition("stopped", "running")).toThrow();
    expect(canTransition("revoked", "running")).toBe(false);
  });
  it("rejects URLs/paths as hosts and over-long step budgets", () => {
    const base = { requestId: crypto.randomUUID(), goal: "Read the pricing page", grants: [] };
    expect(() =>
      autonomyTaskInput.parse({
        ...base,
        allowlist: [{ host: "https://a.com/x", actions: ["read"] }],
      }),
    ).toThrow();
    expect(() =>
      autonomyTaskInput.parse({
        ...base,
        allowlist: [{ host: "a.com", actions: ["read"] }],
        maxSteps: 99,
      }),
    ).toThrow();
  });
  it("flags protected intent in goals without granting it", () => {
    expect(goalProtectedHints("Buy the plan and email the receipt")).toEqual([
      "spend",
      "external_message",
    ]);
  });
});
