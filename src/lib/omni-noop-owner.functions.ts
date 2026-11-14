import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    hours: z.number().int().min(1).max(24),
    confirm: z.literal(true),
  })
  .strict();
const revokeInput = z.object({ id: z.string().uuid(), confirm: z.literal(true) }).strict();
const enqueueInput = z
  .object({
    durationMs: z.number().int().min(1000).max(30000),
    confirm: z.literal(true),
  })
  .strict();

export const listNoopWorkers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const result = await context.supabase.rpc("omni_noop_workers_list");
    if (result.error) throw new Error("Worker identities could not be read.");
    return result.data;
  });

export const listNoopJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const result = await context.supabase.rpc("omni_noop_jobs_list");
    if (result.error) throw new Error("No-op jobs could not be read.");
    return result.data;
  });

export const createNoopWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createInput.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const { randomBytes, createHash } = await import("node:crypto");
    const secret = `omni_worker_${randomBytes(32).toString("hex")}`;
    const hash = createHash("sha256").update(secret).digest("hex");
    const result = await context.supabase.rpc("omni_noop_worker_create", {
      _name: data.name,
      _hash: hash,
      _hours: data.hours,
    });
    if (result.error || !result.data) throw new Error("Worker identity could not be created.");
    return { id: result.data, secret };
  });

export const revokeNoopWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => revokeInput.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const result = await context.supabase.rpc("omni_noop_worker_revoke", { _id: data.id });
    if (result.error) throw new Error("Worker identity could not be revoked.");
    return { revoked: true };
  });

export const enqueueNoopJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => enqueueInput.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const result = await context.supabase.rpc("omni_noop_enqueue", {
      _duration_ms: data.durationMs,
    });
    if (result.error || !result.data) throw new Error("No-op job could not be queued.");
    return { id: result.data };
  });
