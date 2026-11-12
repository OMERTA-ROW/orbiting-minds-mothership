import { describe, expect, it } from "vitest";
import {
  applyProposal,
  diffManifests,
  integrationHealth,
  lintManifest,
  RAZUL_AUTO_PROMOTE,
  retrieve,
  rollbackRecommended,
  type AgentManifest,
  type KnowledgeDoc,
  type Proposal,
} from "./razul-provisioning";

const base = (): AgentManifest => ({
  contract: "razul.manifest/v1",
  appId: "shop-app",
  agentId: "support",
  version: "1.0.0",
  identity: { name: "Support", purpose: "Answers questions about the shop app." },
  tools: ["knowledge.search"],
  model: { provider: "lovable_ai", model: "google/gemini-2.5-flash", temperature: 0.2, maxOutputTokens: 1024 },
  knowledgeNamespace: "app/shop-app/support",
  memory: { scope: "agent", ownerManaged: true, retentionDays: 30 },
  budgets: { taskCents: 50, dayCents: 200, totalCents: 500 },
  requiredSettings: ["SHOP_API_URL"],
});
const SHA = "a".repeat(64);
const NOW = 1_800_000_000_000;

describe("manifest lint", () => {
  it("accepts a well-formed manifest", () => {
    expect(lintManifest(base()).problems).toEqual([]);
  });
  it.each(["shell", "deploy", "secrets.write", "permissions.grant", "self.modify", "merge"])(
    "never allows the %s tool",
    (tool) => {
      expect(lintManifest({ ...base(), tools: [tool] }).problems.join()).toContain("can never be requested");
    },
  );
  it("keeps budgets within $1 task / $5 day / $10 total", () => {
    expect(lintManifest({ ...base(), budgets: { taskCents: 101, dayCents: 200, totalCents: 500 } }).problems.join()).toContain("$1");
    expect(lintManifest({ ...base(), budgets: { taskCents: 50, dayCents: 501, totalCents: 900 } }).problems.join()).toContain("$5");
    expect(lintManifest({ ...base(), budgets: { taskCents: 50, dayCents: 200, totalCents: 1001 } }).problems.join()).toContain("$10");
  });
  it("refuses a shared or other agent's knowledge namespace", () => {
    expect(lintManifest({ ...base(), knowledgeNamespace: "app/other/support" }).problems.length).toBe(1);
  });
  it("accepts setting names only, never values", () => {
    expect(lintManifest({ ...base(), requiredSettings: ["sk-live-abc123"] }).manifest).toBeNull();
  });
  it("refuses memory that is not owner-managed", () => {
    expect(lintManifest({ ...base(), memory: { scope: "agent", ownerManaged: false, retentionDays: 30 } }).manifest).toBeNull();
  });
});

describe("manifest diff", () => {
  it("flags new tools, higher budgets, model changes and new settings as escalations", () => {
    const next = {
      ...base(),
      version: "1.1.0",
      tools: ["knowledge.search", "code.propose"],
      budgets: { taskCents: 80, dayCents: 200, totalCents: 500 },
      model: { ...base().model, provider: "openai" as const, model: "gpt-5" },
      requiredSettings: ["SHOP_API_URL", "OPENAI_API_KEY"],
    };
    const d = diffManifests(base(), next);
    expect(d.escalations).toHaveLength(4);
  });
  it("treats removals and lower budgets as non-escalating changes", () => {
    const next = { ...base(), version: "1.1.0", tools: [], budgets: { taskCents: 10, dayCents: 200, totalCents: 500 } };
    expect(diffManifests(base(), next).escalations).toEqual([]);
  });
});

describe("proposal lifecycle", () => {
  const fresh = (): Proposal => ({ status: "proposed", manifestSha256: SHA, evaluations: [], stage: null, stageHealthy: null });
  const pass = { kind: "sandbox" as const, passed: true, manifestSha256: SHA, ranAt: NOW };
  const step = (p: Proposal, a: Parameters<typeof applyProposal>[1]) => {
    const r = applyProposal(p, a, NOW);
    if (typeof r === "string") throw new Error(r);
    return r;
  };

  it("never promotes automatically", () => {
    expect(RAZUL_AUTO_PROMOTE).toBe(false);
  });
  it("static checks alone never make a proposal approvable", () => {
    const p = step(fresh(), { type: "evaluate", evaluation: { ...pass, kind: "static" } });
    expect(p.status).toBe("proposed");
    expect(applyProposal(p, { type: "approve", by: "owner", mfaFresh: true }, NOW)).toBeTypeOf("string");
  });
  it("Razul cannot approve, widen or promote", () => {
    const p = step(fresh(), { type: "evaluate", evaluation: pass });
    expect(applyProposal(p, { type: "approve", by: "razul", mfaFresh: true }, NOW)).toContain("Only the owner");
  });
  it("approval needs a fresh second factor and a sandbox pass under 24 hours old", () => {
    const p = step(fresh(), { type: "evaluate", evaluation: { ...pass, ranAt: NOW - 25 * 3600_000 } });
    expect(applyProposal(p, { type: "approve", by: "owner", mfaFresh: false }, NOW)).toContain("two-step");
    expect(applyProposal(p, { type: "approve", by: "owner", mfaFresh: true }, NOW)).toContain("24 hours");
  });
  it("rolls out 10 → 50 → 100 one healthy stage at a time, then owner promotion", () => {
    let p = step(step(fresh(), { type: "evaluate", evaluation: pass }), { type: "approve", by: "owner", mfaFresh: true });
    expect(applyProposal(p, { type: "stage", to: 50, by: "owner" }, NOW)).toContain("10%");
    p = step(p, { type: "stage", to: 10, by: "owner" });
    expect(applyProposal(p, { type: "stage", to: 50, by: "owner" }, NOW)).toContain("health");
    p = step(p, { type: "stage_health", healthy: true });
    expect(applyProposal(p, { type: "stage", to: 100, by: "owner" }, NOW)).toContain("one stage");
    p = step(p, { type: "stage", to: 50, by: "owner" });
    p = step(p, { type: "stage_health", healthy: true });
    p = step(p, { type: "stage", to: 100, by: "owner" });
    expect(applyProposal(p, { type: "promote", by: "owner" }, NOW)).toContain("healthy 100%");
    p = step(p, { type: "stage_health", healthy: true });
    expect(applyProposal(p, { type: "promote", by: "razul" }, NOW)).toContain("Only the owner");
    expect(step(p, { type: "promote", by: "owner" }).status).toBe("promoted");
  });
  it("recommends and allows rollback when a stage fails its health check", () => {
    let p = step(step(fresh(), { type: "evaluate", evaluation: pass }), { type: "approve", by: "owner", mfaFresh: true });
    p = step(step(p, { type: "stage", to: 10, by: "owner" }), { type: "stage_health", healthy: false });
    expect(rollbackRecommended(p)).toBe(true);
    expect(step(p, { type: "rollback" }).status).toBe("rolled_back");
  });
});

describe("knowledge retrieval", () => {
  const doc = (id: string, namespace: string, body: string, sha = SHA): KnowledgeDoc => ({
    id,
    namespace,
    title: id,
    body,
    source: { kind: "official_url", ref: "https://example.org", retrievedAt: NOW, sha256: sha },
  });
  it("never returns another agent's documents", () => {
    const hits = retrieve("refund policy", [doc("a", "app/shop-app/support", "refund policy"), doc("b", "app/shop-app/billing", "refund policy")], "app/shop-app/support");
    expect(hits.map((h) => h.id)).toEqual(["a"]);
  });
  it("drops documents without provenance and always returns the source", () => {
    const hits = retrieve("refund", [doc("a", "app/x-y/z-w", "refund", "bad"), doc("b", "app/x-y/z-w", "refund")], "app/x-y/z-w");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.source.ref).toBe("https://example.org");
  });
});

describe("integration health", () => {
  it("reports missing setting names and an unverified provider", () => {
    const h = integrationHealth(base(), { settingsPresent: new Set(), sandboxSelfTestPassed: false, knowledgeDocs: 0, providerVerified: null });
    expect(h.filter((i) => !i.ok).map((i) => i.id)).toEqual(["settings", "provider", "knowledge", "sandbox"]);
    expect(h[0]!.detail).toContain("SHOP_API_URL");
  });
});
