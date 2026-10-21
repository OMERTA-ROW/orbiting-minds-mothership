import { describe, expect, it } from "vitest";
import { compatibilityPolicy as policy } from "@/data/evolution";

describe("founder compatibility-first roadmap policy", () => {
  it("does not require a recurring subscription for basic access", () => { expect(policy.basic.recurringSubscriptionRequired).toBe(false); });
  it("does not require a replacement terminal or IDE", () => { expect(policy.basic.replacementTerminalRequired).toBe(false); expect(policy.basic.replacementIdeRequired).toBe(false); });
  it("requires no download for browser preview", () => { expect(policy.basic.downloadRequiredForWebPreview).toBe(false); });
  it("keeps offline source access independent of accounts", () => { expect(policy.basic.accountRequiredForOfflineSource).toBe(false); });
  it("requires opt-in official API adapters", () => { expect(policy.providers.optInRequired).toBe(true); expect(policy.providers.officialApiRequired).toBe(true); });
  it("never treats consumer subscriptions as free API entitlement", () => { expect(policy.providers.existingConsumerSubscriptionIncludesApi).toBe(false); expect(policy.providers.guaranteedFreeAi).toBe(false); expect(policy.providers.externalFeesMayApply).toBe(true); });
  it("keeps actual costs unknown without usage evidence", () => { expect(policy.providers.actualUsageCostUsd).toBeNull(); expect(policy.providers.liveUsageMeterAvailable).toBe(false); });
  it("requires secure key custody and refuses keys in chat", () => { expect(policy.providers.secureKeyCustodyRequired).toBe(true); expect(policy.providers.privateKeysInChatAllowed).toBe(false); });
  it("keeps hosted services optional, unpriced and unbilled", () => { expect(policy.hosted).toEqual({ optional:true, available:false, priceUsd:null, billingEnabled:false }); });
  it("preserves open JSON export without automatic tool edits", () => { expect(policy.portability.exportFormat).toBe("JSON"); expect(policy.portability.automaticToolchainEdits).toBe(false); expect(policy.portability.nativeUninstallRequiresConsent).toBe(true); });
  it("does not claim project diagnostics or an approved source license", () => { expect(policy.portability.projectDiagnosticsAvailable).toBe(false); expect(policy.portability.sourceLicenseApproved).toBe(false); });
  it("does not fabricate savings, carbon neutrality or live agents", () => { expect(policy.evidence).toEqual({ verifiedUserSavings:false, carbonNeutralClaim:false, liveAgentCountAvailable:false }); });
  it("exports only roadmap policy without account secrets", () => { const output=JSON.parse(JSON.stringify(policy)); expect(output.mode).toBe("ROADMAP_POLICY"); expect(output.schemaVersion).toBe(1); expect(output.portability.policyExportContainsCredentials).toBe(false); expect(Object.keys(output)).toEqual(["schemaVersion","mode","basic","providers","hosted","portability","evidence"]); });
});