import { describe, expect, it } from "vitest";
import {
  DOCK_BROWSER_ORIGINS,
  DOCK_PATHS,
  corsHeaders,
  deviceStatus,
  formatPairingCode,
  keyFingerprint,
  mobileAlerts,
  mobileAutonomyBlockers,
  normalizePairingCode,
  pairingCodeHash,
  safetyCode,
} from "./omni-dock";
import { generateDockKey, pairBody, signDockRequest } from "./omni-dock-client";
import { handlePair, handleSigned, type DockStore } from "./omni-dock.server";

const NOW = 1_800_000_000_000;
const DEVICE = "0f0e0d0c-0b0a-4908-8706-050403020100";

function fakeStore(
  over: Partial<DockStore> & { status?: string; permissions?: string[]; jwk?: unknown } = {},
) {
  const calls: string[] = [];
  const nonces = new Set<string>();
  const store: DockStore = {
    claim: async (a) => {
      calls.push(`claim:${a.codeHash.slice(0, 6)}`);
      return { ok: true, device_id: DEVICE, branch_kind: "honeycomb_mobile" };
    },
    loadDevice: async () =>
      over.jwk ? { public_key: over.jwk, revision: 0, native_client_id: "omni-native-cli" } : null,
    touch: async (a) => {
      if (nonces.has(a.nonce)) return { ok: false, reason: "replay" };
      nonces.add(a.nonce);
      calls.push(`touch:${a.event}`);
      if (over.status === "revoked") return { ok: false, reason: "revoked" };
      return { ok: true, status: over.status ?? "paired", permissions: over.permissions ?? [] };
    },
    nativeDeviceStatus: async (device, fingerprint, nonce) => {
      if (nonces.has(nonce)) return { ok: false, reason: "replay" };
      nonces.add(nonce);
      return {
        ok: true,
        device_id: device,
        key_fingerprint: fingerprint,
        revision: 3,
        permissions: ["status.read"],
        checked_at: "2027-01-15T08:00:00+00:00",
      };
    },
    log: async (_d, e, o) => void calls.push(`log:${e}:${o}`),
    stopEngaged: async () => true,
    handoffStatus: async () => [],
    cloudSnapshot: async () => (calls.push("cloud"), { agents: [], cloudJobs: [], alerts: [] }),
    auditTail: async () => (calls.push("audit"), []),
    authorizeNativeRead: async () => true,
    nativeCatalog: async (permissions) => (
      calls.push("catalog"),
      { permissions: [...permissions], chatAvailable: false }
    ),
    nativeProjects: async (device) => (
      calls.push(`projects:${device}`),
      [{ id: "project-1", name: "Owner project" }]
    ),
    nativeChat: async (device, _identity, input) => (
      calls.push(`chat:${device}:${input.requestId}`),
      {
        ok: true,
        reply: "Settled reply",
        requestId: input.requestId,
        toolsAvailable: false,
        taskExecutionAvailable: false,
      }
    ),
    control: async (_d, c) => (calls.push(`control:${c.action}`), { ok: true }),
    engageStop: async () => (calls.push("engage"), true),
    holdTask: async (_d, j) => (
      calls.push(`hold:${j.kind}`),
      { ok: true, task_id: j.id, state: "held", duplicate: false }
    ),
    ...over,
  };
  return { store, calls };
}

async function signed(
  path: string,
  device: string,
  body: string,
  key: CryptoKey,
  opts: { now?: number; nonce?: string } = {},
) {
  const headers = await signDockRequest({
    privateKey: key,
    path,
    device,
    body,
    now: opts.now ?? NOW,
    nonce: opts.nonce,
  });
  return new Request(`https://bay.test${path}`, { method: "POST", headers, body });
}

describe("pairing code", () => {
  it("is 10 Crockford characters shown as XXXXX-XXXXX and normalizes look-alikes", async () => {
    const code = formatPairingCode(new Uint8Array([0, 1, 2, 3, 4, 31, 30, 29, 28, 27]));
    expect(code).toBe("01234-ZYXWV");
    expect(normalizePairingCode("o1234-zyxwv")).toBe("01234ZYXWV");
    expect(normalizePairingCode("short")).toBeNull();
    expect(await pairingCodeHash("01234 zyxwv")).toBe(await pairingCodeHash("01234-ZYXWV"));
    expect(await pairingCodeHash("01234-ZYXWV")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("status and switches", () => {
  it("connected only within two minutes of a signed contact", () => {
    const at = (ms: number) => new Date(NOW - ms).toISOString();
    expect(deviceStatus({ status: "paired", last_seen_at: at(60_000) }, NOW)).toBe("connected");
    expect(deviceStatus({ status: "paired", last_seen_at: at(121_000) }, NOW)).toBe("disconnected");
    expect(deviceStatus({ status: "paired", last_seen_at: null }, NOW)).toBe("never_connected");
    expect(deviceStatus({ status: "pending", last_seen_at: at(1) }, NOW)).toBe("awaiting_approval");
    expect(deviceStatus({ status: "revoked", last_seen_at: at(1) }, NOW)).toBe("revoked");
  });

  it("mobile autonomy always has blockers, even for a fully permitted connected device", () => {
    const b = mobileAutonomyBlockers({
      deviceStatus: "connected",
      permissions: ["jobs.propose"],
      emergencyStopEngaged: false,
    });
    expect(b.length).toBeGreaterThanOrEqual(2);
    expect(b.join(" ")).toMatch(/No executor/);
  });

  it("CORS allows only the Honeycomb origins", () => {
    expect(corsHeaders(DOCK_BROWSER_ORIGINS[0])["Access-Control-Allow-Origin"]).toBe(
      DOCK_BROWSER_ORIGINS[0],
    );
    expect(corsHeaders("https://evil.example")["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(corsHeaders(null)["Cache-Control"]).toBe("no-store");
  });
});

describe("signed pairing", () => {
  it("accepts a valid proof of key possession and returns the matching safety code", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const body = pairBody({ code: "01234-ZYXWV", label: "iPhone", platform: "ios", publicJwk });
    const { store, calls } = fakeStore();
    const r = await handlePair(await signed(DOCK_PATHS.pair, "pair", body, privateKey), store, NOW);
    expect(r.status).toBe(201);
    expect(r.body["safetyCode"]).toBe(safetyCode(await keyFingerprint(publicJwk)));
    expect(calls).toEqual([`claim:${(await pairingCodeHash("01234-ZYXWV"))!.slice(0, 6)}`]);
  });

  it("refuses a signature from a different key, a tampered body and a stale clock", async () => {
    const a = await generateDockKey();
    const b = await generateDockKey();
    const body = pairBody({
      code: "01234-ZYXWV",
      label: "iPhone",
      platform: "ios",
      publicJwk: a.publicJwk,
    });
    const { store, calls } = fakeStore();
    expect(
      (await handlePair(await signed(DOCK_PATHS.pair, "pair", body, b.privateKey), store, NOW))
        .status,
    ).toBe(401);
    const good = await signed(DOCK_PATHS.pair, "pair", body, a.privateKey);
    const tampered = new Request(good.url, {
      method: "POST",
      headers: good.headers,
      body: body.replace("iPhone", "iPhonX"),
    });
    expect((await handlePair(tampered, store, NOW)).status).toBe(401);
    const stale = await signed(DOCK_PATHS.pair, "pair", body, a.privateKey, { now: NOW - 61_000 });
    expect((await handlePair(stale, store, NOW)).body["reason"]).toBe("stale_request");
    expect(calls).toEqual([]);
  });
});

describe("signed device requests", () => {
  it("binds native admission to the verified key and loaded revision and stops on a rotation refusal", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const { store, calls } = fakeStore({
      jwk: publicJwk,
      permissions: ["stop.engage"],
      loadDevice: async () => ({
        public_key: publicJwk,
        revision: 7,
        native_client_id: "omni-native-cli",
      }),
      touch: async (args) => {
        expect(args.nativeIdentity).toEqual({
          fingerprint: await keyFingerprint(publicJwk),
          revision: 7,
          timestamp: NOW,
        });
        return { ok: false, reason: "device_changed" };
      },
    });
    const result = await handleSigned(
      await signed(DOCK_PATHS.stop, DEVICE, "{}", privateKey),
      "stop",
      store,
      NOW,
    );
    expect(result.status).toBe(409);
    expect(result.body["reason"]).toBe("device_changed");
    expect(calls).not.toContain("engage");
  });

  it("keeps legacy pending-device heartbeat on the legacy admission path", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const { store } = fakeStore({
      jwk: publicJwk,
      loadDevice: async () => ({ public_key: publicJwk, revision: 0, native_client_id: null }),
      touch: async (args) => {
        expect(args.nativeIdentity).toBeUndefined();
        return { ok: true, status: "pending", permissions: [] };
      },
    });
    const result = await handleSigned(
      await signed(DOCK_PATHS.heartbeat, DEVICE, "{}", privateKey),
      "heartbeat",
      store,
      NOW,
    );
    expect(result.body["status"]).toBe("awaiting_approval");
  });

  it("withholds a native cloud snapshot if authorization changes after its reads", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const { store, calls } = fakeStore({
      jwk: publicJwk,
      permissions: ["cloud.read"],
      stopEngaged: async () => false,
      authorizeNativeRead: async () => false,
    });
    const result = await handleSigned(
      await signed(DOCK_PATHS.cloud, DEVICE, "{}", privateKey),
      "cloud",
      store,
      NOW,
    );
    expect(calls).toContain("cloud");
    expect(result.status).toBe(403);
    expect(result.body).not.toHaveProperty("agents");
  });

  it("fails closed when the native admission migration is unavailable", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const { store, calls } = fakeStore({
      jwk: publicJwk,
      touch: async () => ({ ok: false, reason: "unavailable" }),
    });
    const result = await handleSigned(
      await signed(DOCK_PATHS.heartbeat, DEVICE, "{}", privateKey),
      "heartbeat",
      store,
      NOW,
    );
    expect(result.status).toBe(503);
    expect(result.body["reason"]).toBe("unavailable");
    expect(calls).toEqual([]);
  });

  it("reconciles the signed key and rejects replay and changed keys without consulting Stop", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const nonce = "nonce-aaaaaaaaaaaaaaaa";
    const { store } = fakeStore({ jwk: publicJwk });
    const req = () => signed(DOCK_PATHS.nativeDeviceStatus, DEVICE, "{}", privateKey, { nonce });
    const result = await handleSigned(await req(), "nativeDeviceStatus", store, NOW);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      protocol: "omni.native-device-status/v1",
      deviceId: DEVICE,
      keyFingerprint: await keyFingerprint(publicJwk),
      revision: 3,
      status: "paired",
      permissions: ["status.read"],
    });
    expect((await handleSigned(await req(), "nativeDeviceStatus", store, NOW)).status).toBe(409);
    const changed = fakeStore({
      jwk: publicJwk,
      nativeDeviceStatus: async () => ({ ok: false, reason: "device_changed" }),
    });
    expect(
      (await handleSigned(await req(), "nativeDeviceStatus", changed.store, NOW)).body["reason"],
    ).toBe("device_changed");
    const invalid = fakeStore({
      jwk: publicJwk,
      nativeDeviceStatus: async () => ({ ok: true, device_id: DEVICE, revision: 3 }),
    });
    expect((await handleSigned(await req(), "nativeDeviceStatus", invalid.store, NOW)).status).toBe(
      503,
    );
    const wrong = await generateDockKey();
    expect(
      (
        await handleSigned(
          await signed(DOCK_PATHS.nativeDeviceStatus, DEVICE, "{}", wrong.privateKey),
          "nativeDeviceStatus",
          store,
          NOW,
        )
      ).status,
    ).toBe(401);
  });
  it("heartbeat reports Emergency Stop and every autonomy switch off; replays are refused", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const { store } = fakeStore({ jwk: publicJwk, permissions: ["status.read"] });
    const req = () =>
      signed(DOCK_PATHS.heartbeat, DEVICE, "{}", privateKey, { nonce: "nonce-aaaaaaaaaaaaaaaa" });
    const r = await handleSigned(await req(), "heartbeat", store, NOW);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      status: "paired",
      emergencyStop: "engaged",
      autonomy: { device: "off", omniCore: "off", omniCode: "off", jackboyCode: "off" },
      executor: "none",
    });
    expect((await handleSigned(await req(), "heartbeat", store, NOW)).status).toBe(409);
  });

  it("a request signed for one endpoint cannot be used on another", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const { store, calls } = fakeStore({ jwk: publicJwk, permissions: ["stop.engage"] });
    const hb = await signed(DOCK_PATHS.heartbeat, DEVICE, "{}", privateKey);
    const r = await handleSigned(
      new Request(`https://bay.test${DOCK_PATHS.stop}`, {
        method: "POST",
        headers: hb.headers,
        body: "{}",
      }),
      "stop",
      store,
      NOW,
    );
    expect(r.status).toBe(401);
    expect(calls).toEqual(["log:signature_bad:denied"]);
  });

  it("revoked and unknown devices are refused", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const revoked = fakeStore({ jwk: publicJwk, status: "revoked" });
    expect(
      (
        await handleSigned(
          await signed(DOCK_PATHS.heartbeat, DEVICE, "{}", privateKey),
          "heartbeat",
          revoked.store,
          NOW,
        )
      ).body["reason"],
    ).toBe("revoked");
    const unknown = fakeStore();
    expect(
      (
        await handleSigned(
          await signed(DOCK_PATHS.heartbeat, DEVICE, "{}", privateKey),
          "heartbeat",
          unknown.store,
          NOW,
        )
      ).status,
    ).toBe(401);
  });

  it("stop needs the stop.engage permission and a paired device", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const denied = fakeStore({ jwk: publicJwk, permissions: ["status.read"] });
    expect(
      (
        await handleSigned(
          await signed(DOCK_PATHS.stop, DEVICE, "{}", privateKey),
          "stop",
          denied.store,
          NOW,
        )
      ).status,
    ).toBe(403);
    expect(denied.calls).not.toContain("engage");
    const pending = fakeStore({ jwk: publicJwk, status: "pending", permissions: ["stop.engage"] });
    expect(
      (
        await handleSigned(
          await signed(DOCK_PATHS.stop, DEVICE, "{}", privateKey),
          "stop",
          pending.store,
          NOW,
        )
      ).status,
    ).toBe(403);
    const ok = fakeStore({ jwk: publicJwk, permissions: ["stop.engage"] });
    const r = await handleSigned(
      await signed(DOCK_PATHS.stop, DEVICE, "{}", privateKey),
      "stop",
      ok.store,
      NOW,
    );
    expect(r.body["emergencyStop"]).toBe("engaged");
    expect(ok.calls).toContain("engage");
  });

  it("jobs are held, never dispatched; autonomous requests are refused before anything is stored", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const job = {
      id: "6b1f1c2a-8a43-4b1e-9d2c-3f6a7b8c9d0e",
      kind: "code.test",
      agent: "jackboy",
      project: "Mothership",
      instructions: "Add a test",
    };
    const { store, calls } = fakeStore({
      jwk: publicJwk,
      permissions: ["jobs.propose"],
      stopEngaged: async () => false,
    });
    const held = await handleSigned(
      await signed(DOCK_PATHS.jobs, DEVICE, JSON.stringify(job), privateKey),
      "jobs",
      store,
      NOW,
    );
    expect(held.status).toBe(202);
    expect(held.body["state"]).toBe("held");
    expect(held.body["taskId"]).toBe(job.id);
    const auto = await handleSigned(
      await signed(
        DOCK_PATHS.jobs,
        DEVICE,
        JSON.stringify({ ...job, autonomous: true }),
        privateKey,
      ),
      "jobs",
      store,
      NOW,
    );
    expect(auto.status).toBe(409);
    expect(auto.body["reason"]).toBe("autonomy_off");
    expect(calls.filter((c) => c.startsWith("hold:"))).toEqual(["hold:code.test"]);
    const shell = await handleSigned(
      await signed(
        DOCK_PATHS.jobs,
        DEVICE,
        JSON.stringify({ ...job, kind: "shell.exec" }),
        privateKey,
      ),
      "jobs",
      store,
      NOW,
    );
    expect(shell.status).toBe(400);
    const wrongAgent = await handleSigned(
      await signed(DOCK_PATHS.jobs, DEVICE, JSON.stringify({ ...job, agent: "jax" }), privateKey),
      "jobs",
      store,
      NOW,
    );
    expect(wrongAgent.status).toBe(400);
  });

  it("does not report a cancelled or invalid duplicate as a held task", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const job = {
      id: "6b1f1c2a-8a43-4b1e-9d2c-3f6a7b8c9d0e",
      kind: "code.test",
      agent: "jackboy",
      project: "Mothership",
      instructions: "Add a test",
    };
    const send = async (result: Record<string, unknown>) => {
      const { store } = fakeStore({
        jwk: publicJwk,
        permissions: ["jobs.propose"],
        stopEngaged: async () => false,
        holdTask: async () => ({ ok: true, ...result }),
      });
      return handleSigned(
        await signed(DOCK_PATHS.jobs, DEVICE, JSON.stringify(job), privateKey),
        "jobs",
        store,
        NOW,
      );
    };
    const cancelled = await send({ task_id: job.id, state: "cancelled", duplicate: true });
    expect(cancelled.status).toBe(409);
    expect(cancelled.body["reason"]).toBe("task_cancelled");
    expect(cancelled.body["state"]).toBeUndefined();
    const duplicate = await send({ task_id: job.id, state: "held", duplicate: true });
    expect(duplicate.status).toBe(202);
    expect(duplicate.body).toMatchObject({ taskId: job.id, state: "held", duplicate: true });
    expect((await send({ task_id: DEVICE, state: "held" })).status).toBe(503);
    expect((await send({ task_id: job.id, state: "unknown" })).status).toBe(503);
  });

  it("Emergency Stop refuses proposals and the status list", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const job = {
      id: "6b1f1c2a-8a43-4b1e-9d2c-3f6a7b8c9d0f",
      kind: "code.test",
      agent: "jackboy",
      project: "Mothership",
      instructions: "Add a test",
    };
    const { store, calls } = fakeStore({
      jwk: publicJwk,
      permissions: ["jobs.propose", "status.read"],
      stopEngaged: async () => true,
    });
    const held = await handleSigned(
      await signed(DOCK_PATHS.jobs, DEVICE, JSON.stringify(job), privateKey),
      "jobs",
      store,
      NOW,
    );
    expect(held.status).toBe(423);
    expect(calls.some((c) => c.startsWith("hold:"))).toBe(false);
    const list = await handleSigned(
      await signed(DOCK_PATHS.jobsStatus, DEVICE, "{}", privateKey),
      "jobsStatus",
      store,
      NOW,
    );
    expect(list.status).toBe(423);
  });

  it("status list needs status.read and only returns the signing device's tasks", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const asked: string[] = [];
    const rows = [{ taskId: "t1", state: "held", handoff: "queued" }];
    const denied = fakeStore({ jwk: publicJwk, permissions: ["jobs.propose"] });
    const r1 = await handleSigned(
      await signed(DOCK_PATHS.jobsStatus, DEVICE, "{}", privateKey),
      "jobsStatus",
      denied.store,
      NOW,
    );
    expect(r1.status).toBe(403);
    const ok = fakeStore({
      jwk: publicJwk,
      permissions: ["status.read"],
      stopEngaged: async () => false,
      handoffStatus: async (d: string) => (asked.push(d), rows),
    });
    const r2 = await handleSigned(
      await signed(DOCK_PATHS.jobsStatus, DEVICE, "{}", privateKey),
      "jobsStatus",
      ok.store,
      NOW,
    );
    expect(r2.status).toBe(200);
    expect(r2.body["jobs"]).toEqual(rows);
    expect(asked).toEqual([DEVICE]);
  });

  it("oversized bodies are refused", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const { store } = fakeStore({ jwk: publicJwk });
    const big = JSON.stringify({ appVersion: "x".repeat(9000) });
    expect(
      (
        await handleSigned(
          await signed(DOCK_PATHS.heartbeat, DEVICE, big, privateKey),
          "heartbeat",
          store,
          NOW,
        )
      ).status,
    ).toBe(413);
  });

  it("cloud and audit reads need their own permission and are refused under Emergency Stop", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const run = async (kind: "cloud" | "audit", perms: string[], stop: boolean) => {
      const f = fakeStore({ jwk: publicJwk, permissions: perms, stopEngaged: async () => stop });
      const r = await handleSigned(
        await signed(DOCK_PATHS[kind], DEVICE, "{}", privateKey),
        kind,
        f.store,
        NOW,
      );
      return { status: r.status, calls: f.calls, body: r.body };
    };
    expect((await run("cloud", ["status.read"], false)).status).toBe(403);
    expect((await run("audit", ["cloud.read"], false)).status).toBe(403);
    const c = await run("cloud", ["cloud.read"], false);
    expect(c.status).toBe(200);
    expect(c.calls).toContain("cloud");
    const a = await run("audit", ["audit.read"], false);
    expect(a.status).toBe(200);
    expect(a.body["entries"]).toEqual([]);
    const stopped = await run("cloud", ["cloud.read"], true);
    expect(stopped.status).toBe(423);
    expect(stopped.calls).not.toContain("cloud");
  });

  it("native catalog is signed, permission-scoped, and unavailable under Emergency Stop", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const request = () => signed(DOCK_PATHS.catalog, DEVICE, "{}", privateKey);
    const denied = fakeStore({ jwk: publicJwk, permissions: ["status.read"] });
    expect((await handleSigned(await request(), "catalog", denied.store, NOW)).status).toBe(403);
    expect(denied.calls).not.toContain("catalog");

    const stopped = fakeStore({
      jwk: publicJwk,
      permissions: ["cloud.read"],
      stopEngaged: async () => true,
    });
    expect((await handleSigned(await request(), "catalog", stopped.store, NOW)).status).toBe(423);
    expect(stopped.calls).not.toContain("catalog");

    const allowed = fakeStore({
      jwk: publicJwk,
      permissions: ["cloud.read", "jobs.propose"],
      stopEngaged: async () => false,
    });
    const result = await handleSigned(await request(), "catalog", allowed.store, NOW);
    expect(result.status).toBe(200);
    expect(result.body["catalog"]).toEqual({
      permissions: ["cloud.read", "jobs.propose"],
      chatAvailable: false,
    });
    expect(allowed.calls).toContain("catalog");
  });

  it("native projects and chat require chat.send, a paired device and released Emergency Stop", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const chat = {
      protocol: "omni.native-chat/v1",
      requestId: "a1b2c3d4-e5f6-4789-8abc-123456789012",
      sessionId: "b1b2c3d4-e5f6-4789-8abc-123456789012",
      projectId: "c1b2c3d4-e5f6-4789-8abc-123456789012",
      agentId: "omni",
      model: "claude-sonnet-5-5",
      messages: [{ role: "user", content: "Hello" }],
      consent: true,
      autonomous: false,
    };
    const signedRequest = (kind: "projects" | "chat", body: unknown) =>
      signed(DOCK_PATHS[kind], DEVICE, JSON.stringify(body), privateKey);

    const denied = fakeStore({
      jwk: publicJwk,
      permissions: ["cloud.read"],
      stopEngaged: async () => false,
    });
    expect(
      (await handleSigned(await signedRequest("projects", {}), "projects", denied.store, NOW))
        .status,
    ).toBe(403);
    expect(denied.calls.some((call) => call.startsWith("projects:"))).toBe(false);

    const stopped = fakeStore({
      jwk: publicJwk,
      permissions: ["chat.send"],
      stopEngaged: async () => true,
    });
    expect(
      (await handleSigned(await signedRequest("chat", chat), "chat", stopped.store, NOW)).status,
    ).toBe(423);
    expect(stopped.calls.some((call) => call.startsWith("chat:"))).toBe(false);

    const allowed = fakeStore({
      jwk: publicJwk,
      permissions: ["chat.send"],
      stopEngaged: async () => false,
    });
    const projects = await handleSigned(
      await signedRequest("projects", {}),
      "projects",
      allowed.store,
      NOW,
    );
    expect(projects.body["projects"]).toEqual([{ id: "project-1", name: "Owner project" }]);
    const response = await handleSigned(
      await signedRequest("chat", chat),
      "chat",
      allowed.store,
      NOW,
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      reply: "Settled reply",
      toolsAvailable: false,
      taskExecutionAvailable: false,
    });
    expect(allowed.calls).toContain(`chat:${DEVICE}:${chat.requestId}`);
  });

  it("control only pauses or stops, needs jobs.pause, and still works under Emergency Stop", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const send = async (body: unknown, perms: string[], status = "paired") => {
      const f = fakeStore({ jwk: publicJwk, permissions: perms, status });
      const text = JSON.stringify(body);
      const r = await handleSigned(
        await signed(DOCK_PATHS.control, DEVICE, text, privateKey),
        "control",
        f.store,
        NOW,
      );
      return { status: r.status, calls: f.calls };
    };
    expect((await send({ action: "pause_agent", agentId: "omni" }, ["stop.engage"])).status).toBe(
      403,
    );
    expect(
      (await send({ action: "pause_agent", agentId: "omni" }, ["jobs.pause"], "pending")).status,
    ).toBe(403);
    const ok = await send({ action: "pause_agent", agentId: "omni" }, ["jobs.pause"]);
    expect(ok.status).toBe(200);
    expect(ok.calls).toContain("control:pause_agent");
    expect((await send({ action: "stop_job", jobId: DEVICE }, ["jobs.pause"])).status).toBe(200);
    for (const bad of [
      { action: "resume_agent", agentId: "omni" },
      { action: "approve", id: DEVICE },
      { action: "start_job", jobId: DEVICE },
      { action: "stop_job", jobId: "x" },
    ]) {
      const r = await send(bad, ["jobs.pause"]);
      expect(r.status).toBe(400);
      expect(r.calls.some((c) => c.startsWith("control:"))).toBe(false);
    }
  });
});

describe("mobile alerts", () => {
  const base = {
    now: NOW,
    emergencyStopEngaged: false,
    pendingApprovals: 0,
    failedLast24h: 0,
    spendDayCents: 0,
    dayCapCents: 500,
    autonomyWindows: [],
    codeAlwaysOn: false,
  };
  it("is quiet when nothing needs attention", () => expect(mobileAlerts(base)).toEqual([]));
  it("raises stop, approvals, failures, spend at 80% and windows ending within 5 minutes", () => {
    const ids = mobileAlerts({
      ...base,
      emergencyStopEngaged: true,
      pendingApprovals: 2,
      failedLast24h: 1,
      spendDayCents: 400,
      autonomyWindows: [
        { agentId: "omni", expiresAt: NOW + 3 * 60_000 },
        { agentId: "razul", expiresAt: NOW + 30 * 60_000 },
      ],
    }).map((a) => `${a.id}:${a.level}`);
    expect(ids).toEqual([
      "stop:critical",
      "approvals:warning",
      "failed:warning",
      "spend:warning",
      "window-omni:info",
    ]);
    expect(mobileAlerts({ ...base, spendDayCents: 500 })[0]).toMatchObject({
      id: "spend",
      level: "critical",
    });
    expect(mobileAlerts({ ...base, spendDayCents: 399 })).toEqual([]);
  });
});
