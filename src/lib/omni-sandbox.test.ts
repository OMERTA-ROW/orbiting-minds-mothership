import { describe, expect, it } from "vitest";
import {
  AUTONOMY_ENABLED,
  evaluateSandboxHealth,
  remoteReply,
  startSessionInput,
  type SandboxHealth,
} from "./omni-workspace";
import { sandboxSettings } from "./omni-sandbox-config.server";

const healthy: SandboxHealth = {
  service: "omni-sandbox",
  version: "0.1.0",
  isolation: { network: "isolated", uid: 20001, perSessionUser: true, envNames: ["HOME", "LANG", "PATH", "TERM"], probeExitCode: 0 },
  limits: { commandTimeoutSec: 60, cpuSec: 60, memoryMb: 2048, maxProcesses: 128, fileSizeMb: 200, outputCapBytes: 262144, maxSessions: 3, idleMinutes: 10, sessionMinutes: 60 },
  providers: [],
  github: { configured: false, repositories: [], checkedAt: null },
  autonomy: "off",
  merge: "never",
};

describe("sandbox self-test verdict", () => {
  it("passes an isolated, non-root, bounded sandbox", () => expect(evaluateSandboxHealth(healthy).passed).toBe(true));
  it("fails when commands can reach the network", () =>
    expect(evaluateSandboxHealth({ ...healthy, isolation: { ...healthy.isolation, network: "open" } }).passed).toBe(false));
  it("fails when commands run as root", () =>
    expect(evaluateSandboxHealth({ ...healthy, isolation: { ...healthy.isolation, uid: 0 } }).passed).toBe(false));
  it("fails when commands can see extra settings such as a key", () =>
    expect(evaluateSandboxHealth({ ...healthy, isolation: { ...healthy.isolation, envNames: ["PATH", "OPENAI_API_KEY"] } }).passed).toBe(false));
  it("fails when a command may run longer than 5 minutes or sessions idle past 10 minutes", () => {
    expect(evaluateSandboxHealth({ ...healthy, limits: { ...healthy.limits, commandTimeoutSec: 301 } }).passed).toBe(false);
    expect(evaluateSandboxHealth({ ...healthy, limits: { ...healthy.limits, idleMinutes: 11 } }).passed).toBe(false);
  });
  it("refuses a sandbox that reports an unknown autonomy mode or merging", () => {
    const r = remoteReply.safeParse({ contract: "omni.workspace/v1", requestNonce: "n", health: { ...healthy, autonomy: "on" } });
    expect(r.success).toBe(false);
    const m = remoteReply.safeParse({ contract: "omni.workspace/v1", requestNonce: "n", health: { ...healthy, merge: "allowed" } });
    expect(m.success).toBe(false);
  });
});

describe("sandbox settings", () => {
  const good = {
    OMNI_SANDBOX_ORIGIN: "https://omni-sandbox.up.railway.app",
    OMNI_SANDBOX_CLIENT_ID: "mothership",
    OMNI_SANDBOX_HMAC_SECRET: "s".repeat(40),
  };
  it("is not configured until all three settings exist", () => {
    expect(sandboxSettings({}).state.configured).toBe(false);
    expect(sandboxSettings(good).state.configured).toBe(true);
  });
  it("stays off until OMNI_SANDBOX_ENABLED is exactly true", () => {
    expect(sandboxSettings(good).state.enabled).toBe(false);
    expect(sandboxSettings({ ...good, OMNI_SANDBOX_ENABLED: "true" }).state.enabled).toBe(true);
  });
  it("refuses the Jackboy/production host or a reused secret", () => {
    expect(sandboxSettings({ ...good, JACKBOY_LINK_ORIGIN: "https://omni-sandbox.up.railway.app" }).state.configured).toBe(false);
    expect(sandboxSettings({ ...good, OMNI_LINK_HMAC_SECRET: good.OMNI_SANDBOX_HMAC_SECRET }).state.configured).toBe(false);
  });
  it("refuses non-HTTPS or private addresses", () => {
    expect(sandboxSettings({ ...good, OMNI_SANDBOX_ORIGIN: "http://omni-sandbox.up.railway.app" }).state.configured).toBe(false);
    expect(sandboxSettings({ ...good, OMNI_SANDBOX_ORIGIN: "https://10.0.0.5" }).state.configured).toBe(false);
  });
});

describe("autonomy and sessions", () => {
  it("Autonomous Mode stays off", () => expect(AUTONOMY_ENABLED).toBe(false));
  it("a branch needs a repository and names are validated", () => {
    const base = { checkId: crypto.randomUUID(), agentId: "omni" };
    expect(startSessionInput.safeParse({ ...base, ref: "main" }).success).toBe(false);
    expect(startSessionInput.safeParse({ ...base, repository: "a/b; rm -rf /" }).success).toBe(false);
    expect(startSessionInput.safeParse({ ...base, repository: "OMERTA-ROW/omni", ref: "main", provider: "anthropic" }).success).toBe(true);
  });
});
