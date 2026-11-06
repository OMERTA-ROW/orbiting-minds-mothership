import { z } from "zod";
import { codeContributions, type CodeContribution, type ExchangeLocale } from "@/data/evolution";

export interface ExchangeFilters {
  query: string;
  language: string;
  industry: string;
  readiness: string;
  license: string;
  authorType: string;
}
export const emptyExchangeFilters: ExchangeFilters = {
  query: "",
  language: "",
  industry: "",
  readiness: "",
  license: "",
  authorType: "",
};
export function filterContributions(filters: ExchangeFilters) {
  const words = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return codeContributions.filter((item) => {
    const corpus = [
      item.id,
      ...Object.values(item.title),
      ...Object.values(item.description),
      ...Object.values(item.compatibility),
      item.language,
      item.industry,
      item.author,
      item.operator ?? "",
      item.agent ?? "",
      item.license,
      item.state,
      item.reference.repository,
    ]
      .join(" ")
      .toLowerCase();
    return (
      words.every((word) => corpus.includes(word)) &&
      (["language", "industry", "readiness", "license", "authorType"] as const).every(
        (key) => !filters[key] || item[key] === filters[key],
      )
    );
  });
}
export function getContribution(id: string) {
  return codeContributions.find((item) => item.id === id);
}
export function referenceLinks(item: CodeContribution) {
  return {
    repository: `https://github.com/${item.reference.repository}`,
    commit: `https://github.com/${item.reference.repository}/commit/${item.reference.commit}`,
  };
}
export function packagePreview(item: CodeContribution, locale: ExchangeLocale = "en") {
  return {
    schemaVersion: "1.0.0",
    mode: "DEMO",
    contributionId: item.id,
    version: item.version,
    artifact: {
      filename: item.filename,
      checksum: "DEMO_NOT_COMPUTED",
      checksumIsPlaceholder: true,
    },
    license: { declared: item.license, verification: "not_verified", originalDemoSample: true },
    dependencies: item.dependencies,
    compatibility: item.compatibility[locale],
    tests: item.tests.map((test) => ({
      name: test.name[locale],
      procedure: test.procedure[locale],
      status: "planned_not_run",
    })),
    approval: {
      required: "human_project_owner",
      state: "pending_real_approval",
      demoBoardState: item.state,
    },
    rollback: item.rollback[locale],
    signature: null,
    signingState: "unconfigured",
    distribution: "disabled",
    repositoryAccess: "none",
    pullRequests: "disabled",
    commerce: { currency: "USD", price: "TBD", payments: "disabled", payouts: "disabled" },
  };
}

const knownId = z.string().refine((id) => !!getContribution(id));
export const demoFeedbackInput = z.object({
  contributionId: knownId,
  name: z.string().trim().min(2).max(80),
  body: z.string().trim().min(10).max(2000),
  kind: z.enum(["Comment", "Request changes", "Recommend approval"]),
});
export type DemoFeedbackInput = z.infer<typeof demoFeedbackInput>;
const feedbackSchema = demoFeedbackInput.extend({
  id: z.string().max(100),
  createdAt: z.string().datetime(),
});
const activitySchema = z.object({
  id: z.string().max(100),
  contributionId: knownId,
  createdAt: z.string().datetime(),
  actor: z.string().max(80),
  action: z.enum(["Comment", "Request changes", "Recommend approval", "Export package"]),
});
export const demoStoreSchema = z.object({
  version: z.literal(1),
  feedback: z.array(feedbackSchema).max(200),
  activity: z.array(activitySchema).max(300),
});
export type DemoExchangeStore = z.infer<typeof demoStoreSchema>;
export const emptyDemoStore: DemoExchangeStore = { version: 1, feedback: [], activity: [] };
export function readDemoStore(raw: string | null): DemoExchangeStore {
  try {
    const parsed = demoStoreSchema.safeParse(JSON.parse(raw ?? "null"));
    return parsed.success ? parsed.data : emptyDemoStore;
  } catch {
    return emptyDemoStore;
  }
}
export function addDemoFeedback(
  store: DemoExchangeStore,
  input: DemoFeedbackInput,
  id: string,
  createdAt: string,
): DemoExchangeStore {
  const parsed = demoFeedbackInput.parse(input);
  const next = {
    version: 1,
    feedback: [...store.feedback.slice(-199), { ...parsed, id, createdAt }],
    activity: [
      ...store.activity.slice(-299),
      {
        id,
        contributionId: parsed.contributionId,
        createdAt,
        actor: parsed.name,
        action: parsed.kind,
      },
    ],
  };
  return demoStoreSchema.parse(next);
}
