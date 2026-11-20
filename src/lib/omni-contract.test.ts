import { describe, expect, it } from "vitest";
import { omniContractRead, omniContractUnsupported } from "./omni-contract.server";
import { buildManifest } from "./omni-contract";
import { sha256Hex } from "./omni-api-keys";

const HEALTH_KEY = "omni_" + "a".repeat(48);
const JOBS_KEY = "omni_" + "b".repeat(48);
const keys = new Map<string, string[]>();
const ready = (async () => {
  keys.set(await sha256Hex(HEALTH_KEY), ["health"]);
  keys.set(await sha256Hex(JOBS_KEY), ["jobs"]);
})();
const verify = async (hash: string, scope: string) =>
  keys.get(hash)?.includes(scope) ? "key-id" : null;
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
  it("a jobs-only key is valid but gets 403 for health and manifest", async () => {
    await ready;
    const r = await omniContractRead(req("/api/omni/manifest", JOBS_KEY), "manifest", verify);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: "scope_missing", needs: "health" });
  });
  it("manifest never claims autonomy, providers or an enrolled chat agent", () => {
    const m = buildManifest("https://evoomni.tech");
    expect(m.autonomous).toBe(false);
    expect(m.providers).toEqual([]);
    expect(m.agents.every((a) => !a.enrolled)).toBe(true);
    expect(m.capabilities).toMatchObject({ chat: false, tasks: false, emergencyStop: false });
    expect(m.links.terminal).toBe("https://evoomni.tech/omni-terminal");
  });
  it("advertises no links on a non-https origin", () => {
    expect(buildManifest(null).links).toEqual({});
  });
  it("chat, tasks, decisions and stop are refused with 403 even for valid keys", async () => {
    await ready;
    for (const [path, cap, method] of [
      ["/api/omni/chat", "chat", "POST"],
      ["/api/omni/tasks", "tasks", "GET"],
      ["/api/omni/tasks/t1/approve", "task-decision", "POST"],
      ["/api/omni/emergency-stop", "emergency-stop", "POST"],
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
});
