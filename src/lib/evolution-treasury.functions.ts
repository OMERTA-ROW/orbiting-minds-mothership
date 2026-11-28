import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMfaFresh } from "./activation-approvals";
import {
  treasuryAccountInput,
  treasuryJournalIdInput,
  treasuryLimitsInput,
  treasuryMutationSchema,
  treasuryPostInput,
  treasuryPrepareInput,
  treasuryRecipientInput,
  treasurySnapshotSchema,
} from "./evolution-treasury";

type Context = {
  supabase: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0];
  userId: string;
  claims: Record<string, unknown>;
};

async function owner(context: Context) {
  setResponseHeader("Cache-Control", "private, no-store");
  const { requireRazulOwner } = await import("./razul-owner.server");
  await requireRazulOwner(context.supabase, context.userId, context.claims);
  return context.supabase;
}

function fresh(context: Context) {
  if (!isMfaFresh(context.claims["amr"], Math.floor(Date.now() / 1000))) {
    throw new Error("Confirm your authenticator code within the last 15 minutes, then retry.");
  }
}

function failure(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

export const readEvolutionTreasury = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await owner(context);
    const result = await db.rpc("evolution_treasury_read_snapshot");
    if (result.error) failure(result.error, "Internal Treasury records could not be read.");
    return treasurySnapshotSchema.parse(result.data);
  });

export const createTreasuryAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => treasuryAccountInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = await owner(context);
    const result = await db.rpc("evolution_treasury_create_account", {
      _name: data.name,
      _per_transfer_limit: data.perTransferLimit,
      _daily_limit: data.dailyLimit,
      _request_id: data.requestId,
    });
    if (result.error) failure(result.error, "The internal account could not be created.");
    return treasuryMutationSchema.parse(result.data);
  });

export const verifyTreasuryRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => treasuryRecipientInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = await owner(context);
    fresh(context);
    const result = await db.rpc("evolution_treasury_verify_recipient", {
      _account_id: data.accountId,
      _expected_name: data.expectedName,
    });
    if (result.error) failure(result.error, "The internal recipient could not be verified.");
    return treasuryMutationSchema.parse(result.data);
  });

export const setTreasuryLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => treasuryLimitsInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = await owner(context);
    fresh(context);
    const result = await db.rpc("evolution_treasury_set_limits", {
      _account_id: data.accountId,
      _per_transfer_limit: data.perTransferLimit,
      _daily_limit: data.dailyLimit,
    });
    if (result.error) failure(result.error, "The internal-unit limits could not be saved.");
    return treasuryMutationSchema.parse(result.data);
  });

export const prepareTreasuryJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => treasuryPrepareInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = await owner(context);
    const result = await db.rpc("evolution_treasury_prepare_journal", {
      _kind: data.kind,
      // These SQL arguments are nullable; generated RPC types currently mark them as required strings.
      _source: data.sourceAccountId as string,
      _destination: data.destinationAccountId as string,
      _amount: data.amountUnits,
      _note: data.note,
      _request_id: data.requestId,
    });
    if (result.error) failure(result.error, "The internal journal could not be prepared.");
    return treasuryMutationSchema.parse(result.data);
  });

export const postTreasuryJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => treasuryPostInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = await owner(context);
    fresh(context);
    const result = await db.rpc("evolution_treasury_post_journal", {
      _journal_id: data.journalId,
      _amount_confirmation: data.amountConfirmation,
    });
    if (result.error) failure(result.error, "The internal journal could not be posted.");
    return treasuryMutationSchema.parse(result.data);
  });

export const cancelTreasuryJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => treasuryJournalIdInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = await owner(context);
    const result = await db.rpc("evolution_treasury_cancel_journal", {
      _journal_id: data.journalId,
    });
    if (result.error) failure(result.error, "The pending internal journal could not be cancelled.");
    return treasuryMutationSchema.parse(result.data);
  });
