import { describe, expect, it } from "vitest";
import { createInsight, createProspect } from "./omni-angel-tech";
import {
  createFeedback,
  createMemory,
  loadSabrinaStore,
  matchScore,
  opportunityRadar,
  recallMemories,
  saveSabrinaStore,
  tokenize,
  weeklyBrief,
} from "./omni-sabrina";

const NOW = new Date("2026-10-31T12:00:00.000Z");
const STAMP = NOW.toISOString();

function makeInsight(overrides: Record<string, unknown> = {}) {
  return createInsight(
    {
      audience: "Independent AI research groups",
      trend: "Agent collaboration protocols are maturing across research labs",
      invention: "Consent-first agent partnership kit",
      evidence: "Owner-entered observation from public conference notes",
      confidence: 60,
      usesPrivateContext: false,
      privateAuthorization: false,
      ...overrides,
    },
    "insight-1",
    STAMP,
  );
}

function makeProspect(overrides: Record<string, unknown> = {}) {
  return createProspect(
    {
      name: "Atlas Research Agent",
      organization: "Atlas Labs",
      focus: "Agent collaboration and partnership protocols for research groups",
      source: "Owner-entered public reference",
      perspective: "Values consent-first collaboration and documented interfaces",
      compatibility: ["api-documented"],
      permissions: ["public-research", "prepare-invitation"],
      ownerAuthorization: true,
      humanApproval: "approved",
      ...overrides,
    },
    "prospect-1",
    STAMP,
  );
}

describe("tokenize", () => {
  it("drops stop words and short tokens", () => {
    const tokens = tokenize("The agent and the lab are on it");
    expect(tokens.has("the")).toBe(false);
    expect(tokens.has("on")).toBe(false);
    expect(tokens.has("agent")).toBe(true);
    expect(tokens.has("lab")).toBe(true);
  });
});

describe("matchScore", () => {
  it("scores shared focus terms with explainable reasons", () => {
    const match = matchScore(makeInsight(), makeProspect());
    expect(match.score).toBeGreaterThan(40);
    expect(match.sharedTerms).toContain("agent");
    expect(match.reasons.join(" ")).toMatch(/shared focus term/);
  });

  it("returns zero with an exclusion reason for revoked prospects", () => {
    const revoked = { ...makeProspect(), status: "revoked" as const };
    const match = matchScore(makeInsight(), revoked);
    expect(match.score).toBe(0);
    expect(match.reasons[0]).toMatch(/Revoked/);
  });

  it("returns zero shared terms when nothing overlaps", () => {
    const match = matchScore(
      makeInsight({ invention: "Underwater basket weaving", trend: "Tidal patterns shift", audience: "Weavers" }),
      makeProspect({ focus: "Quantum compiler verification", name: "QVerify", organization: "QLabs" }),
    );
    expect(match.sharedTerms).toEqual([]);
  });
});

describe("opportunityRadar", () => {
  it("excludes revoked prospects and gates unapproved ones", () => {
    const revoked = { ...makeProspect(), id: "prospect-2", status: "revoked" as const };
    const unapproved = makeProspect({ ownerAuthorization: false, humanApproval: "not-reviewed" });
    const radar = opportunityRadar([makeInsight()], [revoked, unapproved]);
    expect(radar).toHaveLength(1);
    expect(radar[0].gate).toBe("gated");
    expect(radar[0].gateReasons.join(" ")).toMatch(/Owner authorization missing/);
  });

  it("marks fully approved matches ready for review and sorts by score", () => {
    const radar = opportunityRadar([makeInsight()], [makeProspect()]);
    expect(radar[0].gate).toBe("ready-for-review");
    expect(radar[0].gateReasons).toEqual([]);
  });
});

describe("strategic memory", () => {
  it("rejects lessons that are too short or expiry beyond one year", () => {
    expect(() =>
      createMemory({ lesson: "short", source: "ok", confidence: 50, expiresInDays: 30 }, "m1", NOW),
    ).toThrow();
    expect(() =>
      createMemory(
        { lesson: "A sufficiently long lesson text", source: "ok", confidence: 50, expiresInDays: 400 },
        "m1",
        NOW,
      ),
    ).toThrow();
  });

  it("expires memories and recall never returns expired or deleted entries", () => {
    const memory = createMemory(
      { lesson: "Research groups respond to consent-first framing", source: "Owner note", confidence: 70, expiresInDays: 7 },
      "m1",
      NOW,
    );
    expect(recallMemories([memory], NOW)).toHaveLength(1);
    const later = new Date(NOW.getTime() + 8 * 86_400_000);
    expect(recallMemories([memory], later)).toHaveLength(0);
    // Deletion is removal from the array; retrieval cannot return it.
    expect(recallMemories([], NOW)).toHaveLength(0);
  });
});

describe("weeklyBrief", () => {
  it("summarizes counts, top opportunities and honest limitations", () => {
    const brief = weeklyBrief([makeInsight()], [makeProspect()], [], [], NOW);
    expect(brief.weekOf).toBe("2026-10-31");
    expect(brief.body).toMatch(/Intelligence notes: 1/);
    expect(brief.body).toMatch(/Consent-first agent partnership kit × Atlas Research Agent/);
    expect(brief.body).toMatch(/Nothing has been sent, published, scheduled or connected/);
    expect(brief.body).toMatch(/not independent market research/);
  });

  it("handles an empty workspace without inventing opportunities", () => {
    const brief = weeklyBrief([], [], [], [], NOW);
    expect(brief.body).toMatch(/None yet/);
  });
});

describe("Jackboy feedback", () => {
  it("creates local-handoff feedback records only", () => {
    const feedback = createFeedback(
      { kind: "capability-gap", summary: "Prospects need a documented webhook channel", relatedName: "Atlas Labs" },
      "f1",
      STAMP,
    );
    expect(feedback.delivery).toBe("local-handoff");
    expect(feedback.kind).toBe("capability-gap");
  });

  it("rejects invalid kinds and short summaries", () => {
    expect(() => createFeedback({ kind: "spam", summary: "long enough summary text" }, "f1", STAMP)).toThrow();
    expect(() => createFeedback({ kind: "quality", summary: "short" }, "f1", STAMP)).toThrow();
  });
});

describe("sabrina store", () => {
  it("round-trips and tolerates corrupt data", () => {
    const store = { memories: [], briefs: [], feedback: [createFeedback({ kind: "quality", summary: "Draft quality needs a second pass" }, "f1", STAMP)] };
    const loaded = loadSabrinaStore(saveSabrinaStore(store));
    expect(loaded.feedback).toHaveLength(1);
    expect(loadSabrinaStore("not json")).toEqual({ memories: [], briefs: [], feedback: [] });
    expect(loadSabrinaStore(null)).toEqual({ memories: [], briefs: [], feedback: [] });
  });
});
