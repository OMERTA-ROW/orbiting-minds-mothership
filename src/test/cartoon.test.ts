import { describe, it, expect } from "vitest";
import { cartoonReviewChecks } from "@/data/evolution";
import {
  applyCartoonCommand,
  initialCartoonStore,
  seedCartoon,
  cartoonTiming,
  cartoonExport,
  readCartoonStore,
  cartoonStoreSchema,
  type CartoonStore,
} from "@/lib/cartoon";
const at = "2026-10-21T02:21:00.000Z",
  worldId = "nexus-studio",
  draft = seedCartoon();
const create = () =>
  applyCartoonCommand(
    initialCartoonStore,
    { type: "create", worldId, draft, consent: true },
    "p",
    at,
    false,
  );
function prepared() {
  const s = create();
  const p = s.plans[0];
  if (!p) throw new Error("Missing pitch");
  return applyCartoonCommand(
    s,
    {
      type: "edit",
      worldId,
      id: "p",
      draft: { ...draft, scenes: draft.scenes.map((s) => ({ ...s, status: "Reviewed DEMO" })) },
    },
    "edit",
    at,
    false,
  );
}
const command = {
  type: "review" as const,
  worldId,
  id: "p",
  reviewer: "Demo editor",
  notes: "Human concept review only; independent legal and media evidence missing.",
  checks: cartoonReviewChecks.map((c) => c.id),
  publicationIntent: true,
};
const reviewed = () => applyCartoonCommand(prepared(), command, "review", at, false);
describe("Cartoon Galaxy rights, child privacy and revision gates", () => {
  it("requires fictional local storage consent", () =>
    expect(() =>
      applyCartoonCommand(
        initialCartoonStore,
        { type: "create", worldId, draft, consent: false },
        "p",
        at,
        false,
      ),
    ).toThrow(/consent/));
  it("stores original concept declarations without provider calls", () => {
    const p = create().plans[0];
    expect(p?.title).toBe("Pip & Moss: The Seedlight Voyages");
    expect(p?.providerCalls).toBe(0);
    expect(p?.publicationAllowed).toBe(false);
    expect(p?.signature).toBeNull();
  });
  it.each([
    "CyberLink Social",
    "clone Disney character",
    "impersonate real performer",
    "api_key=fictional-secret",
  ])("rejects prohibited sample %s", (value) =>
    expect(() =>
      applyCartoonCommand(
        initialCartoonStore,
        { type: "create", worldId, draft: { ...draft, logline: value }, consent: true },
        "p",
        at,
        false,
      ),
    ).toThrow(),
  );
  it("rejects excluded project identity", () =>
    expect(() =>
      applyCartoonCommand(
        initialCartoonStore,
        { type: "create", worldId: "nexus-cyberlink", draft, consent: true },
        "p",
        at,
        false,
      ),
    ).toThrow());
  it("requires every scene to be reviewed or skipped", () =>
    expect(() => applyCartoonCommand(create(), command, "r", at, false)).toThrow(/every scene/));
  it.each(cartoonReviewChecks.map((c) => c.id))("requires human %s declaration", (key) =>
    expect(() =>
      applyCartoonCommand(
        prepared(),
        { ...command, checks: command.checks.filter((c) => c !== key) },
        "r",
        at,
        false,
      ),
    ).toThrow(),
  );
  it("requires separate delivery-preparation confirmation", () =>
    expect(() =>
      applyCartoonCommand(prepared(), { ...command, publicationIntent: false }, "r", at, false),
    ).toThrow());
  it("records an evidence-gapped human originality assessment, not a score", () => {
    const p = reviewed().plans[0];
    expect(p?.review?.notes).toBe(command.notes);
    expect(p?.review?.checks).toHaveLength(7);
    expect(p?.review?.revision).toBe(2);
    expect(p?.mediaEvidence).toBe("NOT RUN");
  });
  it("edits invalidate the prior editorial approval", () => {
    const s = applyCartoonCommand(
      reviewed(),
      { type: "edit", worldId, id: "p", draft: { ...draft, title: "Pip & Moss: New Story" } },
      "e",
      at,
      false,
    );
    expect(s.plans[0]?.state).toBe("Proposed");
    expect(s.plans[0]?.review).toBeNull();
    expect(s.plans[0]?.revision).toBe(3);
  });
  it("restoring does not restore review authority", () => {
    const s = applyCartoonCommand(
      reviewed(),
      { type: "restore", worldId, id: "p", revision: 1 },
      "e",
      at,
      false,
    );
    expect(s.plans[0]?.revision).toBe(3);
    expect(s.plans[0]?.review).toBeNull();
    expect(s.plans[0]?.scenes[0]?.status).toBe("Proposed");
  });
  it("requires current editorial approval for delivery prep", () =>
    expect(() => cartoonExport(create(), "p", worldId, true)).toThrow(/editorial/));
  it("exports no live media or publication authority", () => {
    const e = cartoonExport(reviewed(), "p", worldId, true);
    expect(e.kind).toBe("DEMO_DISTRIBUTION_PREPARATION");
    expect(e.mediaIncluded).toBe(false);
    expect(e.originalityCertified).toBe(false);
    expect(e.rightsVerified).toBe(false);
    expect(e.publicationAllowed).toBe(false);
    expect(e.providerCalls).toBe(0);
  });
  it("cannot read another world’s pitch", () =>
    expect(() => cartoonExport(reviewed(), "p", "nexus-cyberace")).toThrow(/not found/));
  it("cannot edit another world’s pitch", () =>
    expect(() =>
      applyCartoonCommand(
        create(),
        { type: "edit", worldId: "nexus-nebula", id: "p", draft },
        "e",
        at,
        false,
      ),
    ).toThrow(/not found/));
  it("new pitches respect emergency pause", () =>
    expect(() =>
      applyCartoonCommand(
        initialCartoonStore,
        { type: "create", worldId, draft, consent: true },
        "p",
        at,
        true,
      ),
    ).toThrow(/paused/));
  it("editorial review respects emergency pause", () =>
    expect(() => applyCartoonCommand(prepared(), command, "r", at, true)).toThrow(/paused/));
  it("editing respects emergency pause", () =>
    expect(() =>
      applyCartoonCommand(create(), { type: "edit", id: "p", worldId, draft }, "e", at, true),
    ).toThrow(/paused/));
  it("restoring respects emergency pause", () =>
    expect(() =>
      applyCartoonCommand(
        prepared(),
        { type: "restore", id: "p", worldId, revision: 1 },
        "e",
        at,
        true,
      ),
    ).toThrow(/paused/));
  it("withdrawal stays available during pause and revokes delivery prep", () => {
    const s = applyCartoonCommand(
      reviewed(),
      { type: "withdraw", id: "p", worldId },
      "w",
      at,
      true,
    );
    expect(s.plans[0]?.state).toBe("Withdrawn");
    expect(s.plans[0]?.review).toBeNull();
    expect(() => cartoonExport(s, "p", worldId, true)).toThrow();
    expect(cartoonExport(s, "p", worldId).kind).toBe("DEMO_WORKING_PITCH");
  });
  it("withdrawn pitches cannot regain review", () => {
    const s = applyCartoonCommand(
      reviewed(),
      { type: "withdraw", id: "p", worldId },
      "w",
      at,
      false,
    );
    expect(() => applyCartoonCommand(s, command, "r", at, false)).toThrow(/Withdrawn/);
  });
  it("computes exact static timeline without processing frames", () =>
    expect(cartoonTiming(draft)).toEqual([
      { id: "scene-1", startSeconds: 0, endSeconds: 12, frames: 288 },
      { id: "scene-2", startSeconds: 12, endSeconds: 24, frames: 288 },
      { id: "scene-3", startSeconds: 24, endSeconds: 36, frames: 288 },
    ]));
  it("reads consented records back without losing reviews", () =>
    expect(readCartoonStore(JSON.stringify(reviewed()))).toEqual(reviewed()));
  it("rejects tampered execution flags", () => {
    const s = reviewed();
    const p = s.plans[0];
    if (!p) throw new Error("Missing pitch");
    expect(
      cartoonStoreSchema.safeParse({ ...s, plans: [{ ...p, executionAllowed: true }] }).success,
    ).toBe(false);
  });
  it("rejects stale review revision", () => {
    const s = reviewed();
    const p = s.plans[0];
    if (!p?.review) throw new Error("Missing review");
    expect(
      cartoonStoreSchema.safeParse({
        ...s,
        plans: [{ ...p, review: { ...p.review, revision: 1 } }],
      }).success,
    ).toBe(false);
  });
  it("rejects altered checkpoint content", () => {
    const s = create();
    const p = s.plans[0];
    if (!p) throw new Error("Missing pitch");
    expect(
      cartoonStoreSchema.safeParse({ ...s, plans: [{ ...p, title: "Tampered" }] }).success,
    ).toBe(false);
  });
  it("rejects duplicated historical revisions", () => {
    const s = reviewed();
    const p = s.plans[0];
    if (!p) throw new Error("Missing pitch");
    expect(
      cartoonStoreSchema.safeParse({
        ...s,
        plans: [{ ...p, checkpoints: p.checkpoints.map((c) => ({ ...c, revision: 2 })) }],
      }).success,
    ).toBe(false);
  });
  it("rejects reordered historical revisions", () => {
    const s = reviewed();
    const p = s.plans[0];
    if (!p) throw new Error("Missing pitch");
    expect(
      cartoonStoreSchema.safeParse({
        ...s,
        plans: [{ ...p, checkpoints: [...p.checkpoints].reverse() }],
      }).success,
    ).toBe(false);
  });
  it("keeps template seeds isolated", () => {
    const a = seedCartoon();
    const c = a.characters[0];
    if (!c) throw new Error("Missing character");
    c.name = "Changed";
    expect(seedCartoon().characters[0]?.name).toBe("Pip");
  });
  it("rejects missing historical checkpoints", () => {
    const s = reviewed();
    const p = s.plans[0];
    if (!p) throw new Error("Missing pitch");
    expect(
      cartoonStoreSchema.safeParse({ ...s, plans: [{ ...p, checkpoints: p.checkpoints.slice(1) }] })
        .success,
    ).toBe(false);
  });
  it("validates scene identities in historical drafts", () => {
    const s = reviewed();
    const p = s.plans[0];
    if (!p) throw new Error("Missing pitch");
    const checkpoints = p.checkpoints.map((cp, i) =>
      i === 0
        ? {
            ...cp,
            draft: {
              ...cp.draft,
              scenes: cp.draft.scenes.map((scene) => ({ ...scene, id: "scene-1" })),
            },
          }
        : cp,
    );
    expect(cartoonStoreSchema.safeParse({ ...s, plans: [{ ...p, checkpoints }] }).success).toBe(
      false,
    );
  });
});
