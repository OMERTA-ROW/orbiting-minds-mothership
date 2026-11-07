import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const grantInput = z
  .object({
    grantId: z.string().uuid(),
    jackboyOwnerId: z.string().uuid(),
    projectId: z.string().uuid(),
    jobId: z.string().uuid(),
    repo: z
      .string()
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
      .max(200),
    instructions: z.string().min(3).max(4000),
    expiresAt: z.string().datetime({ offset: true }),
    confirm: z.literal(true),
  })
  .strict();

type Rpc = (
  name: string,
  args: Record<string, string | null>,
) => Promise<{ data: unknown; error: unknown }>;

export const approveJackboyReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => grantInput.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const { assertEmergencyStopReleased } = await import("./omni-terminal.server");
    await assertEmergencyStopReleased(context.supabase);
    const { dispatchPayloadDigest } = await import("./jackboy-dispatch-digest");
    const payloadDigest = await dispatchPayloadDigest({
      ownerId: data.jackboyOwnerId,
      projectId: data.projectId,
      grantId: data.grantId,
      jobId: data.jobId,
      repo: data.repo,
      kind: "test",
      instructions: data.instructions,
    });
    const rpc = context.supabase.rpc.bind(context.supabase) as unknown as Rpc;
    const result = await rpc("jackboy_dispatch_owner_grant", {
      _op: "issue",
      _id: data.grantId,
      _jackboy_owner: data.jackboyOwnerId,
      _project: data.projectId,
      _job: data.jobId,
      _repo: data.repo,
      _digest: payloadDigest,
      _expires: data.expiresAt,
    });
    if (result.error) throw new Error("Receipt grant could not be approved.");
    const grant = z
      .object({ id: z.string().uuid(), expiresAt: z.string(), revoked: z.boolean() })
      .parse(result.data);
    return { ...grant, payloadDigest };
  });

export const revokeJackboyReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ grantId: z.string().uuid(), confirm: z.literal(true) })
      .strict()
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const rpc = context.supabase.rpc.bind(context.supabase) as unknown as Rpc;
    const result = await rpc("jackboy_dispatch_owner_grant", {
      _op: "revoke",
      _id: data.grantId,
      _jackboy_owner: null,
      _project: null,
      _job: null,
      _repo: null,
      _digest: null,
      _expires: null,
    });
    if (result.error) throw new Error("Receipt grant could not be revoked.");
    return z
      .object({ id: z.string().uuid(), expiresAt: z.string(), revoked: z.literal(true) })
      .parse(result.data);
  });

export const sendJackboyCallback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ jobId: z.string().uuid(), confirm: z.literal(true) })
      .strict()
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const { assertEmergencyStopReleased } = await import("./omni-terminal.server");
    await assertEmergencyStopReleased(context.supabase);
    if (process.env["JACKBOY_CALLBACK_ENABLED"] !== "true")
      throw new Error("Dispatch callback is disabled.");
    const origin = process.env["JACKBOY_CALLBACK_ORIGIN"];
    const caFile = process.env["JACKBOY_CALLBACK_CA_FILE"];
    const clientId = process.env["JACKBOY_CALLBACK_CLIENT_ID"];
    const secret = process.env["JACKBOY_CALLBACK_HMAC_SECRET"];
    if (!origin || !caFile || !clientId || !secret)
      throw new Error("Dispatch callback configuration is incomplete.");
    const rpc = context.supabase.rpc.bind(context.supabase) as unknown as Rpc;
    const prepared = await rpc("jackboy_dispatch_callback_snapshot", {
      _op: "prepare",
      _job: data.jobId,
      _expected_status: null,
    });
    if (prepared.error) throw new Error("Callback authorization or audit failed.");
    const { callbackSnapshotSchema, sendDispatchCallback } =
      await import("./jackboy-dispatch-callback.server");
    const snapshot = callbackSnapshotSchema.parse(prepared.data);
    const { readFile } = await import("node:fs/promises");
    const result = await sendDispatchCallback(
      { origin, ca: await readFile(caFile), clientId, secret },
      snapshot,
    );
    const ack = await rpc("jackboy_dispatch_callback_snapshot", {
      _op: "ack",
      _job: data.jobId,
      _expected_status: result.status,
    });
    if (ack.error)
      throw new Error("Callback may have arrived but audit failed; reconcile before retrying.");
    return result;
  });
