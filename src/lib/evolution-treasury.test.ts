import { describe, expect, it } from "vitest";
import {
  formatInternalUnits,
  treasuryAccountInput,
  treasuryPostInput,
  treasuryPrepareInput,
  treasurySnapshotSchema,
} from "./evolution-treasury";

const id = "018f0f34-d93d-7a40-a64f-0dc2b28cb8d2";
const otherId = "018f0f34-d93d-7a40-a64f-0dc2b28cb8d3";

describe("Evolution internal Treasury", () => {
  it("requires the daily limit to cover the per-transfer limit", () => {
    expect(() =>
      treasuryAccountInput.parse({
        name: "Operations",
        perTransferLimit: 500,
        dailyLimit: 499,
        requestId: id,
      }),
    ).toThrow("daily limit");
  });

  it("requires distinct source and recipient accounts for transfers", () => {
    expect(() =>
      treasuryPrepareInput.parse({
        kind: "transfer",
        sourceAccountId: id,
        destinationAccountId: id,
        amountUnits: 100,
        note: "",
        requestId: otherId,
      }),
    ).toThrow("source and recipient");
  });

  it("accepts income only with an internal destination", () => {
    const result = treasuryPrepareInput.parse({
      kind: "income",
      sourceAccountId: null,
      destinationAccountId: id,
      amountUnits: 100,
      note: "Internal allocation",
      requestId: otherId,
    });
    expect(result.amountUnits).toBe(100);
  });

  it("rejects possible credentials in notes", () => {
    expect(() =>
      treasuryPrepareInput.parse({
        kind: "expense",
        sourceAccountId: id,
        destinationAccountId: null,
        amountUnits: 100,
        note: "sk-abcdefghijklmnop",
        requestId: otherId,
      }),
    ).toThrow("credentials");
  });

  it("requires an exact positive amount confirmation", () => {
    expect(() => treasuryPostInput.parse({ journalId: id, amountConfirmation: 0 })).toThrow();
    expect(
      treasuryPostInput.parse({ journalId: id, amountConfirmation: 125 }).amountConfirmation,
    ).toBe(125);
  });

  it("never labels internal-unit formatting as currency", () => {
    expect(formatInternalUnits(1250)).toBe("1,250 units");
    expect(formatInternalUnits(1250)).not.toContain("$");
  });

  it("rejects a snapshot that claims real money", () => {
    const snapshot = {
      checkedAt: new Date().toISOString(),
      realMoney: true,
      unitName: "internal units",
      accounts: [],
      journals: [],
      audit: [],
    };
    expect(() => treasurySnapshotSchema.parse(snapshot)).toThrow();
  });
});
