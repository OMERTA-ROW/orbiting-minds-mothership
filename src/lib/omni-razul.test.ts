import { describe, expect, it } from "vitest";
import {
  RazulRejection,
  appendEvent,
  applyRetention,
  buildGraph,
  emptyRazulStore,
  enrollProject,
  ingestFinding,
  loadRazulStore,
  redactEvent,
  registerSource,
  retrieveEvents,
  saveRazulStore,
  verifyChain,
  type AccessGrant,
  type ArchiveEvent,
  type ProjectEnrollment,
} from "./omni-razul";

const NOW = "2026-10-31T12:00:00.000Z";

function project(overrides: Record<string, unknown> = {}): ProjectEnrollment {
  return enrollProject(
    {
      projectName: "Honeycomb Terminal",
      tags: ["mcp", "agent"],
      dependencies: ["TanStack Start"],
      retentionDays: 90,
      ownerConsent: true,
      ...overrides,
    },
    "proj-1",
    NOW,
  );
}

function eventInput(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "proj-1",
    actor: "Jackboy",
    kind: "test-result",
    summary: "Sandbox test run passed 42 checks",
    provenance: "Owner-entered CLI run note",
    ...overrides,
  };
}

function grant(consumer: AccessGrant["consumer"]): AccessGrant {
  return { projectId: "proj-1", consumer, grantedAt: NOW };
}

describe("enrollment", () => {
  it("requires explicit owner consent", () => {
    expect(() =>
      enrollProject(
        {
          projectName: "X Project",
          tags: ["ai"],
          dependencies: [],
          retentionDays: 30,
          ownerConsent: false,
        },
        "p",
        NOW,
      ),
    ).toThrow();
  });
});

describe("append-only archive", () => {
  it("refuses events for unenrolled projects", () => {
    expect(() => appendEvent([], [], eventInput(), "e1", NOW)).toThrow(RazulRejection);
  });

  it("rejects secret-looking content", () => {
    expect(() =>
      appendEvent(
        [],
        [project()],
        eventInput({ summary: "token: sk-abcdef1234567890" }),
        "e1",
        NOW,
      ),
    ).toThrow(/Secret-looking/);
  });

  it("chains events and detects tampering", () => {
    const e1 = appendEvent([], [project()], eventInput(), "e1", NOW);
    const e2 = appendEvent(
      [e1],
      [project()],
      eventInput({ summary: "Second event recorded" }),
      "e2",
      NOW,
    );
    expect(e2.prevHash).toBe(e1.hash);
    expect(verifyChain([e1, e2]).ok).toBe(true);
    const tampered: ArchiveEvent = { ...e1, summary: "altered after the fact" };
    const result = verifyChain([tampered, e2]);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe("e1");
  });

  it("redaction clears content with a recorded reason and keeps the chain linked", () => {
    const e1 = appendEvent([], [project()], eventInput(), "e1", NOW);
    const e2 = appendEvent(
      [e1],
      [project()],
      eventInput({ summary: "Second event recorded" }),
      "e2",
      NOW,
    );
    const redacted = redactEvent([e1, e2], "e1", "Owner privacy request");
    const first = redacted[0]!;
    expect(first.redacted).toBe(true);
    expect(first.summary).toBe("[redacted]");
    expect(first.redactionReason).toBe("Owner privacy request");
    expect(verifyChain(redacted).ok).toBe(true);
    expect(() => redactEvent([e1], "e1", "no")).toThrow(RazulRejection);
  });

  it("retention tombstones expired content per project window", () => {
    const e1 = appendEvent([], [project()], eventInput(), "e1", NOW);
    const later = new Date(new Date(NOW).getTime() + 91 * 86_400_000);
    const aged = applyRetention([e1], [project()], later);
    expect(aged[0]!.tombstoned).toBe(true);
    expect(aged[0]!.summary).toBe("[expired]");
    const fresh = applyRetention([e1], [project()], new Date(NOW));
    expect(fresh[0]!.tombstoned).toBe(false);
  });
});

describe("access segregation and retrieval", () => {
  it("denies consumers without a per-project grant", () => {
    const e1 = appendEvent([], [project()], eventInput(), "e1", NOW);
    const denied = retrieveEvents([e1], [], { consumer: "sabrina", projectId: "proj-1" });
    expect(denied.allowed).toBe(false);
    expect(denied.denial).toMatch(/No RAZUL read grant/);
  });

  it("retrieves with kind and text filters for granted consumers", () => {
    const e1 = appendEvent([], [project()], eventInput(), "e1", NOW);
    const e2 = appendEvent(
      [e1],
      [project()],
      eventInput({ kind: "incident", summary: "Gateway timeout observed" }),
      "e2",
      NOW,
    );
    const all = retrieveEvents([e1, e2], [grant("jackboy")], {
      consumer: "jackboy",
      projectId: "proj-1",
    });
    expect(all.events).toHaveLength(2);
    const incidents = retrieveEvents([e1, e2], [grant("jackboy")], {
      consumer: "jackboy",
      projectId: "proj-1",
      kind: "incident",
    });
    expect(incidents.events).toHaveLength(1);
    const search = retrieveEvents([e1, e2], [grant("guardian")], {
      consumer: "guardian",
      projectId: "proj-1",
      text: "timeout",
    });
    expect(search.events[0]?.id).toBe("e2");
  });
});

describe("knowledge graph", () => {
  it("builds project, agent and dependency nodes with relations", () => {
    const e1 = appendEvent([], [project()], eventInput(), "e1", NOW);
    const graph = buildGraph([project()], [e1]);
    expect(graph.nodes.some((n) => n.type === "project" && n.label === "Honeycomb Terminal")).toBe(
      true,
    );
    expect(graph.nodes.some((n) => n.type === "agent" && n.label === "Jackboy")).toBe(true);
    expect(graph.nodes.some((n) => n.type === "dependency" && n.label === "TanStack Start")).toBe(
      true,
    );
    expect(graph.edges.some((e) => e.relation === "depends-on")).toBe(true);
    expect(graph.edges.some((e) => e.relation === "test-result")).toBe(true);
  });
});

describe("public intelligence", () => {
  const sourceInput = {
    name: "Example AI Lab Blog",
    url: "https://example.com/feed.xml",
    kind: "rss",
    termsNote: "Public RSS feed; attribution retained; rate-limited polling.",
    respectsRobots: true,
    ownerApproved: true,
  };
  const findingInput = {
    sourceId: "src-1",
    title: "New agent MCP tooling released",
    url: "https://example.com/post-1",
    summary: "A coding tool for agent workflows using MCP was announced.",
    category: "coding-tool",
  };

  it("requires robots/terms attestation and owner approval for sources", () => {
    expect(() => registerSource({ ...sourceInput, respectsRobots: false }, "s", NOW)).toThrow();
    expect(() => registerSource({ ...sourceInput, ownerApproved: false }, "s", NOW)).toThrow();
    expect(() =>
      registerSource({ ...sourceInput, url: "http://insecure.example.com/f" }, "s", NOW),
    ).toThrow();
  });

  it("ingests, dedupes by URL and corroborates across distinct sources", () => {
    const source = registerSource(sourceInput, "src-1", NOW);
    const first = ingestFinding([], [source], [project()], [], findingInput, "f1", NOW);
    expect(first.finding?.corroborations).toBe(0);
    const sameSource = ingestFinding(
      [first.finding!],
      [source],
      [project()],
      [],
      findingInput,
      "f2",
      NOW,
    );
    expect(sameSource.duplicate).toBe(true);
    const source2 = registerSource(
      { ...sourceInput, name: "Second Source", url: "https://other.example.com/feed" },
      "src-2",
      NOW,
    );
    const corroborated = ingestFinding(
      [first.finding!],
      [source, source2],
      [project()],
      [],
      { ...findingInput, sourceId: "src-2" },
      "f3",
      NOW,
    );
    expect(corroborated.updated?.corroborations).toBe(1);
    expect(corroborated.updated?.relevance).toBeGreaterThan(first.finding!.relevance);
  });

  it("routs findings only to consumers holding grants on tag-matched projects", () => {
    const source = registerSource(sourceInput, "src-1", NOW);
    const noGrants = ingestFinding([], [source], [project()], [], findingInput, "f1", NOW);
    expect(noGrants.finding?.routedTo).toEqual([]);
    expect(noGrants.finding?.relevance).toBeGreaterThan(0);
    const withGrant = ingestFinding(
      [],
      [source],
      [project()],
      [grant("jackboy")],
      findingInput,
      "f1",
      NOW,
    );
    expect(withGrant.finding?.routedTo).toContain("jackboy");
    expect(withGrant.finding?.routedTo).not.toContain("omni");
  });

  it("rejects findings from unknown sources and secret-looking content", () => {
    expect(ingestFinding([], [], [project()], [], findingInput, "f1", NOW).error).toMatch(
      /Unknown source/,
    );
    const source = registerSource(sourceInput, "src-1", NOW);
    const bad = ingestFinding(
      [],
      [source],
      [project()],
      [],
      { ...findingInput, summary: "leaked api_key: abcdef123456" },
      "f1",
      NOW,
    );
    expect(bad.error).toMatch(/Secret-looking/);
  });
});

describe("store", () => {
  it("round-trips and tolerates corrupt data", () => {
    const store = { ...emptyRazulStore, enrollments: [project()] };
    expect(loadRazulStore(saveRazulStore(store)).enrollments).toHaveLength(1);
    expect(loadRazulStore("junk")).toEqual(emptyRazulStore);
    expect(loadRazulStore(null)).toEqual(emptyRazulStore);
  });
});
