import { describe, expect, it } from "vitest";
import {
  assignTopic,
  classifyEvidence,
  extractEntities,
  filterSources,
  planAlertEvents,
  routeFinding,
  scoreRelevance,
  type ObservatorySource,
} from "./razul-observatory";

const sources: ObservatorySource[] = [
  {
    id: "cisa",
    name: "CISA",
    url: "https://a.example/feed",
    kind: "rss",
    category: "vulnerability",
    active: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    url: "https://b.example/feed",
    kind: "rss",
    category: "ai-model",
    active: true,
  },
  {
    id: "arxiv",
    name: "arXiv",
    url: "https://c.example/feed",
    kind: "rss",
    category: "research",
    active: false,
  },
  {
    id: "dev",
    name: "Dev",
    url: "https://d.example/feed",
    kind: "rss",
    category: "development",
    active: true,
  },
];

describe("scoreRelevance", () => {
  it("scores vulnerability keywords in the title highly", () => {
    const score = scoreRelevance(
      { title: "CVE-2026-1234 remote code execution advisory", summary: "" },
      "vulnerability",
    );
    expect(score).toBeGreaterThanOrEqual(54);
  });

  it("scores unknown categories as zero", () => {
    expect(scoreRelevance({ title: "anything", summary: "everything" }, "other")).toBe(0);
  });
});

describe("routeFinding", () => {
  it("routes vulnerabilities to Guardian, OMNI, and Jackboy at or above threshold", () => {
    expect(routeFinding("vulnerability", 40, 40)).toEqual(["guardian", "omni", "jackboy"]);
  });

  it("does not alert below the owner threshold", () => {
    expect(routeFinding("vulnerability", 39, 40)).toEqual([]);
  });

  it("routes research to Sabrina and OMNI", () => {
    expect(routeFinding("research", 80, 40)).toEqual(["sabrina", "omni"]);
  });
});

describe("filterSources", () => {
  const controls = {
    alertThreshold: 40,
    coverage: ["vulnerability", "ai-model", "development", "research"],
    blockedSources: ["dev"],
  };

  it("drops inactive, blocked, and out-of-coverage sources", () => {
    const active = filterSources(sources, controls);
    expect(active.map((s) => s.id)).toEqual(["cisa", "openai"]);
  });

  it("honors the coverage allowlist", () => {
    const only = filterSources(sources, {
      ...controls,
      coverage: ["research"],
      blockedSources: [],
    });
    expect(only).toEqual([]);
  });

  it("bounds the source count", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      name: `S${i}`,
      url: `https://x.example/${i}`,
      kind: "rss",
      category: "ai-model",
      active: true,
    }));
    expect(filterSources(many, { ...controls, blockedSources: [] })).toHaveLength(5);
  });

  it("rotates the window so every source is covered across runs", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      name: `S${i}`,
      url: `https://x.example/${i}`,
      kind: "rss",
      category: "ai-model",
      active: true,
    }));
    const seen = new Set<string>();
    for (let rotation = 0; rotation < 8; rotation++) {
      for (const s of filterSources(many, { ...controls, blockedSources: [] }, 5, rotation))
        seen.add(s.id);
    }
    expect(seen.size).toBe(8);
  });
});

describe("assignTopic", () => {
  it("maps Mars content to the mars topic", () => {
    expect(assignTopic({ title: "New Mars rover results", summary: "" }, "space")).toBe("mars");
  });

  it("falls back to the category when no subtopic matches", () => {
    expect(assignTopic({ title: "General update", summary: "" }, "biology")).toBe("biology");
  });
});

describe("extractEntities", () => {
  it("extracts CVE identifiers and capitalized names, bounded and stopword-filtered", () => {
    const entities = extractEntities(
      "CVE-2026-12345 affects James Webb Telescope and Mars Observer, says The Agency",
    );
    expect(entities).toContain("CVE-2026-12345");
    expect(entities).toContain("James Webb Telescope");
    expect(entities.some((e) => e.startsWith("The"))).toBe(false);
    expect(entities.length).toBeLessThanOrEqual(8);
  });
});

describe("classifyEvidence", () => {
  it("marks arXiv preprints as preliminary", () => {
    expect(
      classifyEvidence(
        { title: "We present a result", summary: "" },
        { category: "papers", id: "arxiv-astro-ph" },
      ),
    ).toEqual({ evidenceClass: "preliminary", strength: 40 });
  });

  it("marks speculative language as speculation even from official sources", () => {
    expect(
      classifyEvidence(
        { title: "Scientists speculate about future", summary: "" },
        { category: "space", id: "nasa-breaking" },
      ).evidenceClass,
    ).toBe("speculation");
  });

  it("marks official government sources as established with high strength", () => {
    expect(
      classifyEvidence(
        { title: "Magnitude 6.1 earthquake recorded", summary: "" },
        { category: "government-data", id: "usgs-significant-quakes" },
      ),
    ).toEqual({ evidenceClass: "established", strength: 80 });
  });

  it("classifies astrology as belief, never as a scientific finding", () => {
    expect(
      classifyEvidence(
        { title: "Mercury retrograde forecast", summary: "" },
        { category: "astrology", id: "some-astrology-feed" },
      ),
    ).toEqual({ evidenceClass: "belief", strength: 15 });
  });

  it("classifies religion coverage as belief even from official-sounding sources", () => {
    expect(
      classifyEvidence(
        { title: "Church announces new temple", summary: "" },
        { category: "religion", id: "nasa-breaking" },
      ).evidenceClass,
    ).toBe("belief");
  });
});

describe("expanded disciplines", () => {
  it("scores linguistics content", () => {
    expect(
      scoreRelevance(
        { title: "Endangered language grammar documented", summary: "" },
        "linguistics",
      ),
    ).toBeGreaterThan(0);
  });

  it("scores archaeology content", () => {
    expect(
      scoreRelevance(
        { title: "Ancient Roman tomb excavated in Egypt", summary: "" },
        "archaeology",
      ),
    ).toBeGreaterThan(0);
  });

  it("routes emerging tech to Jackboy, OMNI and Sabrina", () => {
    expect(routeFinding("emerging-tech", 60, 40)).toEqual(["jackboy", "omni", "sabrina"]);
  });

  it("routes belief-tradition categories to Sabrina only", () => {
    expect(routeFinding("astrology", 60, 40)).toEqual(["sabrina"]);
    expect(routeFinding("religion", 60, 40)).toEqual(["sabrina"]);
  });
});

describe("planAlertEvents", () => {
  const subs = [
    { agent: "guardian", min_relevance: 30, alerts_enabled: true },
    { agent: "omni", min_relevance: 40, alerts_enabled: true },
    { agent: "sabrina", min_relevance: 40, alerts_enabled: false },
  ];

  it("creates one event per finding per subscribed agent above its floor", () => {
    const events = planAlertEvents(
      [{ id: "f1", relevance: 50, routed_to: ["guardian", "omni", "sabrina"] }],
      subs,
    );
    expect(events).toEqual([
      { finding_id: "f1", agent: "guardian", relevance: 50 },
      { finding_id: "f1", agent: "omni", relevance: 50 },
    ]);
  });

  it("skips agents below their relevance floor and unrouted agents", () => {
    const events = planAlertEvents(
      [{ id: "f1", relevance: 35, routed_to: ["guardian", "omni"] }],
      subs,
    );
    expect(events).toEqual([{ finding_id: "f1", agent: "guardian", relevance: 35 }]);
  });

  it("bounds events per run", () => {
    const findings = Array.from({ length: 30 }, (_, i) => ({
      id: `f${i}`,
      relevance: 90,
      routed_to: ["guardian", "omni"],
    }));
    expect(planAlertEvents(findings, subs)).toHaveLength(50);
  });
});
