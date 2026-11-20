import { describe, expect, it } from "vitest";
import {
  generateOmniKey,
  OMNI_KEY_PATTERN,
  omniKeyCreateInput,
  omniKeyIdInput,
  omniKeyPrefix,
  omniKeyStatus,
  omniExpiryFromChoice,
  omniExpiryRpcArgs,
  omniKeyExpiryLabel,
  parseOmniBearer,
  sha256Hex,
  type OmniApiKeyRow,
} from "./omni-api-keys";
import { connectionRows, keyCounts } from "./owner-dashboard";

describe("parseOmniBearer", () => {
  const valid = `omni_${"a".repeat(48)}`;
  it("accepts a well-formed bearer key", () => {
    expect(parseOmniBearer(`Bearer ${valid}`)).toBe(valid);
  });
  it("rejects missing, malformed, or non-bearer headers", () => {
    expect(parseOmniBearer(null)).toBeNull();
    expect(parseOmniBearer("")).toBeNull();
    expect(parseOmniBearer(valid)).toBeNull();
    expect(parseOmniBearer(`Basic ${valid}`)).toBeNull();
    expect(parseOmniBearer("Bearer omni_short")).toBeNull();
    expect(parseOmniBearer(`Bearer ${valid.toUpperCase()}`)).toBeNull();
    expect(parseOmniBearer(`Bearer omni_${"a".repeat(47)}`)).toBeNull();
    expect(parseOmniBearer(`Bearer omni_${"a".repeat(49)}`)).toBeNull();
  });
});

describe("generateOmniKey", () => {
  it("produces keys matching the stored format", () => {
    for (let i = 0; i < 20; i++) expect(generateOmniKey()).toMatch(OMNI_KEY_PATTERN);
  });
  it("uses the injected randomness source and stays unique", () => {
    let n = 0;
    const key = generateOmniKey((buf) => buf.fill(n++));
    expect(key).toBe(`omni_${"00".repeat(24)}`);
    const seen = new Set(Array.from({ length: 50 }, () => generateOmniKey()));
    expect(seen.size).toBe(50);
  });
});

describe("omniKeyPrefix", () => {
  it("keeps only a short display prefix, never the secret", () => {
    const key = generateOmniKey();
    const prefix = omniKeyPrefix(key);
    expect(prefix).toBe(key.slice(0, 12));
    expect(prefix.length).toBe(12);
    expect(key.includes(prefix)).toBe(true);
    expect(prefix).not.toBe(key);
  });
});

describe("sha256Hex", () => {
  it("matches the known SHA-256 vector", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("hashes a full key to 64 hex chars", async () => {
    expect(await sha256Hex(generateOmniKey())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("omniKeyCreateInput", () => {
  const base = {
    name: "Laptop health check",
    scopes: ["health", "jobs"],
    expiry: { kind: "days", days: 30 },
    confirm: true,
  } as const;
  it("accepts a finite expiry of 1–365 days", () => {
    expect(omniKeyCreateInput.parse(base).expiry).toEqual({ kind: "days", days: 30 });
    expect(
      omniKeyCreateInput.safeParse({ ...base, expiry: { kind: "days", days: 1 } }).success,
    ).toBe(true);
    expect(
      omniKeyCreateInput.safeParse({ ...base, expiry: { kind: "days", days: 365 } }).success,
    ).toBe(true);
  });
  it("accepts Never expires as its own explicit choice", () => {
    expect(omniKeyCreateInput.parse({ ...base, expiry: { kind: "never" } }).expiry).toEqual({
      kind: "never",
    });
  });
  it("rejects mixed, missing and out-of-range expiry", () => {
    const bad = (expiry: unknown) => omniKeyCreateInput.safeParse({ ...base, expiry }).success;
    expect(bad({ kind: "never", days: 30 })).toBe(false);
    expect(bad({ kind: "days" })).toBe(false);
    expect(bad({ kind: "days", days: 0 })).toBe(false);
    expect(bad({ kind: "days", days: 366 })).toBe(false);
    expect(bad({ kind: "days", days: 1.5 })).toBe(false);
    expect(bad(undefined)).toBe(false);
    expect(omniKeyCreateInput.safeParse({ ...base, expiry: undefined, days: 30 }).success).toBe(
      false,
    );
  });
  it("rejects unknown or duplicate scopes, missing confirm, empty name and extra fields", () => {
    expect(omniKeyCreateInput.safeParse({ ...base, scopes: ["admin"] }).success).toBe(false);
    expect(omniKeyCreateInput.safeParse({ ...base, scopes: [] }).success).toBe(false);
    expect(omniKeyCreateInput.safeParse({ ...base, scopes: ["health", "health"] }).success).toBe(
      false,
    );
    expect(omniKeyCreateInput.safeParse({ ...base, confirm: false }).success).toBe(false);
    expect(omniKeyCreateInput.safeParse({ ...base, name: "" }).success).toBe(false);
    expect(omniKeyCreateInput.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe("expiry choice to database arguments", () => {
  it("maps presets, custom days and Never expires", () => {
    expect(omniExpiryFromChoice("30", 0)).toEqual({ kind: "days", days: 30 });
    expect(omniExpiryFromChoice("365", 0)).toEqual({ kind: "days", days: 365 });
    expect(omniExpiryFromChoice("custom", 45)).toEqual({ kind: "days", days: 45 });
    expect(omniExpiryFromChoice("custom", 0)).toBeNull();
    expect(omniExpiryFromChoice("custom", 400)).toBeNull();
    expect(omniExpiryFromChoice("never", 0)).toEqual({ kind: "never" });
  });
  it("sends exactly one of a day count or never", () => {
    expect(omniExpiryRpcArgs({ kind: "days", days: 90 })).toEqual({
      _expiry_days: 90,
      _never_expires: false,
    });
    expect(omniExpiryRpcArgs({ kind: "never" })).toEqual({
      _expiry_days: null,
      _never_expires: true,
    });
  });
});

describe("omniKeyIdInput", () => {
  it("requires a uuid and explicit confirmation", () => {
    expect(
      omniKeyIdInput.safeParse({ id: "11111111-1111-4111-8111-111111111111", confirm: true })
        .success,
    ).toBe(true);
    expect(omniKeyIdInput.safeParse({ id: "not-a-uuid", confirm: true }).success).toBe(false);
    expect(omniKeyIdInput.safeParse({ id: "11111111-1111-4111-8111-111111111111" }).success).toBe(
      false,
    );
  });
});

describe("omniKeyStatus", () => {
  const now = Date.parse("2026-11-02T00:00:00Z");
  it("derives display status from revocation and expiry", () => {
    expect(omniKeyStatus({ status: "active", expires_at: "2026-11-03T00:00:00Z" }, now)).toBe(
      "active",
    );
    expect(omniKeyStatus({ status: "active", expires_at: "2026-11-01T00:00:00Z" }, now)).toBe(
      "expired",
    );
    expect(omniKeyStatus({ status: "revoked", expires_at: "2026-12-01T00:00:00Z" }, now)).toBe(
      "revoked",
    );
  });
  it("keeps older finite records (no never_expires field) on their real expiry", () => {
    expect(omniKeyStatus({ status: "active", expires_at: "2026-11-03T00:00:00Z" }, now)).toBe(
      "active",
    );
    expect(
      omniKeyExpiryLabel(
        { status: "active", expires_at: "2026-11-03T00:00:00Z" },
        now,
        (iso) => iso,
      ),
    ).toBe("Expires 2026-11-03T00:00:00Z");
    expect(
      omniKeyExpiryLabel(
        { status: "active", expires_at: "2026-11-01T00:00:00Z" },
        now,
        (iso) => iso,
      ),
    ).toBe("Expired 2026-11-01T00:00:00Z");
  });
  it("treats a never-expiring key as active until revoked", () => {
    const forever = { status: "active", expires_at: null, never_expires: true };
    expect(omniKeyStatus(forever, Date.parse("2126-01-01T00:00:00Z"))).toBe("active");
    expect(omniKeyExpiryLabel(forever, now)).toBe("Never expires");
    expect(omniKeyStatus({ ...forever, status: "revoked" }, now)).toBe("revoked");
  });
  it("fails closed on inconsistent or unreadable expiry", () => {
    expect(omniKeyStatus({ status: "active", expires_at: null }, now)).toBe("expired");
    expect(omniKeyStatus({ status: "active", expires_at: null, never_expires: false }, now)).toBe(
      "expired",
    );
    expect(
      omniKeyStatus(
        { status: "active", expires_at: "2099-01-01T00:00:00Z", never_expires: true },
        now,
      ),
    ).toBe("expired");
    expect(omniKeyStatus({ status: "active", expires_at: "not-a-date" }, now)).toBe("expired");
    expect(omniKeyStatus({ status: "paused", expires_at: "2099-01-01T00:00:00Z" }, now)).toBe(
      "expired",
    );
  });
});

describe("keyCounts", () => {
  it("counts active, never-expiring, expired and revoked keys", () => {
    const now = Date.parse("2026-11-02T00:00:00Z");
    const row = (over: object) =>
      ({
        id: "x",
        name: "k",
        key_prefix: "omni_aaaa",
        scopes: ["health"],
        last_used_at: null,
        created_at: "2026-11-01T00:00:00Z",
        rotated_at: null,
        status: "active",
        expires_at: "2026-12-01T00:00:00Z",
        ...over,
      }) as OmniApiKeyRow;
    expect(
      keyCounts(
        [
          row({}),
          row({ expires_at: null, never_expires: true }),
          row({ expires_at: "2026-11-01T00:00:00Z" }),
          row({ status: "revoked", expires_at: null, never_expires: true }),
        ],
        now,
      ),
    ).toEqual({ active: 2, neverExpires: 1, expired: 1, revoked: 1 });
  });
});

describe("connectionRows", () => {
  it("shows unknown, never connected, when no signed reading exists", () => {
    const view = connectionRows(null);
    expect(view.rows.every((r) => r.value === "Unknown")).toBe(true);
    expect(view.checkedAt).toBeNull();
  });
  it("reports the signed reading as-is", () => {
    const view = connectionRows({
      label: "Blocked",
      release: {
        expected: "r",
        jackboyRelease: null,
        jackboyMatches: false,
        mothershipPinned: false,
      },
      state: {
        allowed: false,
        checkedAt: "2026-11-20T01:00:00Z",
        projectId: "11111111-1111-4111-8111-111111111111",
        connected: true,
        configured: false,
        armed: false,
        emergencyStop: true,
        killSwitch: false,
        executionReady: false,
        expiresAt: null,
        operationId: null,
        executorRelease: null,
        executorOrigin: null,
        running: false,
        cancellationPending: false,
      },
    });
    expect(Object.fromEntries(view.rows.map((r) => [r.label, r.value]))).toEqual({
      "Jackboy live link": "Connected",
      "Autonomy authorization": "Not configured",
      "CODE Emergency Stop": "Engaged",
      "System Kill Switch": "Off",
      "Work running": "Nothing running",
    });
  });
});
