import { z } from "zod";

export const workflowEstimateInput = z.object({
  name: z.string().trim().min(1).max(80),
  requestsPerMonth: z.number().finite().min(0).max(100_000_000),
  inputTokensPerRequest: z.number().finite().min(0).max(10_000_000),
  outputTokensPerRequest: z.number().finite().min(0).max(10_000_000),
  inputRatePerMillion: z.number().finite().min(0).max(1_000_000),
  outputRatePerMillion: z.number().finite().min(0).max(1_000_000),
  fixedMonthlyCost: z.number().finite().min(0).max(100_000_000),
});
export type WorkflowEstimateInput = z.infer<typeof workflowEstimateInput>;

export function estimateWorkflow(raw: WorkflowEstimateInput) {
  const v = workflowEstimateInput.parse(raw);
  const inputTokens = v.requestsPerMonth * v.inputTokensPerRequest;
  const outputTokens = v.requestsPerMonth * v.outputTokensPerRequest;
  const inputCost = (inputTokens / 1_000_000) * v.inputRatePerMillion;
  const outputCost = (outputTokens / 1_000_000) * v.outputRatePerMillion;
  const monthlyCost = inputCost + outputCost + v.fixedMonthlyCost;
  return {
    name: v.name,
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
    fixedMonthlyCost: v.fixedMonthlyCost,
    monthlyCost,
    perRequestCost: v.requestsPerMonth > 0 ? monthlyCost / v.requestsPerMonth : null,
  };
}

export function compareWorkflows(rows: WorkflowEstimateInput[]) {
  const estimates = rows.map(estimateWorkflow);
  const lowest = estimates.length ? Math.min(...estimates.map((e) => e.monthlyCost)) : 0;
  return estimates.map((e) => ({ ...e, differenceFromLowest: e.monthlyCost - lowest }));
}
