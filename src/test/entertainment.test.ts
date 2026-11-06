import { describe, it, expect } from "vitest";
import {
  entertainmentAdapters,
  entertainmentStudios,
  entertainmentTemplates,
} from "@/data/evolution";
import {
  applyCreativeCommand,
  initialCreativeStore,
  readCreativeStore,
  creativeExport,
  creativeSeed,
  mediaAdapterManifest,
  compareMediaMetrics,
  syntheticToneMetrics,
  type CreativeInput,
  type CreativeStore,
  type CreativeCommand,
} from "@/lib/entertainment";
const at = "2026-10-21T02:12:00.000Z";
const input: CreativeInput = {
  worldId: "nexus-studio",
  studioId: "film",
  goal: "Prepare an original fictional lunar short with caption QA.",
  credit: "Fictional human creator",
  rights: "Original generated concept samples only; no private footage.",
  destination: "No distribution",
  consent: true,
};
function start(i: CreativeInput = input) {
  return applyCreativeCommand(
    initialCreativeStore,
    { type: "propose", input: i },
    "plan-1",
    at,
    false,
  );
}
function processReviews(store: CreativeStore) {
  let s = store;
  for (const step of s.plans[0]?.steps ?? [])
    s = applyCreativeCommand(
      s,
      {
        type: "edit",
        planId: "plan-1",
        worldId: input.worldId,
        stepId: step.id,
        patch: {
          title: step.title,
          shot: step.shot,
          duration: step.duration,
          role: step.role,
          status: "Reviewed DEMO",
        },
      },
      "e",
      at,
      false,
    );
  return s;
}
function approve(
  store: CreativeStore,
  overrides: Partial<Extract<CreativeCommand, { type: "review" }>> = {},
) {
  return applyCreativeCommand(
    store,
    {
      type: "review",
      planId: "plan-1",
      worldId: input.worldId,
      reviewer: "Human owner",
      rights: true,
      privacy: true,
      publicationIntent: false,
      scopes: ["sample:metadata:read", "timeline:propose"],
      ...overrides,
    },
    "review",
    at,
    false,
  );
}
describe("Entertainment Galaxy consent and truthful plans", () => {
  it.each(entertainmentStudios)("supports $name without execution", (s) => {
    const p = start({ ...input, studioId: s.id }).plans[0];
    expect(p?.studioId).toBe(s.id);
    expect(p?.steps.map((x) => x.capability)).toEqual([...s.steps]);
    expect(p?.executionAllowed).toBe(false);
    expect(p?.steps.every((x) => x.evidence === "NOT RUN")).toBe(true);
  });
  it("requires local sample storage consent", () =>
    expect(() => start({ ...input, consent: false })).toThrow(/Consent/));
  it("rejects excluded separate worlds", () =>
    expect(() => start({ ...input, worldId: "cyberlink-social" })).toThrow(/excluded/));
  it("rejects targeting the separate project in goal", () =>
    expect(() => start({ ...input, goal: "Send footage to CyberLink Social" })).toThrow());
  it.each(["password=private", "api_key=private", "-----BEGIN RSA PRIVATE KEY-----"])(
    "rejects possible credentials %s",
    (text) => expect(() => start({ ...input, rights: `Fictional declaration ${text}` })).toThrow(),
  );
  it("keeps Cyberace inert", () => {
    const p = start({ ...input, worldId: "nexus-cyberace" }).plans[0];
    expect(p?.worldId).toBe("nexus-cyberace");
    expect(p?.publicationAllowed).toBe(false);
    expect(p?.providerCalls).toBe(0);
  });
  it("blocks planning during Guardian/Nexus pause", () =>
    expect(() =>
      applyCreativeCommand(initialCreativeStore, { type: "propose", input }, "p", at, true),
    ).toThrow(/paused/));
  it("requires every process reviewed or explicitly skipped", () =>
    expect(() => approve(start())).toThrow(/every process/));
  it("requires rights declaration", () =>
    expect(() => approve(processReviews(start()), { rights: false })).toThrow(/Rights/));
  it("requires privacy declaration", () =>
    expect(() => approve(processReviews(start()), { privacy: false })).toThrow(/privacy/));
  it("requires all scope previews reviewed", () =>
    expect(() => approve(processReviews(start()), { scopes: [] })).toThrow(/scopes/));
  it("separately requires publication intent", () =>
    expect(() =>
      approve(processReviews(start({ ...input, destination: "Unselected third-party platform" }))),
    ).toThrow(/publication-intent/));
  it("human publication review never enables uploading", () => {
    const p = approve(
      processReviews(start({ ...input, destination: "Unselected third-party platform" })),
      { publicationIntent: true },
    ).plans[0];
    expect(p?.state).toBe("Reviewed DEMO");
    expect(p?.publicationAllowed).toBe(false);
    expect(p?.executionAllowed).toBe(false);
    expect(p?.signature).toBeNull();
  });
  it("edits invalidate prior review and retain a checkpoint", () => {
    const s = approve(processReviews(start()));
    const step = s.plans[0]?.steps[0];
    if (!step) throw new Error("Missing step");
    const n = applyCreativeCommand(
      s,
      {
        type: "edit",
        planId: "plan-1",
        worldId: input.worldId,
        stepId: step.id,
        patch: { ...step, title: "Revised original opening", status: "Proposed" },
      },
      "edit",
      at,
      false,
    );
    expect(n.plans[0]?.state).toBe("Proposed");
    expect(n.plans[0]?.review).toBeNull();
    expect(n.plans[0]?.revision).toBe(5);
    expect(n.plans[0]?.checkpoints[3]?.draft.steps[0]?.title).toBe(step.title);
  });
  it("checkpoint restore creates a new unreviewed revision", () => {
    const n = applyCreativeCommand(
      approve(processReviews(start())),
      { type: "restore", planId: "plan-1", worldId: input.worldId, revision: 1 },
      "r",
      at,
      false,
    );
    expect(n.plans[0]?.revision).toBe(5);
    expect(n.plans[0]?.review).toBeNull();
    expect(n.plans[0]?.steps[0]?.status).toBe("Proposed");
    expect(n.plans[0]?.publicationAllowed).toBe(false);
  });
  it("allows withdrawal while paused", () => {
    const n = applyCreativeCommand(
      start(),
      { type: "withdraw", planId: "plan-1", worldId: input.worldId },
      "w",
      at,
      true,
    );
    expect(n.plans[0]?.state).toBe("Withdrawn");
  });
  it("withdrawn plans cannot be edited or reviewed", () => {
    const n = applyCreativeCommand(
      start(),
      { type: "withdraw", planId: "plan-1", worldId: input.worldId },
      "w",
      at,
      false,
    );
    expect(() => approve(n)).toThrow(/Withdrawn/);
  });
  it("rejects cross-world review", () =>
    expect(() => approve(processReviews(start()), { worldId: "nexus-nebula" })).toThrow(/world/));
  it("exports only the selected world", () => {
    const s = applyCreativeCommand(
      start(),
      { type: "propose", input: { ...input, worldId: "nexus-nebula" } },
      "p2",
      at,
      false,
    );
    const e = creativeExport(s, "nexus-studio");
    expect(e.plans.map((p) => p.id)).toEqual(["plan-1"]);
    expect(e.events.every((x) => x.worldId === "nexus-studio")).toBe(true);
    expect(e.privateStorage).toBe(false);
  });
  it("roundtrips validated local records", () =>
    expect(readCreativeStore(JSON.stringify(start())).plans[0]?.goal).toBe(input.goal));
  it("rejects altered adapter authority in storage", () => {
    const s = structuredClone(start());
    if (s.plans[0]?.steps[0]) s.plans[0].steps[0].scopes = ["camera:control"];
    expect(() => readCreativeStore(JSON.stringify(s))).toThrow();
  });
  it("rejects fake executed/verified records", () => {
    const s = JSON.parse(JSON.stringify(start()));
    s.plans[0].executionAllowed = true;
    expect(() => readCreativeStore(JSON.stringify(s))).toThrow();
  });
  it("does not infer providers from natural-language goals", () => {
    const p = start({ ...input, goal: "Call OpenAI, render in Blender and publish the film" })
      .plans[0];
    expect(p?.providerCalls).toBe(0);
    expect(p?.steps.every((s) => s.role === "Human creator")).toBe(true);
    expect(p?.publicationAllowed).toBe(false);
  });
  it.each(entertainmentTemplates)("uses authored $name sample only", (t) => {
    expect(creativeSeed(t.id).goal).toBe(t.goal);
    expect(creativeSeed(t.id).rights).toBe(t.rights);
  });
  it("has no verified or connected creative adapters", () => {
    expect(entertainmentAdapters.some((a) => (a.state as string) === "VERIFIED")).toBe(false);
    expect(entertainmentAdapters.some((a) => (a.state as string) === "CONNECTED")).toBe(false);
  });
  it.each(entertainmentAdapters)("$name manifest remains disabled and unsigned", (a) => {
    const m = mediaAdapterManifest(a.id);
    expect(m.executionAllowed).toBe(false);
    expect(m.verifiedAt).toBeNull();
    expect(m.probePerformed).toBe(false);
    expect(m.signature).toBeNull();
  });
  it("distribution manifest requires its own account and publication gates", () =>
    expect(mediaAdapterManifest("distribution").requiredGates).toContain(
      "Final human publication confirmation",
    ));
});
describe("Media Crucible and safe sample audition", () => {
  it("compares 30 seconds at 24 fps to 720 frames", () => {
    const m = compareMediaMetrics({ duration: 30, fps: 24, candidateFrames: 719, peakDbfs: -1 });
    expect(m.expectedFrames).toBe(720);
    expect(m.frameDelta).toBe(-1);
    expect(m.framesMatch).toBe(false);
    expect(m.independentEvidence).toBe(false);
    expect(m.mediaDecoded).toBe(false);
  });
  it("numeric match is not media/test verification", () => {
    const m = compareMediaMetrics({ duration: 30, fps: 24, candidateFrames: 720, peakDbfs: -1 });
    expect(m.framesMatch).toBe(true);
    expect(m.codeExecuted).toBe(false);
  });
  it("flags declared peak at full scale", () =>
    expect(
      compareMediaMetrics({ duration: 1, fps: 24, candidateFrames: 24, peakDbfs: 0 }).clippingRisk,
    ).toBe(true));
  it("rejects unbounded values", () =>
    expect(() =>
      compareMediaMetrics({ duration: 999, fps: 24, candidateFrames: 24, peakDbfs: -1 }),
    ).toThrow());
  it("reports theoretical tone peak/RMS without inventing LUFS", () => {
    const m = syntheticToneMetrics(0.1);
    expect(m.peakDbfs).toBeCloseTo(-20);
    expect(m.rmsDbfs).toBeCloseTo(-23.0103);
    expect(m.lufs).toBeNull();
    expect(m.sampleRate).toBe(48000);
    expect(m.duration).toBe(2);
  });
  it("bounds sample gain", () => expect(() => syntheticToneMetrics(1)).toThrow());
});
