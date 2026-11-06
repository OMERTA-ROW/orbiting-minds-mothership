import { z } from "zod";
import { roboticsScenarios } from "@/data/evolution";
export const roboticsStorageKey = "evolution-robotics-demo-v1";
export function getRoboticsScenario(id: unknown) {
  return typeof id === "string" ? roboticsScenarios.find((s) => s.id === id) : undefined;
}
const scenarioId = z
  .string()
  .refine((v) => Boolean(getRoboticsScenario(v)), "Unknown research scenario");
const bounded = (min: number, max: number) => z.number().finite().min(min).max(max);
export const reactionConfig = z
  .object({
    model: z.literal("reaction"),
    speedMps: bounded(0, 2),
    latencyMs: bounded(0, 2000),
    clearanceM: bounded(0, 10),
    event: z.enum(["Clear fixture", "Stale sensor", "Conflicting commands", "Stop requested"]),
  })
  .strict();
export const energyConfig = z
  .object({
    model: z.literal("energy"),
    powerKw: bounded(0, 22),
    durationMin: bounded(1, 180),
    capacityKwh: bounded(1, 120),
    startPercent: bounded(0, 100),
  })
  .strict();
export const coverageConfig = z
  .object({
    model: z.literal("coverage"),
    tileCount: z.number().int().min(1).max(1000),
    ratePerMin: bounded(0, 20),
    durationMin: bounded(1, 120),
  })
  .strict();
export const roboticsConfig = z.discriminatedUnion("model", [
  reactionConfig,
  energyConfig,
  coverageConfig,
]);
export type RoboticsConfig = z.infer<typeof roboticsConfig>;
export function defaultRoboticsConfig(model: RoboticsConfig["model"]): RoboticsConfig {
  if (model === "reaction")
    return { model, speedMps: 0.5, latencyMs: 300, clearanceM: 0.8, event: "Clear fixture" };
  if (model === "energy")
    return { model, powerKw: 7, durationMin: 30, capacityKwh: 60, startPercent: 50 };
  return { model, tileCount: 100, ratePerMin: 5, durationMin: 10 };
}
const round = (n: number) => Math.round(n * 1000) / 1000;
// Educational arithmetic only: this is not robotics physics, vehicle diagnosis or submitted-code execution.
export function calculateRobotics(input: RoboticsConfig) {
  const c = roboticsConfig.parse(input);
  if (c.model === "reaction") {
    const travelM = (c.speedMps * c.latencyMs) / 1000;
    return {
      metric: round(travelM),
      unit: "m reaction travel",
      auxiliary: round(c.clearanceM - travelM),
      auxiliaryUnit: "m virtual budget remaining",
      outcome:
        c.event !== "Clear fixture"
          ? "Stop review required"
          : travelM > c.clearanceM
            ? "Outside virtual budget"
            : "Within virtual budget",
    } as const;
  }
  if (c.model === "energy") {
    const idealKwh = (c.powerKw * c.durationMin) / 60;
    const headroomKwh = c.capacityKwh * (1 - c.startPercent / 100);
    return {
      metric: round(idealKwh),
      unit: "kWh ideal input",
      auxiliary: round(headroomKwh - idealKwh),
      auxiliaryUnit: "kWh fictional headroom remaining",
      outcome: idealKwh > headroomKwh ? "Outside virtual budget" : "Within virtual budget",
    } as const;
  }
  const tiles = Math.min(c.tileCount, Math.floor(c.ratePerMin * c.durationMin));
  return {
    metric: tiles,
    unit: "fictional tiles budgeted",
    auxiliary: c.tileCount - tiles,
    auxiliaryUnit: "fictional tiles not covered",
    outcome: tiles < c.tileCount ? "Outside virtual budget" : "Within virtual budget",
  } as const;
}
const resultSchema = z.object({
  metric: z.number().finite(),
  unit: z.string(),
  auxiliary: z.number().finite(),
  auxiliaryUnit: z.string(),
  outcome: z.enum(["Within virtual budget", "Outside virtual budget", "Stop review required"]),
});
const runSchema = z
  .object({
    id: z.string().min(1).max(100),
    scenarioId,
    at: z.string().datetime(),
    operator: z.string().trim().min(2).max(80),
    config: roboticsConfig,
    result: resultSchema,
    modelVersion: z.literal("educational-arithmetic-v1"),
    hardwareEvidence: z.literal(false),
    codeExecuted: z.literal(false),
  })
  .superRefine((r, ctx) => {
    const expected = calculateRobotics(r.config);
    if (
      getRoboticsScenario(r.scenarioId)?.model !== r.config.model ||
      Object.keys(expected).some(
        (k) => expected[k as keyof typeof expected] !== r.result[k as keyof typeof expected],
      )
    )
      ctx.addIssue({ code: "custom", message: "Recorded arithmetic or scenario model mismatch" });
  });
const reviewSchema = z.object({
  id: z.string().min(1).max(100),
  runId: z.string(),
  scenarioId,
  reviewer: z.string().trim().min(2).max(80),
  note: z.string().trim().min(10).max(1200),
  decision: z.enum(["Request changes", "Ready for expert review"]),
  at: z.string().datetime(),
  authenticated: z.literal(false),
  hardwareApproval: z.literal(false),
});
export const roboticsStoreSchema = z
  .object({
    version: z.literal(1),
    runs: z.array(runSchema).max(150),
    reviews: z.array(reviewSchema).max(150),
  })
  .superRefine((s, ctx) => {
    if (
      new Set(s.runs.map((r) => r.id)).size !== s.runs.length ||
      new Set(s.reviews.map((r) => r.id)).size !== s.reviews.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate records" });
    // Historical reviews remain attached to their original run; readiness only selects the newest run.
    for (const review of s.reviews) {
      const run = s.runs.find((r) => r.id === review.runId && r.scenarioId === review.scenarioId);
      if (
        !run ||
        run.operator.toLowerCase() === review.reviewer.toLowerCase() ||
        (review.decision === "Ready for expert review" &&
          run.result.outcome !== "Within virtual budget")
      )
        ctx.addIssue({
          code: "custom",
          message: "Review must match a recorded run and distinct declared reviewer",
        });
    }
  });
export type RoboticsStore = z.infer<typeof roboticsStoreSchema>;
export const initialRoboticsStore: RoboticsStore = { version: 1, runs: [], reviews: [] };
export type RoboticsCommand =
  | { type: "run"; scenarioId: string; operator: string; config: RoboticsConfig; consent: boolean }
  | {
      type: "review";
      runId: string;
      reviewer: string;
      note: string;
      decision: "Request changes" | "Ready for expert review";
      consent: boolean;
    };
export function applyRoboticsCommand(
  current: RoboticsStore,
  command: RoboticsCommand,
  id: string,
  at: string,
): RoboticsStore {
  const store = structuredClone(roboticsStoreSchema.parse(current));
  z.string().datetime().parse(at);
  if (!command.consent) throw new Error("Explicit local rehearsal consent required");
  if (command.type === "run") {
    const scenario = getRoboticsScenario(command.scenarioId);
    const config = roboticsConfig.parse(command.config);
    if (!scenario || config.model !== scenario.model)
      throw new Error("Known scenario and matching model required");
    if (store.runs.length >= 150)
      throw new Error("Local run history full; export records before continuing");
    store.runs.push({
      id,
      scenarioId: scenario.id,
      operator: z.string().trim().min(2).max(80).parse(command.operator),
      at,
      config,
      result: calculateRobotics(config),
      modelVersion: "educational-arithmetic-v1",
      codeExecuted: false,
      hardwareEvidence: false,
    });
  } else {
    const run = store.runs.find((r) => r.id === command.runId);
    if (!run) throw new Error("Recorded run required");
    if (store.runs.filter((r) => r.scenarioId === run.scenarioId).at(-1)?.id !== run.id)
      throw new Error("Review the latest run; old reviews cannot override new evidence");
    const reviewer = z.string().trim().min(2).max(80).parse(command.reviewer);
    if (reviewer.toLowerCase() === run.operator.toLowerCase())
      throw new Error(
        "Distinct declared human reviewer required; names are not verified identities",
      );
    if (
      command.decision === "Ready for expert review" &&
      run.result.outcome !== "Within virtual budget"
    )
      throw new Error("Outside-budget or stop scenarios require changes, not readiness");
    if (store.reviews.length >= 150) throw new Error("Local review history full");
    store.reviews.push(
      reviewSchema.parse({
        ...command,
        id,
        scenarioId: run.scenarioId,
        reviewer,
        at,
        authenticated: false,
        hardwareApproval: false,
      }),
    );
  }
  return roboticsStoreSchema.parse(store);
}
export function roboticsReadiness(store: RoboticsStore, id: string) {
  const run = store.runs.filter((r) => r.scenarioId === id).at(-1);
  const review = run ? store.reviews.filter((r) => r.runId === run.id).at(-1) : undefined;
  return {
    status: review?.decision ?? (run ? "Awaiting distinct local review" : "Not rehearsed"),
    run,
    review,
    independentTests: "NOT_RUN" as const,
    hardwareApproval: false as const,
    releaseAllowed: false as const,
    certification: "NOT_CERTIFIED" as const,
  };
}
export function roboticsPassport(store: RoboticsStore, id: string) {
  const scenario = getRoboticsScenario(id);
  if (!scenario) throw new Error("Unknown research scenario");
  return {
    mode: "LOCAL_DEMO",
    scenario,
    assessment: roboticsReadiness(store, id),
    runs: store.runs.filter((r) => r.scenarioId === id),
    reviews: store.reviews.filter((r) => r.scenarioId === id),
    artifactDigest: null,
    signature: null,
    tamperEvident: false,
    authenticated: false,
    ownerApproval: "NOT_VERIFIED",
    domainExpert: "NOT_VERIFIED",
    physicalEstop: "NOT_TESTED",
    deployment: "DISABLED",
    rollback: "NOT_TESTED",
    hardwareConnections: [],
    submittedCodeExecuted: false,
  };
}
export function filterRobotics(query: string, category: string, model = "") {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return roboticsScenarios.filter(
    (s) =>
      (!category || s.category === category) &&
      (!model || s.model === model) &&
      terms.every((t) =>
        `${s.title} ${s.problem} ${s.author} ${s.operator ?? ""} ${s.compatibility} ${s.dataset.name} ${s.category}`
          .toLowerCase()
          .includes(t),
      ),
  );
}
export function roboticsPresetSearch(search: Record<string, unknown>): {
  scenario?: string | undefined;
} {
  return { scenario: getRoboticsScenario(search["scenario"])?.id };
}

export function roboticsChallengeDraft(id: unknown) {
  const scenario = getRoboticsScenario(id);
  return scenario
    ? {
        title: scenario.title,
        domain: scenario.domain,
        problem: `${scenario.problem}\nResearch only; hardware release blocked. ${scenario.risks.join("; ")}`,
        acceptance: scenario.acceptance,
      }
    : undefined;
}
