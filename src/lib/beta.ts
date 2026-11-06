import { z } from "zod";

export function assertNonSensitive(text: string) {
  if (/cyber[\s_-]*link/i.test(text))
    throw new Error("CyberLink Social is excluded from Evolution.");
  if (
    /sk-[a-z0-9_-]{12,}|-----BEGIN .*PRIVATE KEY|\b(?:password|api[_ -]?key|secret|token)\s*[:=]\s*\S+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(
      text,
    )
  ) {
    throw new Error(
      "Possible credentials or personal data detected. Remove them before continuing. This is a pattern check, not a privacy guarantee.",
    );
  }
}
const safe = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .superRefine((v, ctx) => {
      try {
        assertNonSensitive(v);
      } catch (e) {
        ctx.addIssue({
          code: "custom",
          message: e instanceof Error ? e.message : "Sensitive input",
        });
      }
    });
export const betaProjectInput = z
  .object({
    name: safe(100).refine((v) => v.length >= 2, "Use at least 2 characters"),
    brief: safe(2000),
  })
  .strict();
export const betaAgentInput = z
  .object({
    projectId: z.string().uuid(),
    name: safe(100).refine((v) => v.length >= 2),
    provider: safe(100).refine((v) => v.length >= 2),
    model: safe(100).refine((v) => v.length >= 2),
    scope: safe(500),
    consent: z.literal(true),
  })
  .strict();
export const liveOmniInput = z
  .object({
    projectId: z.string().uuid(),
    message: safe(2000).refine((v) => v.length >= 3),
    consent: z.literal(true),
  })
  .strict();
export function assertBetaAiAccess(access: { ai_approved: boolean; paused: boolean } | null) {
  if (!access?.ai_approved)
    throw new Error("AI beta access awaits founder approval. No model request was sent.");
  if (access.paused)
    throw new Error("Your account’s AI requests are paused. No model request was sent.");
}
export type OmniEvent =
  | { type: "text" | "thinking"; text: string }
  | { type: "error"; message: string; status: number }
  | {
      type: "done";
      inputTokens: number | null;
      outputTokens: number | null;
      totalTokens: number | null;
      actualCharge: null;
      runId: string | null;
    };
