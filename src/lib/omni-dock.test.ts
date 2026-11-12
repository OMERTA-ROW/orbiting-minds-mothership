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
    loadDevice: async () => (over.jwk ? { public_key: over.jwk } : null),
    touch: async (a) => {
      if (nonces.has(a.nonce)) return { ok: false, reason: "replay" };
      nonces.add(a.nonce);
      calls.push(`touch:${a.event}`);
      if (over.status === "revoked") return { ok: false, reason: "revoked" };
      return { ok: true, status: over.status ?? "paired", permissions: over.permissions ?? [] };
    },
    log: async (_d, e, o) => void calls.push(`log:${e}:${o}`),
    stopEngaged: async () => true,
    handoffStatus: async () => [],
    cloudSnapshot: async () => (calls.push("cloud"), { agents: [], cloudJobs: [], alerts: [] }),
    auditTail: async () => (calls.push("audit"), []),
    control: async (_d, c) => (calls.push(`control:${c.action}`), { ok: true }),
    engageStop: async () => (calls.push("engage"), true),
    holdTask: async (_d, j) => (
      calls.push(`hold:${j.kind}`),
      { ok: true, task_id: j.id, duplicate: false }
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
      const r = await handleSigned(await signed(DOCK_PATHS[kind], DEVICE, "{}", privateKey), kind, f.store, NOW);
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

  it("control only pauses or stops, needs jobs.pause, and still works under Emergency Stop", async () => {
    const { privateKey, publicJwk } = await generateDockKey();
    const send = async (body: unknown, perms: string[], status = "paired") => {
      const f = fakeStore({ jwk: publicJwk, permissions: perms, status });
      const text = JSON.stringify(body);
      const r = await handleSigned(await signed(DOCK_PATHS.control, DEVICE, text, privateKey), "control", f.store, NOW);
      return { status: r.status, calls: f.calls };
    };
    expect((await send({ action: "pause_agent", agentId: "omni" }, ["stop.engage"])).status).toBe(403);
    expect((await send({ action: "pause_agent", agentId: "omni" }, ["jobs.pause"], "pending")).status).toBe(403);
    const ok = await send({ action: "pause_agent", agentId: "omni" }, ["jobs.pause"]);
    expect(ok.status).toBe(200);
    expect(ok.calls).toContain("control:pause_agent");
    expect((await send({ action: "stop_job", jobId: DEVICE }, ["jobs.pause"])).status).toBe(200);
    for (const bad of [{ action: "resume_agent", agentId: "omni" }, { action: "approve", id: DEVICE }, { action: "start_job", jobId: DEVICE }, { action: "stop_job", jobId: "x" }]) {
      const r = await send(bad, ["jobs.pause"]);
      expect(r.status).toBe(400);
      expect(r.calls.some((c) => c.startsWith("control:"))).toBe(false);
    }
  });
});

describe("mobile alerts", () => {
  const base = { now: NOW, emergencyStopEngaged: false, pendingApprovals: 0, failedLast24h: 0, spendDayCents: 0, dayCapCents: 500, autonomyWindows: [], codeAlwaysOn: false };
  it("is quiet when nothing needs attention", () => expect(mobileAlerts(base)).toEqual([]));
  it("raises stop, approvals, failures, spend at 80% and windows ending within 5 minutes", () => {
    const ids = mobileAlerts({
      ...base,
      emergencyStopEngaged: true,
      pendingApprovals: 2,
      failedLast24h: 1,
      spendDayCents: 400,
      autonomyWindows: [{ agentId: "omni", expiresAt: NOW + 3 * 60_000 }, { agentId: "razul", expiresAt: NOW + 30 * 60_000 }],
    }).map((a) => `${a.id}:${a.level}`);
    expect(ids).toEqual(["stop:critical", "approvals:warning", "failed:warning", "spend:warning", "window-omni:info"]);
    expect(mobileAlerts({ ...base, spendDayCents: 500 })[0]).toMatchObject({ id: "spend", level: "critical" });
    expect(mobileAlerts({ ...base, spendDayCents: 399 })).toEqual([]);
  });
});
