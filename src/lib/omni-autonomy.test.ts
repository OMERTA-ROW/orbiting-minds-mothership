import { describe, expect, it } from "vitest";
import {
  AUTONOMY_ENABLED,
  AUTONOMY_MINUTES,
  AUTONOMY_VERIFIED_RELEASE,
  GLOBAL_LIMITS,
  autonomyGates,
  autonomyInput,
  type AutonomyEvidence,
  type SandboxHealth,
} from "./omni-workspace";

const NOW = Date.parse("2026-11-12T19:00:00Z");
const health: SandboxHealth = {
  service: "omni-sandbox",
  version: "0.2.0",
  isolation: { network: "isolated", uid: 20001, perSessionUser: true, envNames: ["HOME", "PATH"], probeExitCode: 0 },
  limits: { commandTimeoutSec: 60, cpuSec: 60, memoryMb: 2048, maxProcesses: 128, fileSizeMb: 200, outputCapBytes: 262144, maxSessions: 3, idleMinutes: 10, sessionMinutes: 60 },
  providers: [{ id: "openai", configured: true, verified: true, model: "m", pricing: true, checkedAt: null }],
  github: { configured: false, repositories: [], checkedAt: null },
  autonomy: "windowed",
  merge: "never",
};
// Every gate met, including a hypothetical reviewed release (never true in this build).
const all: AutonomyEvidence = {
  now: NOW,
  verifiedRelease: "R-test",
  sandboxSelfTestPassedAt: NOW - 3600_000,
  sandboxHealth: health,
  stopDrillPassedAt: NOW - 3600_000,
  emergencyStopReleased: true,
  killSwitchEnabled: true,
  passkeyFresh: true,
  agent: { id: "omni", status: "enrolled", budget: { task: 100, day: 500, total: 1000 } },
};
const failing = (e: AutonomyEvidence) => autonomyGates(e).gates.filter((g) => !g.ok).map((g) => g.id);

describe("Autonomous Mode stays off in this build", () => {
  it("has no reviewed live verification recorded", () => {
    expect(AUTONOMY_VERIFIED_RELEASE).toBeNull();
    expect(AUTONOMY_ENABLED).toBe(false);
  });
  it("is refused even when everything else passes", () => {
    const r = autonomyGates({ ...all, verifiedRelease: AUTONOMY_VERIFIED_RELEASE });
    expect(r.allowed).toBe(false);
    expect(failing({ ...all, verifiedRelease: null })).toEqual(["verified_release"]);
  });
  it("starts with every live gate missing when nothing has been recorded", () => {
    const r = failing({ ...all, verifiedRelease: null, sandboxSelfTestPassedAt: null, sandboxHealth: null, stopDrillPassedAt: null, passkeyFresh: false });
    expect(r).toEqual(expect.arrayContaining(["verified_release", "signed_self_test", "isolation", "sandbox_autonomy", "stop_drill", "spend_meter", "approval_gates", "passkey"]));
  });
});

describe("autonomy gates", () => {
  it("allows only when every gate is met", () => expect(autonomyGates(all).allowed).toBe(true));
  it("needs a self-test from the last 24 hours", () => expect(failing({ ...all, sandboxSelfTestPassedAt: NOW - 25 * 3600_000 })).toEqual(["signed_self_test"]));
  it("needs a live stop drill from the last 24 hours", () => expect(failing({ ...all, stopDrillPassedAt: NOW - 25 * 3600_000 })).toEqual(["stop_drill"]));
  it("needs network isolation and a per-session user", () => {
    expect(failing({ ...all, sandboxHealth: { ...health, isolation: { ...health.isolation, network: "open" } } })).toEqual(["isolation"]);
    expect(failing({ ...all, sandboxHealth: { ...health, isolation: { ...health.isolation, perSessionUser: false } } })).toEqual(["isolation"]);
  });
  it("needs a sandbox that implements time-bounded autonomy", () => expect(failing({ ...all, sandboxHealth: { ...health, autonomy: "off" } })).toEqual(["sandbox_autonomy"]));
  it("needs a spend meter: agent budget and provider prices", () => {
    expect(failing({ ...all, agent: { ...all.agent, budget: { task: 0, day: 500, total: 1000 } } })).toEqual(["spend_meter"]);
    expect(failing({ ...all, sandboxHealth: { ...health, providers: [{ ...health.providers[0]!, pricing: false }] } })).toEqual(["spend_meter"]);
  });
  it("never grants Jackboy autonomy (its CODE controls stay in charge)", () => expect(failing({ ...all, agent: { ...all.agent, id: "jackboy" } })).toEqual(["agent"]));
  it("refuses a paused agent", () => expect(failing({ ...all, agent: { ...all.agent, status: "paused" } })).toEqual(["agent"]));
  it("refuses while Emergency Stop is engaged or unreadable, or the terminal is off", () => {
    expect(failing({ ...all, emergencyStopReleased: false })).toEqual(["controls"]);
    expect(failing({ ...all, emergencyStopReleased: null })).toEqual(["controls"]);
    expect(failing({ ...all, killSwitchEnabled: false })).toEqual(["controls"]);
  });
  it("needs a fresh passkey", () => expect(failing({ ...all, passkeyFresh: false })).toEqual(["passkey"]));
});

describe("limits and windows are preserved", () => {
  it("keeps $1 per task, $5 per day and $10 total", () => expect(GLOBAL_LIMITS).toEqual({ task: 100, day: 500, total: 1000 }));
  it("offers only 15, 30 or 60 minute windows", () => {
    expect([...AUTONOMY_MINUTES]).toEqual([15, 30, 60]);
    expect(autonomyInput.safeParse({ agentId: "omni", on: true, minutes: 45 }).success).toBe(false);
    expect(autonomyInput.safeParse({ agentId: "omni", on: true, minutes: 120 }).success).toBe(false);
  });
});
