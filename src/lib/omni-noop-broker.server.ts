import { createHash } from "node:crypto";
import { z } from "zod";
import { JackboyLink, configuredJackboyLink, type PermitRequest } from "./jackboy-link.server";
import { databasePermitStore } from "./jackboy-permit.server";
import { syncJackboySafety } from "./jackboy-safety.server";

const DIGEST = "9903e100e835979c05c1664f2eac28a97ba4884a56e0f62807a22e43b04d8633";
const message = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }).strict(),
  z
    .object({ action: z.enum(["heartbeat", "complete", "cancel"]), job: z.string().uuid() })
    .strict(),
]);
const resultSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
  job: z.string().uuid().nullable().optional(),
  durationMs: z.number().int().optional(),
  leaseMs: z.number().int().optional(),
  status: z.string().optional(),
});
type Action = "inspect" | "check" | "claim" | "start" | "heartbeat" | "complete" | "cancel";
type Result = z.infer<typeof resultSchema>;
type Deps = {
  action(hash: string, action: Action, job?: string): Promise<Result>;
  safety(): Promise<boolean>;
  permit(job: string, first: boolean): Promise<void>;
  release(job: string): Promise<void>;
};

const json = (status: number, body: object) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function boundedBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("body_missing");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("body_timeout"));
    }, 3000);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        void reader.cancel().catch(() => {});
        throw new Error("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer!);
    if (timedOut) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}

/** Workers can request only no-op jobs. They never receive Jackboy or database credentials. */
export async function handleNoopWorker(request: Request, deps: Deps): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (omni_worker_[a-f0-9]{64})$/)?.[1];
  if (!token) return json(401, { error: "identity_invalid" });
  const hash = createHash("sha256").update(token).digest("hex");
  let input: z.infer<typeof message>;
  try {
    input = message.parse(JSON.parse(await boundedBody(request)));
  } catch {
    return json(400, { error: "invalid_request" });
  }
  let job: string | undefined;
  try {
    if (!(await deps.action(hash, "inspect")).ok) return json(401, { error: "identity_invalid" });
    if (input.action === "cancel") {
      const cancelled = await deps.action(hash, "cancel", input.job);
      if (!cancelled.ok) return json(409, { error: "job_unavailable" });
      await deps.release(input.job);
      return json(200, { ok: true });
    }
    if (input.action !== "claim") {
      const check = await deps.action(hash, "check", input.job);
      if (!check.ok || check.status !== "running") return json(409, { error: "job_unavailable" });
      job = input.job;
    }
    if (!(await deps.safety())) {
      if (job) {
        await deps.action(hash, "cancel", job);
        await deps.release(job);
      }
      return json(409, { error: "safety_blocked" });
    }
    if (input.action === "claim") {
      const claimed = await deps.action(hash, "claim");
      if (!claimed.ok) return json(409, { error: claimed.reason ?? "claim_denied" });
      if (!claimed.job) return json(200, { ok: true, job: null });
      job = claimed.job;
      await deps.permit(job, true);
      const started = await deps.action(hash, "start", job);
      if (!started.ok) throw new Error("start_denied");
      return json(200, { ok: true, job, durationMs: claimed.durationMs, leaseMs: started.leaseMs });
    }
    if (!job) throw new Error("job_missing");
    await deps.permit(job, false);
    const updated = await deps.action(hash, input.action, job);
    if (!updated.ok) throw new Error("transition_denied");
    if (input.action === "complete") await deps.release(job);
    return json(200, { ok: true, leaseMs: updated.leaseMs });
  } catch {
    if (job) {
      try {
        await deps.action(hash, "cancel", job);
        await deps.release(job);
      } catch {
        return json(503, { error: "cleanup_failed" });
      }
    }
    return json(503, { error: "worker_stopped" });
  }
}

let client: Promise<JackboyLink> | undefined;
async function getClient(): Promise<JackboyLink> {
  if (!client) {
    client = (async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return new JackboyLink(await configuredJackboyLink(), async (event, jobId) => {
        const { error } = await supabaseAdmin.from("razul_control_audit").insert({
          actor_id: null,
          action: event,
          record_type: "jackboy_link",
          record_id: jobId ?? "noop_worker",
        });
        if (error) throw new Error("audit_failed");
      });
    })();
  }
  try {
    return await client;
  } catch (error) {
    client = undefined;
    throw error;
  }
}

export async function productionNoopDeps(): Promise<Deps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const store = databasePermitStore(supabaseAdmin);
  return {
    async action(hash, action, job) {
      const args = { _hash: hash, _op: action, ...(job ? { _job: job } : {}) };
      const { data, error } = await supabaseAdmin.rpc("omni_noop_worker_action", args);
      if (error) throw new Error("worker_store_unavailable");
      return resultSchema.parse(data);
    },
    async safety() {
      const link = await getClient();
      const result = await syncJackboySafety(supabaseAdmin, { read: () => link.safety() });
      return result.checked && result.state === "clear";
    },
    async permit(job, first) {
      const req: PermitRequest = { jobId: job, kind: "autonomous", digest: DIGEST, estimateUsd: 1 };
      const permit = await (await getClient()).requestPermit(req, null);
      const recorded = await store.record(req, permit);
      if (recorded !== (first ? "issued" : "renewed")) throw new Error("permit_not_recorded");
    },
    async release(job) {
      await (await getClient()).releasePermit(job);
      await store.close(job, "released", "released_by_omni");
    },
  };
}
