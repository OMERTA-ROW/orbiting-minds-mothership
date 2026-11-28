import { z } from "zod";
import { noteProblem } from "./activation-approvals";

export const TREASURY_UNIT_LIMIT = 1_000_000_000;
const uuid = z.string().uuid();
const units = z.number().int().min(1).max(TREASURY_UNIT_LIMIT);
const note = z
  .string()
  .max(280)
  .default("")
  .refine(
    (value) => noteProblem(value) === null,
    "Remove possible credentials and keep notes under 280 characters.",
  );

export const treasuryAccountInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    perTransferLimit: units,
    dailyLimit: units,
    requestId: uuid,
  })
  .strict()
  .refine((value) => value.dailyLimit >= value.perTransferLimit, {
    message: "The daily limit must be at least the per-transfer limit.",
    path: ["dailyLimit"],
  });

export const treasuryRecipientInput = z
  .object({ accountId: uuid, expectedName: z.string().trim().min(2).max(80) })
  .strict();

export const treasuryLimitsInput = z
  .object({ accountId: uuid, perTransferLimit: units, dailyLimit: units })
  .strict()
  .refine((value) => value.dailyLimit >= value.perTransferLimit, {
    message: "The daily limit must be at least the per-transfer limit.",
    path: ["dailyLimit"],
  });

export const treasuryPrepareInput = z
  .object({
    kind: z.enum(["opening", "income", "expense", "transfer"]),
    sourceAccountId: uuid.nullable().default(null),
    destinationAccountId: uuid.nullable().default(null),
    amountUnits: units,
    note,
    requestId: uuid,
  })
  .strict()
  .superRefine((value, context) => {
    const valid =
      ((value.kind === "opening" || value.kind === "income") &&
        value.sourceAccountId === null &&
        value.destinationAccountId !== null) ||
      (value.kind === "expense" &&
        value.sourceAccountId !== null &&
        value.destinationAccountId === null) ||
      (value.kind === "transfer" &&
        value.sourceAccountId !== null &&
        value.destinationAccountId !== null &&
        value.sourceAccountId !== value.destinationAccountId);
    if (!valid) {
      context.addIssue({
        code: "custom",
        message: "Choose the correct source and recipient for this internal journal.",
        path: ["kind"],
      });
    }
  });

export const treasuryPostInput = z.object({ journalId: uuid, amountConfirmation: units }).strict();
export const treasuryJournalIdInput = z.object({ journalId: uuid }).strict();

const treasuryAccount = z.object({
  id: uuid,
  name: z.string(),
  status: z.enum(["active", "frozen"]),
  verifiedAt: z.string().nullable(),
  perTransferLimitUnits: z.number().int(),
  dailyLimitUnits: z.number().int(),
  balanceUnits: z.number().int(),
  dailyOutUnits: z.number().int(),
});

const treasuryJournal = z.object({
  id: uuid,
  kind: z.enum(["opening", "income", "expense", "transfer"]),
  amountUnits: z.number().int(),
  note: z.string(),
  status: z.enum(["pending", "posted", "cancelled"]),
  createdAt: z.string(),
  expiresAt: z.string(),
  postedAt: z.string().nullable(),
  sourceAccountId: uuid.nullable(),
  destinationAccountId: uuid.nullable(),
  sourceName: z.string().nullable(),
  destinationName: z.string().nullable(),
});

const treasuryAudit = z.object({
  id: z.number().int(),
  action: z.string(),
  journalId: uuid.nullable(),
  accountId: uuid.nullable(),
  createdAt: z.string(),
});

export const treasurySnapshotSchema = z.object({
  checkedAt: z.string(),
  realMoney: z.literal(false),
  unitName: z.literal("internal units"),
  accounts: z.array(treasuryAccount),
  journals: z.array(treasuryJournal),
  audit: z.array(treasuryAudit),
});

export const treasuryMutationSchema = z.object({
  ok: z.literal(true),
  accountId: uuid.optional(),
  journalId: uuid.optional(),
  amountUnits: z.number().int().optional(),
  status: z.string().optional(),
  existing: z.boolean().optional(),
});

export type TreasurySnapshot = z.infer<typeof treasurySnapshotSchema>;
export type TreasuryAccount = z.infer<typeof treasuryAccount>;
export type TreasuryJournal = z.infer<typeof treasuryJournal>;

export function formatInternalUnits(value: number): string {
  return `${new Intl.NumberFormat("en-US").format(value)} units`;
}
