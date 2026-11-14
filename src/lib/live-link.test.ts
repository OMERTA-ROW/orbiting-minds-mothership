import { describe, expect, it } from "vitest";
import { normalizeRows } from "./activation-approvals";
import { classifyLiveLinkError, liveLinkStatus, LIVE_LINK_FRESH_MS, systemStates } from "./live-link";
import { safetyView, type SafetyRow } from "./jackboy-safety";

const NOW = Date.parse("2026-11-14T01:00:00Z");
const rows = (approvedThrough: number, step7Ends = "2026-11-14T10:20:00Z") =>
  normalizeRows(
    Array.from({ length: 10 }, (_, i) => ({
      step: i + 1,
      status: i + 1 <= approvedThrough ? "approved" : "pending",
      decided_at: i + 1 <= approvedThrough ? "2026-11-14T00:51:00Z" : null,
      approval_expires_at: i + 1 === 7 ? step7Ends : null,
    })),
  );
const gates = (fail?: string) =>
  ["stop", "owner", "link", "window", "identity", "self_test", "deployment"].map((key) => ({
    key,
    label: key,
    ok: key !== fail,
    detail: key === fail ? `${key} is not ready` : "ok",
  }));
const status = (approved: number, extra: Partial<Parameters<typeof liveLinkStatus>[0]> = {}) =>
  liveLinkStatus({
    rows: rows(approved),
    readiness: gates(),
    now: NOW,
    lastConnectedAt: null,
    lastAttemptAt: null,
    ...extra,
  });

describe("Step 9 live link permission", () => {
  it("waits for Step 9 when Steps 1–8 are approved", () => {
    const s = status(8);
    expect(s.state).toBe("awaiting_step9");
    expect(s.canCheck).toBe(false);
  });
  it("allows a connection check only after Step 9 and all Mothership gates", () => {
    expect(status(9).state).toBe("ready_to_check");
    expect(status(9).canCheck).toBe(true);
  });
  it("is blocked by an engaged Emergency Stop even with Step 9 approved", () => {
    const s = status(9, { readiness: gates("stop") });
    expect(s.state).toBe("blocked");
    expect(s.canCheck).toBe(false);
    expect(s.blocker).toContain("stop is not ready");
  });
  it.each(["owner", "link", "window", "identity"])("is blocked when %s fails", (key) => {
    expect(status(9, { readiness: gates(key) }).canCheck).toBe(false);
  });
  it("ignores the self-test switch: a handshake is not a self-test", () => {
    expect(status(9, { readiness: gates("self_test") }).canCheck).toBe(true);
  });
  it("fails closed when readiness could not be read", () => {
    expect(status(9, { readiness: [] }).canCheck).toBe(false);
  });
  it("loses permission when Step 7's window has ended", () => {
    const s = liveLinkStatus({
      rows: rows(9, "2026-11-14T00:59:00Z"),
      readiness: gates(),
      now: NOW,
      lastConnectedAt: null,
      lastAttemptAt: null,
    });
    expect(s.state).toBe("earlier_steps");
    expect(s.canCheck).toBe(false);
  });
  it("shows verified only for a recent completed handshake", () => {
    const recent = new Date(NOW - 60_000).toISOString();
    expect(status(9, { lastConnectedAt: recent, lastAttemptAt: recent }).state).toBe("verified");
    const old = new Date(NOW - LIVE_LINK_FRESH_MS - 1000).toISOString();
    expect(status(9, { lastConnectedAt: old, lastAttemptAt: old }).state).toBe("ready_to_check");
    const later = new Date(NOW - 30_000).toISOString();
    const s = status(9, { lastConnectedAt: recent, lastAttemptAt: later });
    expect(s.lastAttemptFailed).toBe(true);
    expect(s.state).toBe("ready_to_check");
  });
});

describe("separate system states", () => {
  const row = (state: SafetyRow["state"], extra: Partial<SafetyRow> = {}): SafetyRow => ({
    state,
    paused: state === "paused",
    code_stop: state === "engaged",
    code_enabled: true,
    cancellation: null,
    observed_at: new Date(NOW - 10_000).toISOString(),
    expires_at: new Date(NOW + 20_000).toISOString(),
    source: "poll",
    reason: "",
    recorded_at: new Date(NOW - 10_000).toISOString(),
    autonomous_allowed: state === "clear",
    manual_allowed: state !== "paused",
    ...extra,
  });
  const states = (o: Partial<Parameters<typeof systemStates>[0]> = {}) =>
    systemStates({
      linkEffective: true,
      autonomyEffective: true,
      liveLink: status(9),
      safety: safetyView(row("clear"), NOW),
      mothershipStop: false,
      running: { windows: 0, agentJobs: 0, codeJobs: 0 },
      now: NOW,
      ...o,
    });
  it("is not configured before the activations, whatever the approvals say", () => {
    const s = states({ linkEffective: false, autonomyEffective: false });
    expect(s.link.state).toBe("not_configured");
    expect(s.autonomous.state).toBe("not_configured");
    expect(s.code.state).toBe("not_configured");
  });
  it("authorized never reads as running without running records", () => {
    const s = states();
    expect(s.autonomous.state).toBe("configured_blocked");
    expect(s.code.state).toBe("configured_blocked");
    expect(s.autonomous.blockers).toContain("No OMNI executor is connected.");
  });
  it("reports running only from database counts", () => {
    expect(states({ running: { windows: 1, agentJobs: 0, codeJobs: 0 } }).autonomous.state).toBe("running");
    expect(states({ running: { windows: 0, agentJobs: 0, codeJobs: 1 } }).code.state).toBe("running");
  });
  it("keeps the CODE Emergency Stop, Mothership stop and Kill Switch as separate states", () => {
    const s = states({ safety: safetyView(row("engaged"), NOW), mothershipStop: null });
    expect(s.emergencyStop).toEqual({ jackboy: "engaged", mothership: "unknown" });
    expect(s.killSwitch).toBe("off");
    expect(s.autonomous.blockers.join(" ")).toContain("CODE Emergency Stop engaged");
    expect(s.autonomous.blockers.join(" ")).toContain("Mothership Emergency Stop unknown");
    const p = states({ safety: safetyView(row("paused"), NOW) });
    expect(p.killSwitch).toBe("on");
  });
  it("treats stops released but Jackboy not allowing autonomy as blocked", () => {
    const v = safetyView(row("clear", { autonomous_allowed: false, blocked_by: "code_disabled", code_enabled: false }), NOW);
    expect(v.clear).toBe(false);
    expect(v.label).toContain("autonomy blocked by Jackboy");
    const s = states({ safety: v });
    expect(s.code.blockers.join(" ")).toContain("Jackboy CODE setting off");
  });
  it("shows connected only for a recent signed exchange", () => {
    expect(states().link.state).toBe("connected");
    const old = safetyView(row("clear", { recorded_at: new Date(NOW - LIVE_LINK_FRESH_MS - 5000).toISOString() }), NOW);
    expect(states({ safety: old }).link.state).toBe("configured");
  });
});

describe("live link failure classification", () => {
  const http = (status: number, code?: string) => ({ stage: "http", status, code });
  it("treats Jackboy's grant_unavailable (global pause) as a safety denial", () => {
    const c = classifyLiveLinkError(http(403, "grant_unavailable"));
    expect(c.kind).toBe("safety_denial");
    expect(c.message).toMatch(/Kill Switch/);
  });
  it("distinguishes a timeout from a denial", () => {
    expect(classifyLiveLinkError({ stage: "timeout", limitMs: 5000 }).kind).toBe("timeout");
  });
  it("reports signature mismatch as refused", () => {
    expect(classifyLiveLinkError(http(401, "authentication_failed")).kind).toBe("refused");
  });
  it("reports an unready session as invalid reply", () => {
    expect(classifyLiveLinkError(new Error("Jackboy session is not ready or is invalid.")).kind).toBe(
      "invalid_reply",
    );
  });
});
