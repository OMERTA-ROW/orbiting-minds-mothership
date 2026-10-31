import { describe, expect, it } from "vitest";
import {
  autonomyDecision,
  emptyAgentRegistry,
  fileReport,
  loadAgentRegistry,
  pauseAgent,
  registerAgent,
  resumeAgent,
  agentRegistryReadiness,
  type RegisteredAgent,
} from "@/lib/omni-agents";

const now = "2026-10-31T13:00:00.000Z";
const aid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const pid = "11111111-1111-4111-8111-111111111111";

function angel(): RegisteredAgent {
  return registerAgent(
    {
      name: "AngelTech Researcher",
      category: "angeltech",
      mission: "Constructive research, creation and quality review for opted-in projects.",
      capabilities: ["autonomous-discovery", "drafting", "quality-review"],
      projectIds: [pid],
      ownerConfirmed: true,
    },
    aid,
    now,
  );
}

describe("agent registration", () => {
  it("requires owner confirmation, a category and at least one opted-in project", () => {
    const base = {
      name: "DemonTech Probe",
      category: "demontech",
      mission: "Authorized defensive security and risk testing only.",
      capabilities: ["security-review"],
      projectIds: [pid],
    };
    expect(() => registerAgent({ ...base, ownerConfirmed: false }, aid, now)).toThrow();
    expect(() =>
      registerAgent({ ...base, ownerConfirmed: true, projectIds: [] }, aid, now),
    ).toThrow();
  });

  it("registers as a declaration that is never live", () => {
    const a = angel();
    expect(a.live).toBe(false);
    expect(a.paused).toBe(false);
    expect(a.history[0]).toContain("not live");
  });
});

describe("owner pause control", () => {
  it("pause is immediate and blocks reports and autonomy", () => {
    const paused = pauseAgent(angel(), now);
    expect(paused.paused).toBe(true);
    expect(() =>
      fileReport(
        { agentId: aid, kind: "task", summary: "Draft a research brief for review." },
        [paused],
        bid,
        now,
      ),
    ).toThrow(/paused/);
    expect(autonomyDecision(paused, "drafting").allowed).toBe(false);
    const resumed = resumeAgent(paused, now);
    expect(resumed.paused).toBe(false);
  });
});

describe("task/result reporting and coordination", () => {
  it("records reports without executing anything", () => {
    const r = fileReport(
      { agentId: aid, kind: "result", summary: "Draft brief completed for owner review." },
      [angel()],
      bid,
      now,
    );
    expect(r.executed).toBe(false);
  });

  it("supports agent-to-agent coordination between registered agents only", () => {
    const demon = registerAgent(
      {
        name: "DemonTech Auditor",
        category: "demontech",
        mission: "Authorized defensive security and risk testing only.",
        capabilities: ["security-review"],
        projectIds: [pid],
        ownerConfirmed: true,
      },
      bid,
      now,
    );
    const ok = fileReport(
      {
        agentId: aid,
        kind: "coordination",
        summary: "Please review the draft patch for risk.",
        toAgentId: bid,
      },
      [angel(), demon],
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      now,
    );
    expect(ok.toAgentId).toBe(bid);
    expect(() =>
      fileReport(
        {
          agentId: aid,
          kind: "coordination",
          summary: "Coordinate with an unknown agent here.",
          toAgentId: pid,
        },
        [angel()],
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        now,
      ),
    ).toThrow(/not registered/);
  });

  it("rejects reports from unregistered agents", () => {
    expect(() =>
      fileReport(
        { agentId: bid, kind: "task", summary: "Unregistered agent reporting in." },
        [angel()],
        bid,
        now,
      ),
    ).toThrow(/not registered/);
  });
});

describe("autonomy boundaries", () => {
  it("declared capabilities are allowed in principle but still need a runner", () => {
    const d = autonomyDecision(angel(), "drafting");
    expect(d.allowed).toBe(true);
    expect(d.reason).toContain("runner");
  });

  it("undeclared capabilities are denied", () => {
    expect(autonomyDecision(angel(), "security-review").allowed).toBe(false);
  });

  it("approval boundaries always require owner/human approval", () => {
    for (const b of ["irreversible", "high-impact", "private-data", "production"] as const) {
      const d = autonomyDecision(angel(), "drafting", b);
      expect(d.allowed).toBe(false);
      expect(d.reason).toContain(b);
    }
  });
});

describe("readiness and store", () => {
  it("reports blocked with concrete prerequisites", () => {
    const r = agentRegistryReadiness();
    expect(r.state).toBe("Blocked");
    expect(r.blockers.length).toBeGreaterThanOrEqual(4);
  });

  it("loads an empty registry from missing or corrupt data", () => {
    expect(loadAgentRegistry(null)).toEqual(emptyAgentRegistry);
    expect(loadAgentRegistry("{bad json")).toEqual(emptyAgentRegistry);
  });
});
