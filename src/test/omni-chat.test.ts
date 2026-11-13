import { describe, expect, it } from "vitest";
import {
  chatConnections,
  chatModels,
  contextFromRuns,
  handoffAgent,
  handoffDraft,
  providerState,
  savedTurns,
  terminalSummary,
  type ChatStatus,
} from "@/lib/omni-chat";
import { omniAgentInput, type OmniAgentRun } from "@/lib/omni-agent";
import { canSendTo } from "@/lib/omni-voice";

const run = (id: string, at: string, patch: Partial<OmniAgentRun> = {}): OmniAgentRun => ({
  id,
  project_id: "p",
  status: "completed",
  message: `ask ${id}`,
  result: `answer ${id}`,
  error_message: null,
  error_status: null,
  model: "openai/gpt-6-astra",
  input_tokens: 1,
  output_tokens: 1,
  total_tokens: 2,
  gateway_run_id: null,
  created_at: at,
  finished_at: at,
  ...patch,
});
const status: ChatStatus = {
  provider: "Lovable AI",
  model: "openai/gpt-6-astra",
  providerConfigured: true,
  blockKnown: true,
  blocked: null,
};

describe("earlier-turn context", () => {
  const runs = [
    run("c", "2026-11-03"),
    run("a", "2026-11-01"),
    run("x", "2026-11-04", { status: "failed" }),
    run("b", "2026-11-02"),
    run("now", "2026-11-05"),
  ];
  it("sends nothing unless the owner picks a number", () => {
    expect(contextFromRuns(runs, "now", 0)).toEqual({ ids: [], messages: [] });
  });
  it("uses only the newest completed turns, oldest first, never the current request", () => {
    const ctx = contextFromRuns(runs, "now", 2);
    expect(ctx.ids).toEqual(["b", "c"]);
    expect(ctx.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(ctx.messages[0]?.content).toBe("ask b");
  });
  it("caps at six turns and skips turns the safety check rejects", () => {
    const many = Array.from({ length: 10 }, (_, i) => run(`r${i}`, `2026-10-${10 + i}`));
    expect(contextFromRuns(many, "", 99).ids).toHaveLength(6);
    expect(contextFromRuns(runs, "now", 6, (t) => !t.includes("ask b")).ids).toEqual(["a", "c"]);
  });
  it("server input refuses more than six context turns and defaults to none", () => {
    const base = {
      projectId: "cc276f60-142b-4d5d-83cf-b83fb53d5562",
      message: "hello there",
      consent: true,
      requestId: "fa4b071c-8c52-4b78-98eb-6321af2823dd",
    };
    expect(omniAgentInput.parse(base).contextTurns).toBe(0);
    expect(omniAgentInput.safeParse({ ...base, contextTurns: 7 }).success).toBe(false);
  });
});

describe("saved history in chat", () => {
  it("orders saved runs oldest first, labels them OMNI and hides ones shown live", () => {
    const turns = savedTurns([run("b", "2026-11-02"), run("a", "2026-11-01")], new Set(["b"]));
    expect(turns.map((t) => t.key)).toEqual(["a:u", "a:a"]);
    expect(turns.every((t) => t.agent === "omni" && t.saved)).toBe(true);
    expect(turns[1]?.request).toBe("ask a");
  });
});

describe("provider and model state", () => {
  it("fails closed when status is unread, missing or blocked", () => {
    expect(providerState(undefined, false)).toBe("unknown");
    expect(providerState(status, true)).toBe("unknown");
    expect(providerState({ ...status, providerConfigured: false }, false)).toBe("missing");
    expect(providerState({ ...status, blockKnown: false }, false)).toBe("blocked");
    expect(providerState({ ...status, blocked: { status: 402, message: "x" } }, false)).toBe(
      "blocked",
    );
    expect(providerState(status, false)).toBe("ready");
  });
  it("offers only the configured model", () => {
    expect(chatModels(status)).toEqual([
      { id: "openai/gpt-6-astra", label: "Lovable AI · openai/gpt-6-astra" },
    ]);
    expect(chatModels({ ...status, providerConfigured: false })).toEqual([]);
    expect(chatModels(undefined)).toEqual([]);
  });
  it("blocks sending unless the provider is ready", () => {
    const gate = { aiApproved: true, paused: false, hasProject: true, consent: true };
    expect(canSendTo("omni", { ...gate, provider: "unknown" }).ok).toBe(false);
    expect(canSendTo("omni", { ...gate, provider: "blocked" }).ok).toBe(false);
    expect(canSendTo("omni", { ...gate, provider: "missing" }).ok).toBe(false);
    expect(canSendTo("omni", { ...gate, provider: "ready" }).ok).toBe(true);
  });
});

describe("connection rows", () => {
  const base = { status, aiApproved: true, paused: false, dictation: true, voice: true };
  it("never shows the terminal or Jackboy as connected from this chat", () => {
    const rows = chatConnections({ ...base, provider: "ready" });
    expect(rows.find((r) => r.id === "terminal")?.state).toBe("check");
    expect(rows.find((r) => r.id === "jackboy")?.state).toBe("not_connected");
    expect(rows.find((r) => r.id === "text-agent")?.state).toBe("ready");
  });
  it("shows the text agent blocked when paused or unapproved", () => {
    expect(chatConnections({ ...base, provider: "ready", paused: true })[0]?.state).toBe("blocked");
    expect(chatConnections({ ...base, provider: "ready", aiApproved: false })[0]?.state).toBe(
      "blocked",
    );
    expect(chatConnections({ ...base, provider: "unknown" })[0]?.state).toBe("unknown");
  });
});

describe("terminal summary", () => {
  const snap = {
    gate: { open: false, blockers: ["Cloud sandbox settings are missing or invalid."] },
    killSwitchEnabled: true,
    emergencyStopReleased: true,
    windows: [],
    spend: { task: 0, day: 125, total: 400 },
    agents: [
      { display_name: "Jackboy", budget_day_cents: 0, budget_total_cents: 0, status: "enrolled" },
    ],
  };
  it("reports not connected with blockers, autonomy off and spending limits", () => {
    const s = terminalSummary(snap);
    expect(s.connected).toBe(false);
    expect(s.lines).toContain("Terminal relay: not connected.");
    expect(s.lines).toContain("· Cloud sandbox settings are missing or invalid.");
    expect(s.lines).toContain("Autonomous mode: off.");
    expect(s.lines).toContain("Spent: $1.25 today, $4.00 total.");
    expect(s.lines).toContain("Jackboy: limit $0.00/day, $0.00 total (enrolled).");
  });
  it("is connected only with an open gate and a released Emergency Stop", () => {
    expect(terminalSummary({ ...snap, gate: { open: true, blockers: [] } }).connected).toBe(true);
    expect(
      terminalSummary({ ...snap, gate: { open: true, blockers: [] }, emergencyStopReleased: false })
        .connected,
    ).toBe(false);
  });
});

describe("handoff", () => {
  it("CODE tasks always go to Jackboy", () => {
    expect(handoffAgent("code.test", "razul")).toBe("jackboy");
    expect(handoffAgent("agent.handoff", "razul")).toBe("razul");
  });
  it("draft fits the terminal task limits", () => {
    const d = handoffDraft({ projectName: "x".repeat(300), request: "do it", reply: "y".repeat(9000) });
    expect(d.project.length).toBe(120);
    expect(d.instructions.length).toBeLessThanOrEqual(4000);
    expect(d.instructions).toContain("suggestion only, not tested");
  });
});
