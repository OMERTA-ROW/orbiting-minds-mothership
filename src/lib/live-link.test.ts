import { describe, expect, it } from "vitest";
import { normalizeRows } from "./activation-approvals";
import { classifyLiveLinkError, codeStatus, liveLinkStatus, LIVE_LINK_FRESH_MS } from "./live-link";
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

describe("Step 10 autonomy status", () => {
  const row = (state: SafetyRow["state"], extra: Partial<SafetyRow> = {}): SafetyRow => ({
    state,
    paused: state === "paused",
    code_stop: state === "engaged",
    code_enabled: false,
    cancellation: null,
    observed_at: new Date(NOW - 10_000).toISOString(),
    expires_at: new Date(NOW + 110_000).toISOString(),
    source: "poll",
    reason: "",
    recorded_at: new Date(NOW - 10_000).toISOString(),
    ...extra,
  });
  it("is not authorized before Step 10, and approving it never reads as running", () => {
    const clear = safetyView(row("clear"), NOW);
    expect(codeStatus(rows(9), NOW, clear).state).toBe("not_authorized");
    const after = codeStatus(rows(10), NOW, clear);
    expect(after.state).toBe("authorized_not_running");
    expect(after.headline).toBe("No OMNI executor connected");
  });
  it("names the CODE Emergency Stop while it is engaged", () => {
    const s = codeStatus(rows(10), NOW, safetyView(row("engaged"), NOW));
    expect(s.state).toBe("authorized_not_running");
    expect(s.safetyClear).toBe(false);
    expect(s.headline).toBe("CODE Emergency Stop engaged");
  });
  it("lapses when Step 7's window has ended", () => {
    const r = rows(10, "2026-11-14T00:59:00Z");
    expect(codeStatus(r, NOW, safetyView(row("clear"), NOW)).state).toBe("not_authorized");
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
