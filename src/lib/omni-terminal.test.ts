import { describe, expect, it } from "vitest";
import { normalizeRows } from "./activation-approvals";
import {
  EXECUTOR_AVAILABLE,
  autonomyBlockers,
  capabilities,
  linkEvidence,
  respond,
  stopReleased,
  stopState,
  taskInput,
  type Snapshot,
} from "./omni-terminal";
import { probeRailway } from "./omni-terminal-probe.server";

const NOW = Date.parse("2026-11-07T16:00:00Z");
const allSettings = [
  "OMNI_LINK_CLIENT_ID",
  "OMNI_LINK_PROJECT_ID",
  "OMNI_LINK_OWNER_ID",
  "OMNI_LINK_APPROVAL_ID",
  "OMNI_LINK_BOOTSTRAP_KEY",
  "OMNI_LINK_HMAC_SECRET",
  "JACKBOY_LINK_ORIGIN",
  "JACKBOY_LINK_MOTHERSHIP_OWNER_ID",
].map((name) => ({ name, present: true }));

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    now: NOW,
    mfaAgeSeconds: 60,
    emergencyStop: { engaged: true, known: true, changedAt: null, reason: "" },
    settings: allSettings,
    expirySet: false,
    switches: { linkEnabled: false, selfTestEnabled: false },
    ownerIdMatches: "match",
    originValid: true,
    approvals: normalizeRows([]),
    audit: [],
    textAgent: {
      providerConfigured: true,
      aiApproved: false,
      paused: false,
      completedRuns: 0,
      lastRunAt: null,
      lastRunStatus: null,
    },
    razul: { lastRunStatus: "partial", lastRunAt: "2026-11-07T12:00:00Z", paused: false },
    tasks: [],
    log: [],
    dock: { paired: 0, pending: 0, known: true },
    workspaceEnabled: false,
    ...over,
  };
}
const allApproved = normalizeRows(
  Array.from({ length: 10 }, (_, i) => ({
    step: i + 1,
    status: "approved",
    approval_expires_at: i + 1 === 7 ? new Date(NOW + 3600_000).toISOString() : null,
  })),
);

describe("Emergency Stop fails closed", () => {
  it("treats a missing row as engaged", () => {
    expect(stopState(null, false).engaged).toBe(true);
    expect(stopReleased(null, false)).toBe(false);
  });
  it("treats an unreadable row as engaged", () => {
    expect(stopState({ emergency_stop: false, changed_at: "x", reason: "" }, true).engaged).toBe(
      true,
    );
    expect(stopReleased({ emergency_stop: false }, true)).toBe(false);
  });
  it("is released only when the stored value is false", () => {
    expect(stopReleased({ emergency_stop: false }, false)).toBe(true);
    expect(stopReleased({ emergency_stop: true }, false)).toBe(false);
  });
});

describe("readiness is separate from authorization", () => {
  it("all link settings present is configured but not authorized", () => {
    const link = capabilities(snap()).find((c) => c.id === "link")!;
    expect(link.readiness).toBe("ready");
    expect(link.authorized).toBe(false);
    expect(link.state).toBe("Off");
  });
  it("approvals and switch still need the Emergency Stop released", () => {
    const engaged = snap({
      approvals: allApproved,
      switches: { linkEnabled: true, selfTestEnabled: false },
    });
    expect(capabilities(engaged).find((c) => c.id === "link")!.authorized).toBe(false);
    const released = snap({
      approvals: allApproved,
      switches: { linkEnabled: true, selfTestEnabled: false },
      emergencyStop: { engaged: false, known: true, changedAt: null, reason: "ok" },
    });
    expect(capabilities(released).find((c) => c.id === "link")!.authorized).toBe(true);
  });
  it("an owner ID that does not match keeps the link not ready", () => {
    expect(
      capabilities(snap({ ownerIdMatches: "mismatch" })).find((c) => c.id === "link")!.readiness,
    ).toBe("partial");
  });
  it("never shows a verified connection without a recorded handshake", () => {
    const link = capabilities(snap()).find((c) => c.id === "link")!;
    expect(link.evidence).toMatch(/not verified/i);
    const failed = linkEvidence([
      {
        id: "1",
        action: "connecting",
        record_type: "jackboy_link",
        record_id: "a",
        occurred_at: "2026-11-07T10:00:00Z",
      },
    ]);
    expect(failed.lastConnectedAt).toBeNull();
    expect(failed.lastAttemptFailed).toBe(true);
  });
});

describe("CODE and autonomous mode stay off", () => {
  it("CODE is never authorized, even with all ten approvals", () => {
    const code = capabilities(snap({ approvals: allApproved })).find((c) => c.id === "code")!;
    expect(code.authorized).toBe(false);
    expect(code.state).toBe("Off");
  });
  it("autonomy cannot be authorized while no executor exists", () => {
    expect(EXECUTOR_AVAILABLE).toBe(false);
    const s = snap({
      approvals: allApproved,
      switches: { linkEnabled: true, selfTestEnabled: true },
      emergencyStop: { engaged: false, known: true, changedAt: null, reason: "ok" },
    });
    expect(capabilities(s).find((c) => c.id === "autonomy")!.authorized).toBe(false);
    expect(autonomyBlockers(s)).toContain("No executor or host companion is connected.");
  });
  it("'autonomy on' is refused", () => {
    expect(respond("autonomy on", snap()).outcome).toBe("blocked");
  });
});

describe("terminal commands", () => {
  it("refuses shell commands", () => {
    for (const c of ["rm -rf /", "curl https://x", "git push", "ls; whoami", "railway up"])
      expect(respond(c, snap()).outcome).toBe("denied");
  });
  it("blocks execution words", () => {
    for (const c of ["deploy", "run tests", "publish", "code generate login"])
      expect(respond(c, snap()).outcome).toBe("blocked");
  });
  it("refuses anything that looks like a key", () => {
    expect(respond("sk-proj-abcdefghijklmnopqrstuv", snap()).outcome).toBe("denied");
  });
  it("stop and ping are the only commands with effects", () => {
    expect(respond("stop", snap()).effect).toBe("engage_stop");
    expect(respond("ping", snap()).effect).toBe("probe");
    expect(respond("status", snap()).effect).toBeUndefined();
  });
});

describe("held tasks", () => {
  const base = { id: crypto.randomUUID(), project: "Mothership", instructions: "Add a unit test" };
  it("CODE tasks must go to Jackboy", () => {
    expect(taskInput.safeParse({ ...base, kind: "code.test", agent: "jax" }).success).toBe(false);
    expect(taskInput.safeParse({ ...base, kind: "code.test", agent: "jackboy" }).success).toBe(
      true,
    );
  });
  it("handoffs can go to other agents", () => {
    expect(taskInput.safeParse({ ...base, kind: "agent.handoff", agent: "razul" }).success).toBe(
      true,
    );
  });
  it("rejects secret-looking instructions and bad repositories", () => {
    expect(
      taskInput.safeParse({
        ...base,
        kind: "code.edit",
        agent: "jackboy",
        instructions: "use eyJhbGciOiJIUzI1NiJ9abc",
      }).success,
    ).toBe(false);
    expect(
      taskInput.safeParse({
        ...base,
        kind: "code.edit",
        agent: "jackboy",
        repository: "https://github.com/a/b",
      }).success,
    ).toBe(false);
  });
});

describe("Railway reachability check", () => {
  it("does nothing without a public HTTPS address", async () => {
    let called = false;
    const fetch = async () => ((called = true), new Response(""));
    expect((await probeRailway(undefined, { fetch })).state).toBe("not_configured");
    expect((await probeRailway("http://example.com", { fetch })).state).toBe("invalid_origin");
    expect((await probeRailway("https://10.0.0.1", { fetch })).state).toBe("invalid_origin");
    expect(called).toBe(false);
  });
  it("sends no credentials and refuses redirects", async () => {
    let init: RequestInit | undefined;
    let url = "";
    const fetch = async (u: string, i: RequestInit) => (
      (url = u),
      (init = i),
      new Response("ok", { status: 200 })
    );
    const r = await probeRailway("https://jackboy.example.com", { fetch });
    expect(r.state).toBe("reachable");
    expect(url).toBe("https://jackboy.example.com/");
    expect(init?.redirect).toBe("manual");
    expect(init?.credentials).toBe("omit");
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    const redirect = await probeRailway("https://jackboy.example.com", {
      fetch: async () => new Response(null, { status: 302 }),
    });
    expect(redirect.state).toBe("redirect");
  });
  it("reports a timeout", async () => {
    const fetch = (_u: string, i: RequestInit) =>
      new Promise<Response>((_, reject) =>
        i.signal?.addEventListener("abort", () => reject(new Error("abort"))),
      );
    expect(
      (await probeRailway("https://jackboy.example.com", { fetch, timeoutMs: 10 })).state,
    ).toBe("timeout");
  });
});
