import { describe, expect, it } from "vitest";
import { cloudAccountEvidence, confirmedWrite } from "./persistence-evidence";

describe("real persistence evidence", () => {
  it("rejects zero affected rows even with no transport error", () => {
    expect(() => confirmedWrite("Project", { data: null, error: null })).toThrow(/not confirmed/);
  });
  it("rejects failed writes and permits only returned persisted rows", () => {
    expect(() => confirmedWrite("Check", { data: { id: "x" }, error: {} })).toThrow();
    expect(() => confirmedWrite("Project", { data: { id: "x" }, error: null })).not.toThrow();
    expect(() =>
      confirmedWrite("Settings", { data: { owner_id: "owner" }, error: null }),
    ).not.toThrow();
  });
});

describe("cloud account proof", () => {
  it("requires Railway's actual account identity, not a successful empty response", () => {
    expect(cloudAccountEvidence("railway", null)).toBe(false);
    expect(cloudAccountEvidence("railway", {})).toBe(false);
    expect(cloudAccountEvidence("railway", { data: { me: null } })).toBe(false);
    expect(cloudAccountEvidence("railway", { data: { me: { id: "" } } })).toBe(false);
    expect(cloudAccountEvidence("railway", { data: { me: { id: "account" } } })).toBe(true);
  });
  it("refuses provider errors even with account-looking data", () => {
    expect(cloudAccountEvidence("railway", { data: { me: { id: "account" } }, errors: [{}] })).toBe(
      false,
    );
  });
  it("requires the Vultr account schema and rejects malformed account evidence", () => {
    expect(cloudAccountEvidence("vultr", { account: {} })).toBe(false);
    expect(cloudAccountEvidence("vultr", { account: { balance: "0" } })).toBe(false);
    expect(cloudAccountEvidence("vultr", { account: { balance: 0 } })).toBe(true);
  });
});
