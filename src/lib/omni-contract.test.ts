import { describe, expect, it, vi } from "vitest";
import {
  omniContractRead,
  omniContractTasks,
  omniContractUnsupported,
} from "./omni-contract.server";
import { buildManifest, runsToTasks, type ObservatoryRun } from "./omni-contract";
import { sha256Hex } from "./omni-api-keys";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.rpc },
}));

const HEALTH_KEY = "omni_" + "a".repeat(48);
const JOBS_KEY = "omni_" + "b".repeat(48);
const keys = new Map<string, string[]>();
const ready = (async () => {
  keys.set(await sha256Hex(HEALTH_KEY), ["health"]);
  keys.set(await sha256Hex(JOBS_KEY), ["jobs"]);
})();
const verify = async (hash: string, scope: string) =>
  keys.get(hash)?.includes(scope)
    ? ({ status: "valid", keyId: "key-id" } as const)
    : ({ status: "invalid" } as const);
const req = (path: string, key?: string, method = "GET") =>
  new Request(`https://evoomni.tech${path}`, {
    method,
    headers: key ? { authorization: `Bearer ${key}` } : {},
  });

describe("OMNI frontend contract", () => {
  it("health answers ok with a health-scoped key", async () => {
    await ready;
    const r = await omniContractRead(req("/api/omni/health", HEALTH_KEY), "health", verify);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, version: "1.0.0" });
  });
  it("refuses a missing or unknown key with 401", async () => {
    await ready;
    expect((await omniContractRead(req("/api/omni/health"), "health", verify)).status).toBe(401);
    const bad = "omni_" + "c".repeat(48);
    expect((await omniContractRead(req("/api/omni/health", bad), "health", verify)).status).toBe(
      401,
    );
  });
  it("raw manifest JSON gives OMNI web six assignable held-task agents and no chat agent", async () => {
    await ready;
    const r = await omniContractRead(
      new Request("https://evoomni.tech/api/omni/manifest", {
        headers: { authorization: `Bearer ${HEALTH_KEY}` },
      }),
      "manifest",
      verify,
      async () => ({ aiConfigured: false, chatInstalled: false }),
    );
    expect(r.status).toBe(200);
    const raw = (await r.json()) as {
      agents: { id: string; enrolled: unknown }[];
      taskAgents: unknown;
    };
    // Mirrors OMNI web 6df27e6: taskAgents strings, intersected with manifest agents.
    const taskAgents = Array.isArray(raw.taskAgents)
      ? raw.taskAgents.filter((a): a is string => typeof a === "string" && a.length > 0)
      : [];
    const eligible = raw.agents.filter((a) => taskAgents.includes(a.id)).map((a) => a.id);
    expect(eligible).toEqual(["jackboy", "jax", "razul", "sabrina", "guardian", "hercules"]);
    expect(raw.agents.filter((a) => a.enrolled === true)).toEqual([]);
  });
  it("raw manifest reports live provider and chat facts read on the server", async () => {
    await ready;
    const r = await omniContractRead(
      req("/api/omni/manifest", HEALTH_KEY),
      "manifest",
      verify,
      async () => ({ aiConfigured: true, chatInstalled: true }),
    );
    const raw = (await r.json()) as {
      agents: { id: string; enrolled: boolean }[];
      providers: { models: string[] }[];
    };
    // OMNI web counts "Models discovered" as the sum of provider models.
    expect(raw.providers.reduce((n, p) => n + p.models.length, 0)).toBe(1);
    expect(raw.agents.filter((a) => a.enrolled).map((a) => a.id)).toEqual([
      "omni",
      "dread",
      "draco",
    ]);
  });
  it("a jobs-only key is valid but gets 403 for health and manifest", async () => {
    await ready;
    const r = await omniContractRead(req("/api/omni/manifest", JOBS_KEY), "manifest", verify);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: "scope_missing", needs: "health" });
  });
  it("reports verification outages without claiming credentials are invalid or reading records", async () => {
    const unavailable = async () => ({ status: "unavailable" as const });
    const read = async () => {
      throw new Error("must not read records");
    };
    for (const result of [
      await omniContractRead(req("/api/omni/health", HEALTH_KEY), "health", unavailable),
      await omniContractTasks(req("/api/omni/tasks", JOBS_KEY), unavailable, read),
      await omniContractUnsupported(req("/api/omni/chat", HEALTH_KEY, "POST"), "chat", unavailable),
    ]) {
      expect(result.status).toBe(503);
      expect(result.headers.get("cache-control")).toBe("no-store");
      expect(await result.json()).toEqual({
        ok: false,
        error: "credential_verification_unavailable",
      });
    }
  });
  it("reports database errors and rejected verification calls as unavailable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private details" } });
      mocks.rpc.mockRejectedValueOnce(new Error("private details"));
      for (let i = 0; i < 2; i++) {
        const result = await omniContractRead(req("/api/omni/health", HEALTH_KEY), "health");
        expect(result.status).toBe(503);
        expect(await result.json()).toEqual({
          ok: false,
          error: "credential_verification_unavailable",
        });
      }
      expect(mocks.rpc).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledWith("OMNI credential verification failed.");
    } finally {
      log.mockRestore();
      mocks.rpc.mockReset();
    }
  });
  it("fails closed if checking an alternate scope is unavailable", async () => {
    let checks = 0;
    const result = await omniContractRead(req("/api/omni/health", JOBS_KEY), "health", async () =>
      ++checks === 1 ? { status: "invalid" } : { status: "unavailable" },
    );
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({
      ok: false,
      error: "credential_verification_unavailable",
    });
  });
  it("manifest never claims autonomy, providers or an enrolled chat agent", () => {
    const m = buildManifest("https://evoomni.tech");
    expect(m.autonomous).toBe(false);
    expect(m.providers).toEqual([]);
    expect(m.agents.every((a) => !a.enrolled)).toBe(true);
    expect(m.capabilities).toMatchObject({
      chat: { read: false, write: false },
      tasks: { read: true, write: true },
      taskDecisions: { read: false, write: false },
      emergencyStop: { read: false, write: true },
    });
    expect(m.links.terminal).toBe("https://evoomni.tech/omni-terminal");
  });
  it("lists exactly the six held-task agents as assignable, none chat-enrolled", () => {
    const m = buildManifest("https://evoomni.tech");
    const ids = ["jackboy", "jax", "razul", "sabrina", "guardian", "hercules"];
    expect(m.taskAgents).toEqual(ids);
    // OMNI web assigns only agents present in both lists, so every task agent must be listed.
    expect(m.agents.filter((a) => m.taskAgents.includes(a.id as never)).map((a) => a.id)).toEqual(
      ids,
    );
    expect(m.agents.find((a) => a.id === "razul")?.name).toBe("Razul Central Intelligence");
    expect(m.taskAgents).not.toContain("omni");
    expect(m.agents.some((a) => a.enrolled)).toBe(false);
    expect(m.agents.some((a) => "status" in a)).toBe(false);
  });
  it("advertises no links on a non-https origin", () => {
    expect(buildManifest(null).links).toEqual({});
  });
  it("configured chat and a fresh capped permit cannot imply CODE or integration readiness", () => {
    const now = Date.parse("2026-11-27T03:00:00Z");
    const manifest = buildManifest("https://evoomni.tech", {
      aiConfigured: true,
      chatInstalled: true,
      fusionPlanInstalled: true,
      fusionPlannerInstalled: true,
      now,
      spend: {
        status: "read",
        latest: {
          perCallUsd: 0.5,
          perTaskUsd: 1,
          dailyUsd: 5,
          recordedAt: new Date(now).toISOString(),
        },
      },
    });
    expect(manifest.spendingCap.verified).toBe(true);
    expect(manifest.execution.integrationReady).toBe(false);
    expect(manifest.execution.code.available).toBe(false);
    expect(manifest.execution.workspace.available).toBe(false);
    expect(manifest.execution.jackboy.dispatchAuthority).toBe("quarantine-only");
    expect(manifest.execution.jackboy.remoteCancellationVerified).toBe(false);
    expect(manifest.autonomous).toBe(false);
  });
  it("chat and decisions are refused with 403 even for valid keys", async () => {
    await ready;
    for (const [path, cap, method] of [
      ["/api/omni/chat", "chat", "POST"],
      ["/api/omni/tasks/t1/approve", "task-decision", "POST"],
    ] as const) {
      for (const key of [HEALTH_KEY, JOBS_KEY]) {
        const r = await omniContractUnsupported(req(path, key, method), cap, verify);
        expect(r.status).toBe(403);
        const body = await r.json();
        expect(body.ok).toBe(false);
        expect(body.error).toBe("not_available");
      }
      expect(
        (await omniContractUnsupported(req(path, undefined, method), cap, verify)).status,
      ).toBe(401);
    }
  });

  const RUN: ObservatoryRun = {
    id: "r1",
    status: "succeeded",
    started_at: "2026-11-20T01:00:00Z",
    finished_at: "2026-11-20T01:02:00Z",
    fetched: 12,
    inserted: 3,
    alerts: 1,
  };
  it("tasks needs the jobs scope: a health-only key gets 403 and nothing is read", async () => {
    await ready;
    let reads = 0;
    const r = await omniContractTasks(req("/api/omni/tasks", HEALTH_KEY), verify, async () => {
      reads++;
      return [RUN];
    });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: "scope_missing", needs: "jobs" });
    expect(reads).toBe(0);
    expect(
      (await omniContractTasks(req("/api/omni/tasks"), verify, async () => [RUN])).status,
    ).toBe(401);
  });
  it("tasks with a jobs key lists observatory runs that never ask for approval", async () => {
    await ready;
    let auditedKey = "";
    const r = await omniContractTasks(req("/api/omni/tasks", JOBS_KEY), verify, async (id) => {
      auditedKey = id;
      return [RUN];
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(auditedKey).toBe("key-id");
    expect(body.tasks).toEqual([
      expect.objectContaining({
        id: "observatory-run-r1",
        status: "succeeded",
        requiresApproval: false,
      }),
    ]);
    expect(body.tasks[0].agentId).toBeUndefined();
  });
  it("tasks fails closed when the read or the audit fails", async () => {
    await ready;
    expect(
      (await omniContractTasks(req("/api/omni/tasks", JOBS_KEY), verify, async () => "read-failed"))
        .status,
    ).toBe(500);
    expect(
      (
        await omniContractTasks(
          req("/api/omni/tasks", JOBS_KEY),
          verify,
          async () => "audit-failed",
        )
      ).status,
    ).toBe(503);
  });
  it("runsToTasks distinguishes missing counts from zero", () => {
    expect(runsToTasks([{ ...RUN, fetched: null, inserted: null, alerts: null }])[0]?.title).toBe(
      "Observatory run · unknown fetched, unknown saved, unknown alerts",
    );
    expect(runsToTasks([{ ...RUN, fetched: 0, inserted: 0, alerts: 0 }])[0]?.title).toBe(
      "Observatory run · 0 fetched, 0 saved, 0 alerts",
    );
  });
});
