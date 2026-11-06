import { describe, it, expect } from "vitest";
import { omniConnectors } from "@/data/evolution";
import {
  applyOmniCommand,
  connectivityEvidence,
  discoverOmniConnectors,
  initialOmniStore,
  omniExport,
  omniManifest,
  omniStoreSchema,
  proposeOmniPlan,
  reviewOmniPlan,
} from "@/lib/omnibridge";
const at = "2026-10-21T02:00:00.000Z";
const input = {
  projectId: "nexus-nebula",
  goal: "Review code with an independent proposed GitHub change",
  targets: ["openai", "anthropic"] as ("openai" | "anthropic")[],
  consent: true,
};
const create = () => proposeOmniPlan(input, "plan-1", at, false);
describe("OmniBridge scope and evidence", () => {
  it("never invents connected providers or verified connectivity", () => {
    expect(omniConnectors.filter((c) => String(c.state) === "CONNECTED")).toHaveLength(0);
    expect(connectivityEvidence()).toEqual({
      verifiedAt: null,
      probePerformed: false,
      source: "UNMEASURED",
    });
  });
  it("has meaningful connected empty state rather than fabricated discovery", () => {
    expect(discoverOmniConnectors("", "CONNECTED")).toEqual([]);
    expect(discoverOmniConnectors("testnet", "NOT CONNECTED").map((c) => c.id)).toEqual(["solana"]);
  });
  it("unidentified adapters stay unsupported and scope-less", () => {
    const m = omniManifest("atlas");
    expect(m.requestedScopes).toEqual([]);
    expect(m.executionAllowed).toBe(false);
  });
  it("keeps Solana future optional read-only testnet with no wallet/signing/mainnet/transactions", () => {
    expect(omniManifest("solana")).toMatchObject({
      network: "testnet",
      readOnly: true,
      wallets: false,
      signing: false,
      transactions: false,
      mainnet: false,
      executionAllowed: false,
    });
    expect(omniManifest("solana").requestedScopes).toEqual(["testnet:status:read"]);
  });
  it("does not fabricate extension digests, signatures, sandbox or tests", () => {
    expect(omniManifest("github")).toMatchObject({
      signature: null,
      trustedKey: null,
      artifactDigest: null,
      tests: "NOT_RUN",
      sandbox: "NOT_PROVISIONED",
      executionAllowed: false,
    });
  });
  it("requires a signed companion design for Unity and Blender only without execution", () => {
    expect(omniManifest("unity").companionRequired).toBe(true);
    expect(omniManifest("blender").companionRequired).toBe(true);
    expect(omniManifest("openai").companionRequired).toBe(false);
  });
});
describe("Non-executing explainable intent plan", () => {
  it("requires explicit local storage consent", () => {
    expect(() => proposeOmniPlan({ ...input, consent: false }, "p", at, false)).toThrow(/consent/);
  });
  it("requires explicit target selection rather than broadcasting", () => {
    expect(() => proposeOmniPlan({ ...input, targets: [] }, "p", at, false)).toThrow();
  });
  it("rejects unsupported target adapters", () => {
    expect(() =>
      proposeOmniPlan({ ...input, targets: ["atlas"] as never }, "p", at, false),
    ).toThrow();
  });
  it("blocks proposal while Guardian or Nexus is paused", () => {
    expect(() => proposeOmniPlan(input, "p", at, true)).toThrow(/paused/);
  });
  it("rejects CyberLink Social world and never enrolls its context", () => {
    expect(() =>
      proposeOmniPlan({ ...input, projectId: "nexus-cyberlink-social" }, "p", at, false),
    ).toThrow(/excluded/);
  });
  it("rejects separate-project goal text", () => {
    expect(() =>
      proposeOmniPlan(
        { ...input, goal: "Access CyberLink Social terminal and change it" },
        "p",
        at,
        false,
      ),
    ).toThrow(/Excluded/);
  });
  it("preserves exact Cyberace spelling and inert sample boundary", () => {
    const p = proposeOmniPlan({ ...input, projectId: "nexus-cyberace" }, "p", at, false);
    expect(p.steps[0]?.affected).toEqual(["SAMPLE:/Cyberace/adapter-plan.ts"]);
    expect(p.executionAllowed).toBe(false);
    expect(p.providerCalls).toBe(0);
  });
  it("routes only explicit targets in separate drafts", () => {
    const p = proposeOmniPlan({ ...input, targets: ["openai"] }, "p", at, false);
    expect(
      p.steps.filter((s) => ["openai", "anthropic"].includes(s.connector)).map((s) => s.connector),
    ).toEqual(["openai"]);
    expect(p.steps.find((s) => s.connector === "openai")?.affected).toContain(
      "ISOLATED:openai:draft",
    );
  });
  it("does not infer Anthropic from natural-language instructions", () => {
    const p = proposeOmniPlan(
      {
        ...input,
        goal: "Use Anthropic and broadcast to every provider",
        targets: ["local"] as never,
      },
      "p",
      at,
      false,
    );
    expect(p.steps.some((s) => s.connector === "anthropic")).toBe(false);
  });
  it("makes deterministic dependencies and explicit human checkpoints for writes", () => {
    const p = create();
    expect(p.steps.map((s) => s.dependsOn)).toEqual([
      [],
      ["step-1"],
      ["step-2"],
      ["step-3"],
      ["step-4"],
    ]);
    expect(p.steps.find((s) => s.connector === "github")?.highImpact).toBe(true);
    expect(p.steps.at(-1)?.highImpact).toBe(true);
  });
  it("keeps Unity and Blender plans inert with explicit outputs", () => {
    const p = proposeOmniPlan(
      {
        ...input,
        goal: "Prepare a Unity and Blender scene render plan",
        targets: ["local"] as never,
      },
      "p",
      at,
      false,
    );
    expect(
      p.steps.filter((s) => ["unity", "blender"].includes(s.connector)).map((s) => s.connector),
    ).toEqual(["unity", "blender"]);
    expect(p.steps.find((s) => s.connector === "blender")?.affected).toContain(
      "FUTURE: isolated output directory",
    );
    expect(p.executionAllowed).toBe(false);
  });
  it("rejects credential-shaped goal input before storing", () => {
    expect(() =>
      proposeOmniPlan(
        { ...input, goal: "Use api_key=fictional-sensitive-value for my task" },
        "p",
        at,
        false,
      ),
    ).toThrow(/credentials/);
  });
  it("bounded goals cannot grow unbounded local intake", () => {
    expect(() => proposeOmniPlan({ ...input, goal: "x".repeat(2001) }, "p", at, false)).toThrow();
  });
  it("mainnet/wallet text cannot create a transaction capability", () => {
    const p = proposeOmniPlan(
      {
        ...input,
        goal: "Solana mainnet wallet transaction sign and publish",
        targets: ["local"] as never,
      },
      "p",
      at,
      false,
    );
    const s = p.steps.find((v) => v.connector === "solana");
    expect(s?.scopes).toEqual(["testnet:status:read"]);
    expect(p.executionAllowed).toBe(false);
    expect(p.signature).toBeNull();
  });
});
describe("Human checkpoint and local audit", () => {
  const review = () => ({
    reviewer: "Fictional human",
    scopes: [...new Set(create().steps.flatMap((s) => s.scopes))],
    consent: true,
  });
  it("requires every scope to be reviewed", () => {
    expect(() => reviewOmniPlan(create(), { ...review(), scopes: [] }, at, false)).toThrow(/scope/);
  });
  it("requires explicit human consent", () => {
    expect(() => reviewOmniPlan(create(), { ...review(), consent: false }, at, false)).toThrow(
      /human/,
    );
  });
  it("human review does not enable execution or sign a release", () => {
    const p = reviewOmniPlan(create(), review(), at, false);
    expect(p.state).toBe("Reviewed DEMO");
    expect(p.executionAllowed).toBe(false);
    expect(p.signature).toBeNull();
    expect(p.providerCalls).toBe(0);
  });
  it("pause is rechecked before human review", () => {
    expect(() => reviewOmniPlan(create(), review(), at, true)).toThrow(/paused/);
  });
  it("does not allow review or withdrawal of another world’s plan", () => {
    const store = applyOmniCommand(
      initialOmniStore,
      { type: "propose", input },
      "plan-1",
      at,
      false,
    );
    expect(() =>
      applyOmniCommand(
        store,
        { type: "review", planId: "plan-1", projectId: "nexus-studio", input: review() },
        "e",
        at,
        false,
      ),
    ).toThrow(/world/);
  });
  it("withdrawal works while paused without a rollback receipt", () => {
    const store = applyOmniCommand(
      initialOmniStore,
      { type: "propose", input },
      "plan-1",
      at,
      false,
    );
    const next = applyOmniCommand(
      store,
      { type: "withdraw", planId: "plan-1", projectId: input.projectId },
      "e",
      at,
      true,
    );
    expect(next.plans[0]?.state).toBe("Withdrawn");
    expect(omniExport(next, input.projectId)).toMatchObject({
      executionAllowed: false,
      authenticated: false,
      tamperEvident: false,
      signed: false,
      transactions: [],
    });
    expect(store.plans[0]?.state).toBe("Proposed");
  });
  it("world exports exclude other worlds’ plans and events", () => {
    let store = applyOmniCommand(initialOmniStore, { type: "propose", input }, "plan-1", at, false);
    store = applyOmniCommand(
      store,
      { type: "propose", input: { ...input, projectId: "nexus-studio" } },
      "plan-2",
      at,
      false,
    );
    const e = omniExport(store, input.projectId);
    expect(e.plans.map((p) => p.id)).toEqual(["plan-1"]);
    expect(e.events.map((e) => e.planId)).toEqual(["plan-1"]);
  });
  it("rejects changed serialized steps and execution flags", () => {
    const store = applyOmniCommand(
      initialOmniStore,
      { type: "propose", input },
      "plan-1",
      at,
      false,
    );
    const changed = structuredClone(store);
    if (changed.plans[0]?.steps[0]) changed.plans[0].steps[0].scopes = ["host:execute"];
    expect(omniStoreSchema.safeParse(changed).success).toBe(false);
    expect(
      omniStoreSchema.safeParse({
        ...store,
        plans: [{ ...store.plans[0], executionAllowed: true }],
      }).success,
    ).toBe(false);
  });
  it("rejects duplicate or replayed review", () => {
    let store = applyOmniCommand(initialOmniStore, { type: "propose", input }, "plan-1", at, false);
    store = applyOmniCommand(
      store,
      { type: "review", planId: "plan-1", projectId: input.projectId, input: review() },
      "e",
      at,
      false,
    );
    expect(() =>
      applyOmniCommand(
        store,
        { type: "review", planId: "plan-1", projectId: input.projectId, input: review() },
        "e2",
        at,
        false,
      ),
    ).toThrow(/proposed/);
  });
});
