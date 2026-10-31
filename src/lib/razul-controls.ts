import { z } from "zod";

export const RAZUL_AGENTS = ["jackboy", "jax", "omni", "sabrina", "guardian", "hercules"] as const;
export const razulControlInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pause"), confirm: z.literal(true) }).strict(),
  z
    .object({
      action: z.literal("configure"),
      confirm: z.literal(true),
      threshold: z.number().int().min(0).max(100),
      retentionDays: z.number().int().min(7).max(365),
      coverage: z.array(z.string().min(1).max(40)).max(22),
      blockedSources: z.array(z.string().min(1).max(100)).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("subscription"),
      confirm: z.literal(true),
      agent: z.enum(RAZUL_AGENTS),
      categories: z.array(z.string().min(1).max(40)).max(22),
      floor: z.number().int().min(0).max(100),
      enabled: z.boolean(),
    })
    .strict(),
]);
export type RazulControlInput = z.infer<typeof razulControlInput>;

export function sourceCheckState(
  check: { checked_at: string; status: string } | undefined,
  readAt: string,
) {
  if (!check) return "unknown";
  const age = Date.parse(readAt) - Date.parse(check.checked_at);
  if (!Number.isFinite(age) || age < 0) return "unknown";
  if (check.status === "failed") return "last check failed";
  return age > 24 * 3600_000 ? "stale" : "recent receipt";
}

/** Authoritative RPC parameters only; text never grants scopes or starts an executor. */
export async function applyRazulControl(
  deps: {
    authorize: () => Promise<void>;
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
  },
  input: unknown,
) {
  const data = razulControlInput.parse(input);
  await deps.authorize();
  const command =
    data.action === "pause"
      ? { name: "razul_pause", args: { _reason: "Paused by verified owner" } }
      : data.action === "configure"
        ? {
            name: "razul_configure",
            args: {
              _threshold: data.threshold,
              _retention_days: data.retentionDays,
              _coverage: data.coverage,
              _blocked_sources: data.blockedSources,
            },
          }
        : {
            name: "razul_set_subscription",
            args: {
              _agent: data.agent,
              _categories: data.categories,
              _floor: data.floor,
              _enabled: data.enabled,
            },
          };
  const result = await deps.rpc(command.name, command.args);
  if (result.error) throw new Error("Owner setting was not saved. No success is confirmed.");
  return { saved: true as const, action: data.action };
}
