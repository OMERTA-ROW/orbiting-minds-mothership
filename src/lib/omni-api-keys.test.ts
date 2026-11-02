import { describe, expect, it } from "vitest";
import {
  generateOmniKey,
  OMNI_KEY_PATTERN,
  omniKeyCreateInput,
  omniKeyIdInput,
  omniKeyPrefix,
  omniKeyStatus,
  parseOmniBearer,
  sha256Hex,
} from "./omni-api-keys";

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
  it("accepts a bounded owner request", () => {
    const parsed = omniKeyCreateInput.parse({
      name: "Laptop health check",
      scopes: ["health", "jobs"],
      days: 30,
      confirm: true,
    });
    expect(parsed.scopes).toEqual(["health", "jobs"]);
  });
  it("rejects unknown scopes, missing confirm, and out-of-range expiry", () => {
    const base = { name: "x", scopes: ["health"], days: 30, confirm: true } as const;
    expect(omniKeyCreateInput.safeParse({ ...base, scopes: ["admin"] }).success).toBe(false);
    expect(omniKeyCreateInput.safeParse({ ...base, scopes: [] }).success).toBe(false);
    expect(omniKeyCreateInput.safeParse({ ...base, confirm: false }).success).toBe(false);
    expect(omniKeyCreateInput.safeParse({ ...base, days: 0 }).success).toBe(false);
    expect(omniKeyCreateInput.safeParse({ ...base, days: 366 }).success).toBe(false);
    expect(omniKeyCreateInput.safeParse({ ...base, name: "" }).success).toBe(false);
    expect(omniKeyCreateInput.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe("omniKeyIdInput", () => {
  it("requires a uuid and explicit confirmation", () => {
    expect(
      omniKeyIdInput.safeParse({ id: "11111111-1111-4111-8111-111111111111", confirm: true })
        .success,
    ).toBe(true);
    expect(
      omniKeyIdInput.safeParse({ id: "not-a-uuid", confirm: true }).success,
    ).toBe(false);
    expect(
      omniKeyIdInput.safeParse({ id: "11111111-1111-4111-8111-111111111111" }).success,
    ).toBe(false);
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
});
