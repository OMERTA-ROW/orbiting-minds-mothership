import { describe, it, expect } from "vitest";
import { applyGenesisCommand, emptyGenesisStore, type GenesisStore } from "@/lib/genesis";
import {
  applyTrustCommand,
  artifactDigest,
  emptyTrustStore,
  impactComparison,
  impactInput,
  releasePassport,
  releaseState,
  replayInput,
  safetyAssessment,
  safetyChecks,
  safetyInput,
  trustStoreSchema,
  type ImpactInput,
  type ReleaseInput,
  type ReplayInput,
  type SafetyInput,
  type TrustCommand,
  type TrustStore,
} from "@/lib/trusted-release";
const at = "2026-10-21T01:00:00.000Z";
const identity = {
  name: "Sample owner",
  kind: "Human" as const,
  agentName: "",
  role: "Builder" as const,
  scopes: ["submit_capsules", "simulate_twins", "review_proposals"] as (
    "submit_capsules" | "simulate_twins" | "review_proposals"
  )[],
  consent: true as const,
  spendCapUsd: 0 as const,
};
const passport = {
  organization: "Sample lab",
  provider: "Undisclosed",
  model: "Undisclosed",
  modelVersion: "demo-1",
  protocol: "Manual submission" as const,
  endpoint: "",
  capabilities: ["Research synthesis" as const],
  supportedTasks: "Draft sample proposals only.",
  contact: "",
  licenseTerms: "Preserve original licenses and contributor rights.",
  privacyTerms: "No sensitive context or sharing across providers.",
  requestedRatePerMinute: 10,
  dailyBudgetUsd: 0 as const,
  operatorAuthorized: true as const,
};
function genesis() {
  let g = applyGenesisCommand(
    emptyGenesisStore,
    { type: "identity", input: identity },
    "owner",
    at,
  );
  g = applyGenesisCommand(
    g,
    { type: "identity", input: { ...identity, name: "Sample reviewer" } },
    "reviewer",
    at,
  );
  return applyGenesisCommand(
    g,
    {
      type: "identity",
      input: {
        ...identity,
        name: "Sample operator",
        kind: "Agent operator",
        agentName: "Sample agent",
        passport,
      },
    },
    "agent",
    at,
  );
}
const check = {
  planned: true,
  evidence: "Plan independent synthetic-case evidence; physical tests not performed.",
};
export const safety: SafetyInput = {
  scenarioId: "rover-safe-stop",
  operatorId: "owner",
  checks: { stability: check, collision: check, estop: check, area: check, payload: check },
  hazard: "No hazard in fictional fixture",
  operatorApproval: true,
  consent: true,
};
export const impact: ImpactInput = {
  title: "Latency sample",
  operatorId: "owner",
  problem: "Compare fictional response-time inputs only.",
  unit: "milliseconds",
  direction: "Lower is better",
  baseline: [100, 110, 90],
  candidate: [80, 88, 72],
  method:
    "Same synthetic input order, median comparison, independently reproduce before claiming benefit.",
  fixtureVersion: "authored-fixture-1",
  limitations: "No real measurement or code execution; independent test evidence missing.",
  consent: true,
};
export const replay: ReplayInput = {
  title: "Sample replay",
  operatorId: "owner",
  caseId: "two-commands-one-rover",
  codeId: "image-contrast",
  version: "0.2.0",
  buildId: "authored-build-1",
  inputVersion: "fictional-input-1",
  steps: [
    {
      offsetMs: 0,
      expected: "One proposed source of authority.",
      actual: "Two fictional proposals disagree.",
      command: "Inert pause proposal",
      sensor: "Synthetic only; no capture",
    },
    {
      offsetMs: 1000,
      expected: "Review conflicting fictional proposals.",
      actual: "Nothing executes or moves physically.",
      command: "Inert review proposal",
      sensor: "Unknown hardware state",
    },
  ],
  logs: "Authored transcript, no private logs.",
  rootCause: "Hypothesis only",
  hypothesis: "Arbitration remains hypothetical; independent tests missing.",
  clip: { url: "", creator: "", license: "", captions: "", authorized: false },
  privacyReviewed: true,
  consent: true,
};
export const release: ReleaseInput = {
  codeId: "image-contrast",
  version: "0.2.0",
  ownerId: "owner",
  agentOperatorId: "agent",
  artifact: "export const original_sample = 'not_executed';",
  license: "MIT",
  dependencies: "Original sample; transitive rights require independent review.",
  testEvidence: "Declared test plan, never executed by this local workflow.",
  rollback: "Rehearse restoration of a prior sample only; no actual installation.",
  previousVersion: "0.1.0",
  scenarioId: "",
  safetyId: "",
  replayId: "",
  impactId: "",
  consent: true,
};
const cmd = (s: TrustStore, c: TrustCommand, id = "event", g: GenesisStore = genesis()) =>
  applyTrustCommand(s, g, c, id, at);
async function draft(input = release) {
  return cmd(emptyTrustStore, { type: "release", input }, "release");
}
async function signed() {
  return cmd(
    await draft(),
    {
      type: "signoff",
      releaseId: "release",
      reviewerId: "reviewer",
      note: "Local review only; nothing certified or signed.",
      consent: true,
    },
    "signoff",
  );
}
function firstRelease(s: TrustStore) {
  const r = s.releases[0];
  if (!r) throw new Error("Missing test draft");
  return r;
}
describe("Trusted release local safety rehearsal", () => {
  it("starts without fabricated audits, results or approvals", () => {
    expect(emptyTrustStore).toEqual({
      version: 1,
      safety: [],
      replays: [],
      impacts: [],
      releases: [],
      events: [],
    });
  });
  it("requires explicit safety consent", () => {
    expect(safetyInput.safeParse({ ...safety, consent: false }).success).toBe(false);
  });
  it.each(safetyChecks)("requires a planned $id check and evidence", async (c) => {
    const s = await cmd(
      emptyTrustStore,
      {
        type: "safety",
        input: {
          ...safety,
          checks: { ...safety.checks, [c.id]: { planned: false, evidence: "" } },
        },
      },
      "safety",
    );
    expect(safetyAssessment(s.safety[0]).checklistComplete).toBe(false);
    expect(safetyAssessment(s.safety[0]).missing).toContain(c.title);
  });
  it("never unlocks hardware or claims a physical E-stop test even with complete checklist", async () => {
    const s = await cmd(emptyTrustStore, { type: "safety", input: safety }, "safety");
    expect(safetyAssessment(s.safety[0])).toMatchObject({
      checklistComplete: true,
      hardwareAllowed: false,
      releaseAllowed: false,
      physicalEstop: "NOT_TESTED",
      independentTests: "NOT_RUN",
    });
  });
  it("blocks completeness without human operator approval", async () => {
    const s = await cmd(emptyTrustStore, {
      type: "safety",
      input: { ...safety, operatorApproval: false },
    });
    expect(safetyAssessment(s.safety[0]).checklistComplete).toBe(false);
  });
  it.each(["Unknown / escalate", "Conflict / unsafe"])(
    "escalates %s instead of granting readiness",
    async (hazard) => {
      const s = await cmd(emptyTrustStore, { type: "safety", input: { ...safety, hazard } });
      expect(safetyAssessment(s.safety[0]).checklistComplete).toBe(false);
    },
  );
  it("requires a human safety-plan operator, not an agent declaration", async () => {
    await expect(
      cmd(emptyTrustStore, { type: "safety", input: { ...safety, operatorId: "agent" } }),
    ).rejects.toThrow("human test operator");
  });
  it("rejects revoked operator consent", async () => {
    const g = applyGenesisCommand(
      genesis(),
      { type: "revoke", identityId: "owner" },
      "revoked",
      at,
    );
    await expect(
      cmd(emptyTrustStore, { type: "safety", input: safety }, "safety", g),
    ).rejects.toThrow("active");
  });
  it("preserves expected and actual replay data without running commands", async () => {
    const s = await cmd(emptyTrustStore, { type: "replay", input: replay });
    expect(s.replays[0]?.steps[0]?.actual).toBe("Two fictional proposals disagree.");
    expect(s.replays[0]?.rootCause).toBe("Hypothesis only");
  });
  it("does not accept claimed verified root causes", () => {
    expect(replayInput.safeParse({ ...replay, rootCause: "VERIFIED" }).success).toBe(false);
  });
  it("requires increasing timeline offsets", () => {
    expect(
      replayInput.safeParse({ ...replay, steps: replay.steps.map((s) => ({ ...s, offsetMs: 0 })) })
        .success,
    ).toBe(false);
  });
  it("blocks clip metadata without creator authorization", () => {
    expect(
      replayInput.safeParse({
        ...replay,
        clip: {
          url: "https://example.org/fictional-clip",
          creator: "Sample creator",
          license: "CC0 sample",
          captions: "Authored sample captions only.",
          authorized: false,
        },
      }).success,
    ).toBe(false);
  });
  it("allows inert authorized clip metadata only", () => {
    expect(
      replayInput.safeParse({
        ...replay,
        clip: {
          url: "https://example.org/fictional-clip",
          creator: "Sample creator",
          license: "CC0 sample",
          captions: "Authored sample captions only.",
          authorized: true,
        },
      }).success,
    ).toBe(true);
  });
  it("rejects active-script clip links", () => {
    expect(
      replayInput.safeParse({ ...replay, clip: { ...replay.clip, url: "javascript:alert(1)" } })
        .success,
    ).toBe(false);
  });
  it("screens sample PII before saving replay logs", async () => {
    await expect(
      cmd(emptyTrustStore, {
        type: "replay",
        input: { ...replay, logs: "Fictional identifying example: person@example.org" },
      }),
    ).rejects.toThrow("flagged");
  });
  it("requires privacy review and replay consent", () => {
    expect(replayInput.safeParse({ ...replay, privacyReviewed: false }).success).toBe(false);
    expect(replayInput.safeParse({ ...replay, consent: false }).success).toBe(false);
  });
  it("calculates concrete median-based comparison without claiming verified benefit", () => {
    expect(impactComparison(impact)).toMatchObject({
      baseline: 100,
      candidate: 80,
      delta: 20,
      improvementPercent: 20,
      pairs: 3,
      verifiedBenefit: false,
    });
  });
  it("handles higher-is-better and regression without counting submissions", () => {
    expect(impactComparison({ ...impact, direction: "Higher is better" }).improvementPercent).toBe(
      -20,
    );
  });
  it("requires reproducible paired numeric samples and controls", () => {
    expect(impactInput.safeParse({ ...impact, candidate: [80] }).success).toBe(false);
    expect(impactInput.safeParse({ ...impact, method: "" }).success).toBe(false);
    expect(impactInput.safeParse({ ...impact, baseline: [NaN, 100, 90] }).success).toBe(false);
  });
  it("does not manufacture a percentage for zero median", () => {
    expect(impactComparison({ ...impact, baseline: [0, 0, 1] }).improvementPercent).toBeNull();
  });
  it("hashes exact sample text without executing code", async () => {
    expect(await artifactDigest("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await artifactDigest("abc ")).not.toBe(await artifactDigest("abc"));
  });
  it("requires a separate human owner", async () => {
    await expect(draft({ ...release, ownerId: "agent" })).rejects.toThrow("human owner");
  });
  it("prevents replacing a preserved version", async () => {
    await expect(
      cmd(await draft(), {
        type: "release",
        input: { ...release, artifact: "Replacement sample, must not overwrite." },
      }),
    ).rejects.toThrow("version is preserved");
  });
  it("requires a distinct human reviewer", async () => {
    await expect(
      cmd(await draft(), {
        type: "signoff",
        releaseId: "release",
        reviewerId: "owner",
        note: "Sample review declaration only.",
        consent: true,
      }),
    ).rejects.toThrow("distinct");
  });
  it("rejects unknown license signoff", async () => {
    await expect(
      cmd(await draft({ ...release, license: "Unknown / permission required" }), {
        type: "signoff",
        releaseId: "release",
        reviewerId: "reviewer",
        note: "Sample review declaration only.",
        consent: true,
      }),
    ).rejects.toThrow("license");
  });
  it("blocks robotics signoff without its matching safety plan", async () => {
    await expect(
      cmd(await draft({ ...release, scenarioId: "rover-safe-stop" }), {
        type: "signoff",
        releaseId: "release",
        reviewerId: "reviewer",
        note: "Sample review declaration only.",
        consent: true,
      }),
    ).rejects.toThrow("safety plan");
  });
  it("blocks a replay tied to a different code version", async () => {
    let s = await cmd(emptyTrustStore, { type: "replay", input: replay }, "replay");
    s = await cmd(
      s,
      { type: "release", input: { ...release, version: "0.3.0", replayId: "replay" } },
      "release",
    );
    await expect(
      cmd(s, {
        type: "signoff",
        releaseId: "release",
        reviewerId: "reviewer",
        note: "Sample review declaration only.",
        consent: true,
      }),
    ).rejects.toThrow("same code and version");
  });
  it("detects sample-text tampering before local signoff", async () => {
    const s = await draft();
    firstRelease(s).artifact = "Changed text but unchanged recorded digest.";
    await expect(
      cmd(s, {
        type: "signoff",
        releaseId: "release",
        reviewerId: "reviewer",
        note: "Sample review declaration only.",
        consent: true,
      }),
    ).rejects.toThrow("Artifact mismatch");
  });
  it("invalidates signoff when evidence or draft text changes", async () => {
    const s = await signed();
    firstRelease(s).testEvidence = "Changed declarations require a new local review.";
    expect(releaseState(firstRelease(s), s, genesis())).toContain("signoff invalidated");
  });
  it("invalidates signoff after reviewer consent revocation", async () => {
    const s = await signed(),
      g = applyGenesisCommand(genesis(), { type: "revoke", identityId: "reviewer" }, "revoke", at);
    expect(releaseState(firstRelease(s), s, g)).toBe("Consent invalidated");
  });
  it("rejects revocation by another declared owner", async () => {
    await expect(
      cmd(await signed(), {
        type: "revoke",
        releaseId: "release",
        actorId: "reviewer",
        consent: true,
      }),
    ).rejects.toThrow("local owner");
  });
  it("preserves prior signoff after local revocation", async () => {
    const s = await cmd(
      await signed(),
      { type: "revoke", releaseId: "release", actorId: "owner", consent: true },
      "revoke",
    );
    expect(firstRelease(s).state).toBe("Revoked");
    expect(firstRelease(s).signoff?.reviewerId).toBe("reviewer");
    expect(s.events).toHaveLength(3);
  });
  it("does not allow unsigned rollback even after revocation", async () => {
    const s = await cmd(
      await draft(),
      { type: "revoke", releaseId: "release", actorId: "owner", consent: true },
      "revoke",
    );
    await expect(
      cmd(s, { type: "rollback", releaseId: "release", actorId: "owner", consent: true }),
    ).rejects.toThrow("preserved local signoff");
  });
  it("rehearses rollback without executing or verifying restoration", async () => {
    const s = await cmd(
      await signed(),
      { type: "rollback", releaseId: "release", actorId: "owner", consent: true },
      "rollback",
    );
    const p = await releasePassport(firstRelease(s), s, genesis());
    expect(p.rollback).toMatchObject({
      actuallyExecuted: false,
      verified: false,
      localState: "Rollback rehearsed",
    });
  });
  it("exports truthful unsigned, non-tamper-evident passport", async () => {
    const s = await signed();
    expect(await releasePassport(firstRelease(s), s, genesis())).toMatchObject({
      mode: "LOCAL_DEMO",
      digestMatches: true,
      authenticated: false,
      signature: null,
      tamperEvident: false,
      independentTests: "NOT_RUN",
      guardianSignoff: "NOT_VERIFIED",
      supportedDevices: [],
      deploymentAllowed: false,
      hardwareAllowed: false,
    });
  });
  it("rejects malformed storage, duplicate records and missing linked evidence", async () => {
    const s = await draft();
    expect(trustStoreSchema.safeParse({ ...s, version: 99 }).success).toBe(false);
    expect(
      trustStoreSchema.safeParse({ ...s, releases: [firstRelease(s), firstRelease(s)] }).success,
    ).toBe(false);
    expect(
      trustStoreSchema.safeParse({ ...s, releases: [{ ...firstRelease(s), safetyId: "missing" }] })
        .success,
    ).toBe(false);
  });
  it("rejects a mismatched scenario safety plan", async () => {
    let s = await cmd(emptyTrustStore, { type: "safety", input: safety }, "safety");
    s = await cmd(
      s,
      {
        type: "release",
        input: { ...release, scenarioId: "accessible-escort", safetyId: "safety" },
      },
      "release",
    );
    await expect(
      cmd(s, {
        type: "signoff",
        releaseId: "release",
        reviewerId: "reviewer",
        note: "Sample review only; hardware remains disabled.",
        consent: true,
      }),
    ).rejects.toThrow();
  });
  it("rejects an incomplete linked safety plan", async () => {
    let s = await cmd(
      emptyTrustStore,
      { type: "safety", input: { ...safety, operatorApproval: false } },
      "safety",
    );
    s = await cmd(
      s,
      { type: "release", input: { ...release, scenarioId: "rover-safe-stop", safetyId: "safety" } },
      "release",
    );
    await expect(
      cmd(s, {
        type: "signoff",
        releaseId: "release",
        reviewerId: "reviewer",
        note: "Sample review only; hardware remains disabled.",
        consent: true,
      }),
    ).rejects.toThrow("incomplete");
  });
  it("invalidates a signoff when linked evidence changes", async () => {
    let s = await cmd(emptyTrustStore, { type: "impact", input: impact }, "impact");
    s = await cmd(s, { type: "release", input: { ...release, impactId: "impact" } }, "release");
    s = await cmd(
      s,
      {
        type: "signoff",
        releaseId: "release",
        reviewerId: "reviewer",
        note: "Sample review only; independent impact unknown.",
        consent: true,
      },
      "signoff",
    );
    const r = s.impacts[0];
    if (!r) throw new Error("Missing comparison");
    r.candidate = [70, 77, 63];
    expect(releaseState(firstRelease(s), s, genesis())).toContain("signoff invalidated");
  });
  it("preserves identity attribution in the passport without claiming authentication", async () => {
    const s = await signed();
    expect((await releasePassport(firstRelease(s), s, genesis())).signoff).toMatchObject({
      reviewerName: "Sample reviewer",
      authentication: "NOT_AUTHENTICATED",
    });
  });
  it("rejects non-serializable arbitrary input without saving records", async () => {
    const input: { self?: unknown } = {};
    input.self = input;
    await expect(cmd(emptyTrustStore, { type: "replay", input })).rejects.toThrow("serializable");
    expect(emptyTrustStore.replays).toHaveLength(0);
  });
  it("exports digest mismatch honestly even after local rollback", async () => {
    const s = await cmd(
      await signed(),
      { type: "rollback", releaseId: "release", actorId: "owner", consent: true },
      "rollback",
    );
    firstRelease(s).artifact = "Tampered local sample remains untrusted.";
    const p = await releasePassport(firstRelease(s), s, genesis());
    expect(p.digestMatches).toBe(false);
    expect(p.state).toBe("Artifact digest mismatch");
  });
});
