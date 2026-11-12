import { describe, expect, it } from "vitest";
import {
  SIGN_IN_FALLBACK,
  authErrorMessage,
  knownAuthMessage,
  rememberPendingInvite,
  takePendingInvite,
} from "@/lib/sign-in-help";

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("sign-in error messages", () => {
  it("wrong password points Google users to the Google button", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toContain("Continue with Google");
  });
  it("unconfirmed email tells the user to open the confirmation link", () => {
    expect(authErrorMessage({ message: "Email not confirmed" })).toContain("confirm");
  });
  it("a disabled provider is explained instead of shown raw", () => {
    expect(authErrorMessage({ message: "Unsupported provider: provider is not enabled" })).toBe(
      "This sign-in option is turned off. Use another option on this page.",
    );
  });
  it("rate limits ask the user to wait", () => {
    expect(authErrorMessage({ status: 429 })).toBe("Too many attempts. Wait a minute, then try again.");
  });
  it("unknown provider text is never echoed", () => {
    expect(authErrorMessage({ message: "internal stack trace xyz" })).toBe(SIGN_IN_FALLBACK);
    expect(knownAuthMessage({ message: "internal stack trace xyz" })).toBeNull();
  });
});

describe("pending invitation handoff", () => {
  const token = "a".repeat(64);
  it("returns a well-formed token once", () => {
    const s = memory();
    expect(rememberPendingInvite(s, token)).toBe(true);
    expect(takePendingInvite(s)).toBe(token);
    expect(takePendingInvite(s)).toBeNull();
  });
  it("refuses malformed tokens", () => {
    const s = memory();
    expect(rememberPendingInvite(s, "../beta")).toBe(false);
    expect(rememberPendingInvite(s, "A".repeat(64))).toBe(false);
    s.setItem("evo.pending-invite", "javascript:alert(1)");
    expect(takePendingInvite(s)).toBeNull();
  });
});
