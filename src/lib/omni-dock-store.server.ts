/** Service-role dock storage. Only called after the request handler verified the device signature. */
import type { DockStore, StoreReply } from "./omni-dock.server";

function asReply(data: unknown, error: unknown): StoreReply {
  if (error || !data || typeof data !== "object") return { ok: false, reason: "unavailable" };
  return data as StoreReply;
}

export async function adminDockStore(): Promise<DockStore> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  return {
    async claim(a) {
      const { data, error } = await db.rpc("omni_dock_claim", {
        _code_hash: a.codeHash,
        _label: a.label,
        _platform: a.platform,
        _public_key: a.publicKey,
        _fingerprint: a.fingerprint,
        _app_version: a.appVersion,
        _capabilities: a.capabilities,
      });
      return asReply(data, error);
    },
    async loadDevice(id) {
      const { data, error } = await db.from("omni_dock_devices").select("public_key").eq("id", id).maybeSingle();
      return error ? null : data;
    },
    async touch(a) {
      const { data, error } = await db.rpc("omni_dock_touch", {
        _device: a.device,
        _nonce: a.nonce,
        _event: a.event,
        _capabilities: a.capabilities as string[],
        _app_version: a.appVersion as string,
      });
      return asReply(data, error);
    },
    async log(device, event, outcome, detail) {
      await db.rpc("omni_dock_log", {
        _device: device as string,
        _event: event,
        _outcome: outcome,
        _detail: detail,
      });
    },
    async stopEngaged() {
      const { data, error } = await db
        .from("omni_terminal_controls")
        .select("emergency_stop")
        .eq("id", 1)
        .maybeSingle();
      return Boolean(error) || data?.emergency_stop !== false;
    },
    async engageStop(device) {
      const { data, error } = await db.rpc("omni_dock_engage_stop", { _device: device });
      return !error && data === true;
    },
    async holdTask(device, job) {
      const { data, error } = await db.rpc("omni_dock_hold_task", {
        _device: device,
        _id: job.id,
        _kind: job.kind,
        _agent: job.agent,
        _project: job.project,
        _repository: job.repository as string,
        _instructions: job.instructions,
      });
      return asReply(data, error);
    },
  };
}
