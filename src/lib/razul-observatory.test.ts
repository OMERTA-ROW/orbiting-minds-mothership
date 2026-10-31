import { describe, expect, it } from "vitest";
import {
  filterSources,
  routeFinding,
  scoreRelevance,
  type ObservatorySource,
} from "./razul-observatory";

const sources: ObservatorySource[] = [
  { id: "cisa", name: "CISA", url: "https://a.example/feed", kind: "rss", category: "vulnerability", active: true },
  { id: "openai", name: "OpenAI", url: "https://b.example/feed", kind: "rss", category: "ai-model", active: true },
  { id: "arxiv", name: "arXiv", url: "https://c.example/feed", kind: "rss", category: "research", active: false },
  { id: "dev", name: "Dev", url: "https://d.example/feed", kind: "rss", category: "development", active: true },
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
    const only = filterSources(sources, { ...controls, coverage: ["research"], blockedSources: [] });
    expect(only).toEqual([]);
  });

  it("bounds the source count", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`, name: `S${i}`, url: `https://x.example/${i}`, kind: "rss",
      category: "ai-model", active: true,
    }));
    expect(filterSources(many, { ...controls, blockedSources: [] })).toHaveLength(5);
  });
});
