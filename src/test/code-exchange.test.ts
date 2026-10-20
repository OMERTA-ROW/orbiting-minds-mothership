import { describe, expect, it } from "vitest";
import { codeContributions } from "@/data/evolution";
import { addDemoFeedback, emptyDemoStore, emptyExchangeFilters, filterContributions, packagePreview, readDemoStore, referenceLinks } from "@/lib/code-exchange";
import { searchCommands } from "@/lib/command-search";

describe("Code Exchange boundaries", () => {
  it("filters language, industry, readiness, license and human/AI together", () => {
    expect(filterContributions({ query: "keyboard", language: "TypeScript", industry: "Accessibility", readiness: "Review ready", license: "MIT", authorType: "AI-assisted" }).map((item) => item.id)).toEqual(["keyboard-navigation"]);
    expect(filterContributions({ ...emptyExchangeFilters, language: "Python", industry: "Banking" })).toHaveLength(0);
    expect(filterContributions(emptyExchangeFilters)).toHaveLength(5);
  });
  it("searches Spanish descriptions and responsible human operators", () => {
    expect(filterContributions({ ...emptyExchangeFilters, query: "Luis Ortega" }).map((item) => item.id)).toEqual(["image-contrast"]);
    expect(filterContributions({ ...emptyExchangeFilters, query: "metadatos" }).map((item) => item.id)).toEqual(["dependency-ledger"]);
  });
  it("keeps every AI-assisted contribution attributed to a human operator", () => {
    const assisted = codeContributions.filter((item) => item.authorType === "AI-assisted");
    expect(assisted).toHaveLength(2);
    for (const item of assisted) expect(item.operator).toBe(item.author);
  });
  it("never converts demo approval into signing, distribution or commerce", () => {
    const approved = codeContributions.find((item) => item.state === "Approved");
    if (!approved) throw new Error("Approved demo sample missing");
    const manifest = packagePreview(approved);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.artifact.checksum).toBe("DEMO_NOT_COMPUTED");
    expect(manifest.artifact.checksumIsPlaceholder).toBe(true);
    expect(manifest.approval).toEqual({ required: "human_project_owner", state: "pending_real_approval", demoBoardState: "Approved" });
    expect(manifest.signature).toBeNull();
    expect(manifest.distribution).toBe("disabled");
    expect(manifest.repositoryAccess).toBe("none");
    expect(manifest.pullRequests).toBe("disabled");
    expect(manifest.commerce).toEqual({ currency: "USD", price: "TBD", payments: "disabled", payouts: "disabled" });
    expect(manifest.tests.every((test) => test.status === "planned_not_run")).toBe(true);
  });
  it("has public commit references distinct from sample provenance", () => {
    for (const item of codeContributions) {
      expect(item.reference.commit).toMatch(/^[a-f0-9]{40}$/);
      expect(referenceLinks(item).commit).toBe(`https://github.com/${item.reference.repository}/commit/${item.reference.commit}`);
    }
  });
  it("records only actual local feedback and cannot release a contribution", () => {
    expect(emptyDemoStore.activity).toHaveLength(0);
    const result = addDemoFeedback(emptyDemoStore, { contributionId: "sandbox-transfer", name: "Test reviewer", body: "Please verify atomic replay protection.", kind: "Recommend approval" }, "feedback-1", "2026-10-20T23:15:00.000Z");
    expect(result.feedback).toHaveLength(1);
    expect(result.activity[0]?.action).toBe("Recommend approval");
    expect(result.activity[0]?.actor).toBe("Test reviewer");
    expect(codeContributions[0]?.state).toBe("In Review");
    expect(readDemoStore(JSON.stringify(result))).toEqual(result);
  });
  it("rejects invalid identities, missing feedback and corrupt storage", () => {
    expect(() => addDemoFeedback(emptyDemoStore, { contributionId: "missing", name: "Test", body: "A useful feedback message", kind: "Comment" }, "1", "2026-10-20T23:15:00.000Z")).toThrow();
    expect(() => addDemoFeedback(emptyDemoStore, { contributionId: "sandbox-transfer", name: "", body: "", kind: "Comment" }, "1", "2026-10-20T23:15:00.000Z")).toThrow();
    expect(readDemoStore('{"version":2}')).toEqual(emptyDemoStore);
    expect(readDemoStore("malformed")).toEqual(emptyDemoStore);
  });
  it("finds exact contributions in global search", () => {
    expect(searchCommands("Replay-safe transfer validation")[0]?.key).toBe("code:sandbox-transfer");
  });
});