import { describe, expect, it } from "vitest";
import {
  LEGACY_TOTP_ISSUER,
  RECOVERY_FRESH_SIGNIN_SECONDS,
  TOTP_ISSUER,
  formatRecoveryCode,
  mfaErrorMessage,
  normalizeRecoveryCode,
  ownerMfaState,
  primarySignInAgeSeconds,
  recoveryBlocker,
  recoveryCodeHash,
  recoveryOutcomeMessage,
  totpFriendlyName,
  afterFailedCode,
  formatSetupKey,
  isQrImage,
  isStandardTotpUri,
  signInNeedsCode,
  stepUpBlocker,
  CLIENT_COOLDOWN_MS,
} from "./owner-mfa";

describe("owner two-factor state", () => {
  it("asks for setup when no authenticator has been confirmed", () => {
    expect(ownerMfaState({ signedIn: true, verifiedFactors: 0, aal: "aal1" })).toBe("needs_setup");
  });
  it("asks for a code when an authenticator exists but this sign-in is not verified", () => {
    expect(ownerMfaState({ signedIn: true, verifiedFactors: 1, aal: "aal1" })).toBe("needs_code");
  });
  it("is verified only at aal2 with a confirmed authenticator", () => {
    expect(ownerMfaState({ signedIn: true, verifiedFactors: 1, aal: "aal2" })).toBe("verified");
    expect(ownerMfaState({ signedIn: true, verifiedFactors: 0, aal: "aal2" })).toBe("needs_setup");
    expect(ownerMfaState({ signedIn: false, verifiedFactors: 1, aal: "aal2" })).toBe("signed_out");
  });
  it("names new authenticator entries OMNI Mothership and remembers the legacy name", () => {
    expect(TOTP_ISSUER).toBe("OMNI Mothership");
    expect(LEGACY_TOTP_ISSUER).toBe("orbiting-minds-mothership.lovable.app");
    expect(totpFriendlyName(new Date("2026-11-12T06:09:30Z"))).toBe(
      "OMNI Mothership 2026-11-12 06:09",
    );
  });
});

describe("plain-language code errors", () => {
  it("explains wrong codes, clock drift, expiry and rate limits", () => {
    expect(mfaErrorMessage({ code: "mfa_verification_failed" })).toContain("time automatically");
    expect(mfaErrorMessage({ code: "mfa_challenge_expired" })).toContain("expired");
    expect(mfaErrorMessage({ status: 429 })).toContain("Too many attempts");
    expect(mfaErrorMessage({ code: "insufficient_aal" })).toContain("current authenticator");
    expect(mfaErrorMessage(null)).toBeNull();
  });
  it("never echoes provider text, which could contain codes", () => {
    expect(mfaErrorMessage({ code: "weird", message: "secret 123456" })).not.toContain("123456");
  });
});

describe("fresh sign-in for recovery", () => {
  const now = 2_000_000_000;
  it("uses the newest first-step sign-in and ignores authenticator checks", () => {
    const amr = [
      { method: "oauth", timestamp: now - 900 },
      { method: "totp", timestamp: now - 5 },
      { method: "password", timestamp: now - 120 },
    ];
    expect(primarySignInAgeSeconds(amr, now)).toBe(120);
    expect(primarySignInAgeSeconds([{ method: "totp", timestamp: now }], now)).toBeNull();
    expect(primarySignInAgeSeconds([{ method: "oauth", timestamp: now + 600 }], now)).toBeNull();
    expect(primarySignInAgeSeconds("nope", now)).toBeNull();
  });
  it("lets any account recover with a verified email and a sign-in within 10 minutes", () => {
    const ok = { emailVerified: true, signInAgeSeconds: RECOVERY_FRESH_SIGNIN_SECONDS };
    expect(recoveryBlocker(ok)).toBeNull();
    expect(recoveryBlocker({ ...ok, signInAgeSeconds: 601 })).toContain("Sign in again");
    expect(recoveryBlocker({ ...ok, signInAgeSeconds: null })).toContain("Sign in again");
    expect(recoveryBlocker({ ...ok, emailVerified: false })).toContain("verified email");
  });
});

describe("recovery codes", () => {
  it("formats 12 characters as XXXX-XXXX-XXXX and normalizes typing", () => {
    const code = formatRecoveryCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 31]));
    expect(code).toBe("0123-4567-89AZ");
    expect(normalizeRecoveryCode(" 0123 4567-89az ")).toBe("0123456789AZ");
    expect(normalizeRecoveryCode("O123-4567-89AZ")).toBe("0123456789AZ");
    expect(normalizeRecoveryCode("0123-4567-89A")).toBeNull();
    expect(normalizeRecoveryCode("0123-4567-89AU")).toBeNull();
  });
  it("hashes bound to the user, so one account's code is useless for another", async () => {
    const a = await recoveryCodeHash("40543e40-5202-4219-a852-ead1c659e9a9", "0123456789AZ");
    const b = await recoveryCodeHash("11111111-1111-4111-8111-111111111111", "0123456789AZ");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("0123456789AZ");
  });
  it("explains each recovery outcome", () => {
    expect(recoveryOutcomeMessage("locked")).toContain("an hour");
    expect(recoveryOutcomeMessage("invalid")).toContain("already used");
    expect(recoveryOutcomeMessage("unverified")).toContain("verified email");
  });
});

describe("two-step sign-in is optional", () => {
  it("asks for a code after sign-in only when the account turned it on", () => {
    expect(signInNeedsCode({ currentLevel: "aal1", nextLevel: "aal2" })).toBe(true);
    // A session with an unknown level still has to enter the code.
    expect(signInNeedsCode({ currentLevel: null, nextLevel: "aal2" })).toBe(true);
    // No authenticator confirmed: existing logins are unchanged.
    expect(signInNeedsCode({ currentLevel: "aal1", nextLevel: "aal1" })).toBe(false);
    // Already confirmed this session.
    expect(signInNeedsCode({ currentLevel: "aal2", nextLevel: "aal2" })).toBe(false);
  });
});

describe("setup shows only a real provider code", () => {
  const uri =
    "otpauth://totp/OMNI%20Mothership:a%40b.c?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=OMNI%20Mothership";
  it("accepts a standard otpauth TOTP URI with a base32 secret", () => {
    expect(isStandardTotpUri(uri)).toBe(true);
  });
  it("rejects anything else, so no fake QR is shown", () => {
    expect(isStandardTotpUri("otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP")).toBe(false);
    expect(isStandardTotpUri("otpauth://totp/x")).toBe(false);
    expect(isStandardTotpUri("otpauth://totp/x?secret=short")).toBe(false);
    expect(isStandardTotpUri("https://example.com/?secret=JBSWY3DPEHPK3PXP")).toBe(false);
    expect(isStandardTotpUri(undefined)).toBe(false);
    expect(isQrImage("data:image/svg+xml;utf-8,<svg/>")).toBe(true);
    expect(isQrImage("https://example.com/qr.png")).toBe(false);
  });
  it("groups the manual setup key in fours", () => {
    expect(formatSetupKey("jbswy3dpehpk3pxp")).toBe("JBSW Y3DP EHPK 3PXP");
  });
});

describe("sensitive changes need a fresh code (15 minutes)", () => {
  const now = 2_000_000_000;
  it("refuses a session that has not entered a code", () => {
    expect(stepUpBlocker("aal1", [{ method: "oauth", timestamp: now }], now)).toContain(
      "authenticator",
    );
  });
  it("refuses a code older than 15 minutes", () => {
    expect(
      stepUpBlocker("aal2", [{ method: "totp", timestamp: now - 15 * 60 - 1 }], now),
    ).toContain("fresh");
  });
  it("allows a code from the last 15 minutes", () => {
    expect(stepUpBlocker("aal2", [{ method: "totp", timestamp: now - 15 * 60 }], now)).toBeNull();
  });
});

describe("wrong-code pause", () => {
  it("pauses for 30 seconds after the 5th wrong code, then starts counting again", () => {
    let s = { fails: 0, pausedUntil: 0 };
    for (let i = 0; i < 4; i++) s = afterFailedCode(s.fails, 1000);
    expect(s).toEqual({ fails: 4, pausedUntil: 0 });
    s = afterFailedCode(s.fails, 1000);
    expect(s).toEqual({ fails: 0, pausedUntil: 1000 + CLIENT_COOLDOWN_MS });
    expect(CLIENT_COOLDOWN_MS).toBe(30_000);
  });
});
