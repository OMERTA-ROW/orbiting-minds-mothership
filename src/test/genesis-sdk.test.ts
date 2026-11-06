import { describe, expect, it } from "vitest";
import { sdkContracts } from "@/lib/genesis-sdk";
import { validateSdkJson } from "@/lib/genesis-sdk-validation";
describe("Future SDK contracts", () => {
  it.each(sdkContracts)("validates the $key demo example", (contract) => {
    expect(validateSdkJson(contract.key, JSON.stringify(contract.example)).valid).toBe(true);
  });
  it("rejects unrestricted agent scopes", () => {
    const contract = sdkContracts.find((item) => item.key === "agent-registration");
    expect(
      validateSdkJson(
        "agent-registration",
        JSON.stringify({ ...contract?.example, scopes: ["shell:execute"] }),
      ).valid,
    ).toBe(false);
  });
  it("does not allow a funded or signed release claim", () => {
    const contract = sdkContracts.find((item) => item.key === "package-release");
    expect(
      validateSdkJson(
        "package-release",
        JSON.stringify({ ...contract?.example, signature: "pretend-signature", price: 20 }),
      ).valid,
    ).toBe(false);
  });
  it("does not allow hardware evidence in a simulation contract", () => {
    const contract = sdkContracts.find((item) => item.key === "test-result");
    expect(
      validateSdkJson(
        "test-result",
        JSON.stringify({ ...contract?.example, hardwareEvidence: true }),
      ).valid,
    ).toBe(false);
  });
  it("rejects invalid JSON", () => {
    expect(validateSdkJson("agent-registration", "{").valid).toBe(false);
  });
});
