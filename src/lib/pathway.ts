import { z } from "zod";
import { modules } from "@/data/evolution";

export const conceptSchema = z
  .object({
    concept: z
      .string()
      .trim()
      .min(30, "Describe your concept in at least 30 characters.")
      .max(6000, "Keep your concept within 6,000 characters."),
    goal: z.string().trim().max(1000),
    consent: z.literal(true, {
      error: "Confirm that you want to send this concept to Lovable AI.",
    }),
  })
  .strict();

// Keep the model's wire schema strict and unconstrained; validate business rules after generation.
export const pathwaySchema = z
  .object({
    title: z.string(),
    summary: z.string(),
    assumptions: z.array(z.string()),
    modules: z.array(
      z.object({ moduleId: z.string(), rationale: z.string(), contribution: z.string() }).strict(),
    ),
    steps: z.array(
      z
        .object({
          title: z.string(),
          moduleId: z.string(),
          action: z.string(),
          deliverable: z.string(),
        })
        .strict(),
    ),
    sandboxChecks: z.array(
      z.object({ title: z.string(), procedure: z.string(), passCriteria: z.string() }).strict(),
    ),
    risks: z.array(z.string()),
    approval: z.string(),
    rollback: z.string(),
  })
  .strict();

export type EvolutionPathway = z.infer<typeof pathwaySchema>;
type DeepPartial<T> =
  T extends Array<infer U>
    ? Array<DeepPartial<U> | undefined>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> | undefined }
      : T;
export type PartialPathway = DeepPartial<EvolutionPathway>;
export type PathwayEvent =
  | { type: "thinking"; text: string }
  | { type: "partial"; pathway: PartialPathway }
  | { type: "result"; pathway: EvolutionPathway }
  | { type: "error"; message: string; status: number };

export function validatePathway(value: unknown): EvolutionPathway {
  const pathway = pathwaySchema.parse(value);
  const ids = new Set(modules.map((m) => m.id));
  if (
    pathway.modules.length === 0 ||
    pathway.steps.length === 0 ||
    pathway.sandboxChecks.length === 0
  ) {
    throw new Error("The pathway is incomplete. No validation has been performed.");
  }
  if ([...pathway.modules, ...pathway.steps].some((m) => !ids.has(m.moduleId))) {
    throw new Error(
      "The pathway references an unknown Mothership module. No validation has been performed.",
    );
  }
  if (!pathway.approval.trim() || !pathway.rollback.trim()) {
    throw new Error("The pathway is missing its owner approval or rollback plan.");
  }
  return pathway;
}

export function parsePathwayLine(line: string): PathwayEvent {
  const event = JSON.parse(line) as PathwayEvent;
  if (event.type === "result") return { ...event, pathway: validatePathway(event.pathway) };
  if (!["thinking", "partial", "error"].includes(event.type))
    throw new Error("An unexpected generation response was received.");
  return event;
}
