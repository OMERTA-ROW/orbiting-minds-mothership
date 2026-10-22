import { afterEach, describe, expect, it, vi } from "vitest";
import { readRecoveryHint, rememberRecoveryHint, RECOVERY_HINT_KEY } from "@/lib/account-recovery";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});
describe("recovery presentation is bound to a validated account", () => {
  it("rejects legacy true flags and hints from another account", () => {
    sessionStorage.setItem(RECOVERY_HINT_KEY, "true");
    expect(readRecoveryHint(sessionStorage, "owner-a")).toBeNull();
    rememberRecoveryHint(sessionStorage, "owner-a");
    expect(readRecoveryHint(sessionStorage, "owner-b")).toBeNull();
    expect(readRecoveryHint(sessionStorage, null)).toBeNull();
    expect(readRecoveryHint(sessionStorage, "owner-a")).toBe("owner-a");
  });
  it("removes the presentation hint on completion or sign-out", () => {
    rememberRecoveryHint(sessionStorage, "owner-a");
    rememberRecoveryHint(sessionStorage, null);
    expect(readRecoveryHint(sessionStorage, "owner-a")).toBeNull();
  });
  it("fails closed for a blocked storage read without throwing on hint writes", () => {
    const blocked = {
      getItem: vi.fn(() => {
        throw new Error("unavailable");
      }),
      setItem: vi.fn(() => {
        throw new Error("unavailable");
      }),
      removeItem: vi.fn(() => {
        throw new Error("unavailable");
      }),
    };
    expect(readRecoveryHint(blocked, "owner-a")).toBeNull();
    expect(() => rememberRecoveryHint(blocked, "owner-a")).not.toThrow();
    expect(() => rememberRecoveryHint(blocked, null)).not.toThrow();
  });
});
