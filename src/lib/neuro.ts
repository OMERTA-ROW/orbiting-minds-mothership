import { z } from "zod";

export const NEURO_FIELDS = [
  "knowledge",
  "reasoning",
  "memory",
  "learning",
  "evaluations",
  "version",
  "evidence",
] as const;
export const NEURO_PATHWAYS = [
  "omni",
  "code",
  "jackboy",
  "evolution",
  "razul",
  "guardian",
  "jax",
  "hercules",
  "cyberlink",
  "honeycomb",
  "legacy",
  "x-federal",
  "neuro",
] as const;
const text = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (s) =>
      !/-----BEGIN .*PRIVATE KEY|sk-[a-z0-9_-]{12,}|\b(?:password|api[_ -]?key|secret|token)\s*[:=]\s*\S+/i.test(
        s,
      ),
    "Remove credentials and private keys. This registry stores boundary notes, not secrets.",
  );
export const neuroProfile = z
  .object({
    knowledge: text,
    reasoning: text,
    memory: text,
    learning: text,
    evaluations: text,
    version: text.pipe(z.string().min(1).max(80)),
    evidence: text,
  })
  .strict();
export type NeuroProfile = z.infer<typeof neuroProfile>;
export const emptyNeuroProfile: NeuroProfile = {
  knowledge: "",
  reasoning: "",
  memory: "",
  learning: "",
  evaluations: "",
  version: "",
  evidence: "",
};
export const neuroRegisterInput = z
  .object({
    key: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    name: text.pipe(z.string().min(1).max(120)),
  })
  .strict();
export const neuroChangeInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("propose"),
      componentId: z.string().uuid(),
      expected: z.number().int().min(0),
      profile: neuroProfile,
    })
    .strict(),
  z
    .object({
      action: z.enum(["scope_review", "approved", "rollback"]),
      componentId: z.string().uuid(),
      expected: z.number().int().min(0),
      target: z.number().int().positive(),
      note: text.pipe(z.string().min(10)),
      confirm: z.literal(true),
    })
    .strict(),
]);

// Verified existing Mothership control pages only; no external project URL implies enrollment.
export function neuroDestination(key: string) {
  if (key === "omni") return { to: "/omni-terminal" as const, label: "OMNI controls" };
  if (key === "razul") return { to: "/omni-razul" as const, label: "Razul Observatory" };
  if (key === "evolution") return { to: "/projects" as const, label: "My Projects" };
  return null;
}
