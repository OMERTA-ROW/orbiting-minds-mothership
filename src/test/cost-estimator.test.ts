import { describe, expect, it } from "vitest";
import { compareWorkflows, estimateWorkflow, workflowEstimateInput } from "@/lib/cost-estimator";
const sample = { name: "My workflow", requestsPerMonth: 1000, inputTokensPerRequest: 2000, outputTokensPerRequest: 500, inputRatePerMillion: 3, outputRatePerMillion: 12, fixedMonthlyCost: 0 };
describe("offline usage estimates", () => {
  it("prices input tokens independently at the entered per-million rate", () => expect(estimateWorkflow(sample).inputCost).toBe(6));
  it("prices output tokens independently at the entered per-million rate", () => expect(estimateWorkflow(sample).outputCost).toBe(6));
  it("adds optional fixed costs without requiring a subscription", () => expect(estimateWorkflow({ ...sample, fixedMonthlyCost: 5 }).monthlyCost).toBe(17));
  it("compares optional workflows using their own rates and usage", () => expect(compareWorkflows([sample, { ...sample, inputRatePerMillion: 1, outputRatePerMillion: 4 }]).map(v => v.differenceFromLowest)).toEqual([8, 0]));
  it("returns no per-request cost when zero requests are expected", () => expect(estimateWorkflow({ ...sample, requestsPerMonth: 0, fixedMonthlyCost: 5 })).toMatchObject({ monthlyCost: 5, perRequestCost: null }));
  it("does not substitute a default rate for missing or non-finite input", () => { for (const n of [NaN, Infinity, -1]) expect(workflowEstimateInput.safeParse({ ...sample, inputRatePerMillion: n }).success).toBe(false); });
  it("permits explicitly entered zero rates without claiming an entitlement", () => expect(estimateWorkflow({ ...sample, inputRatePerMillion: 0, outputRatePerMillion: 0 }).monthlyCost).toBe(0));
});