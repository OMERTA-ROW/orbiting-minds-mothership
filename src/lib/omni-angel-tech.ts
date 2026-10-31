import { z } from "zod";

/**
 * Angel Tech / Sabrina concept workspace.
 * Browser-local planning records only: no model inference, discovery crawl,
 * account connection, credential storage, unsolicited outreach or delivery.
 */
export const ANGEL_TECH_STORE_KEY = "evolution.angel-tech.v1";

export const compatibilityOptions = [
  "api-documented",
  "mcp-documented",
  "oauth-available",
  "owner-credentials-required",
] as const;
export type CompatibilityOption = (typeof compatibilityOptions)[number];

export const permissionOptions = [
  "public-research",
  "draft-campaign",
  "prepare-invitation",
  "api-read-only",
  "mcp-read-only",
] as const;
export type PermissionOption = (typeof permissionOptions)[number];

export const humanApprovalStates = ["not-reviewed", "approved", "rejected"] as const;
export type HumanApprovalState = (typeof humanApprovalStates)[number];

export const prospectStatuses = ["identified", "invitation-drafted", "blocked", "revoked"] as const;
export type ProspectStatus = (typeof prospectStatuses)[number];

const shortText = z.string().trim().min(2).max(240);
const longText = z.string().trim().min(10).max(2000);

export const prospectInputSchema = z.object({
  name: shortText,
  organization: shortText,
  focus: longText.max(1000),
  source: shortText.max(500),
  perspective: longText,
  compatibility: z.array(z.enum(compatibilityOptions)).max(compatibilityOptions.length),
  permissions: z.array(z.enum(permissionOptions)).max(permissionOptions.length),
  ownerAuthorization: z.boolean(),
  humanApproval: z.enum(humanApprovalStates),
});
export type ProspectInput = z.infer<typeof prospectInputSchema>;

export type Prospect = ProspectInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ProspectStatus;
  consent: "not-requested" | "revoked";
  delivery: "none";
  invitationDraft?: string;
  history: string[];
};

export function createProspect(input: unknown, id: string, now: string): Prospect {
  const parsed = prospectInputSchema.parse(input);
  return {
    ...parsed,
    id,
    createdAt: now,
    updatedAt: now,
    status: "identified",
    consent: "not-requested",
    delivery: "none",
    history: [`${now} recorded manually; no discovery crawl or contact attempted`],
  };
}

/** Exact gates before Sabrina may prepare a local invitation draft. */
export function invitationBlockers(prospect: Prospect): string[] {
  const blockers: string[] = [];
  if (prospect.status === "revoked")
    blockers.push("Revoked records cannot be contacted or reused.");
  if (prospect.status === "invitation-drafted")
    blockers.push("An invitation draft already exists; delivery remains blocked.");
  if (!prospect.ownerAuthorization) blockers.push("Explicit owner authorization is missing.");
  if (prospect.humanApproval !== "approved")
    blockers.push("Human approval has not approved this prospect.");
  if (!prospect.permissions.includes("prepare-invitation"))
    blockers.push("The prepare-invitation permission is not granted.");
  if (prospect.consent !== "not-requested")
    blockers.push("Consent state does not allow a new draft.");
  return blockers;
}

export function prepareInvitation(
  prospect: Prospect,
  now: string,
): { prospect: Prospect; blockers: string[] } {
  const blockers = invitationBlockers(prospect);
  if (blockers.length) {
    return {
      blockers,
      prospect: {
        ...prospect,
        status: prospect.status === "revoked" ? "revoked" : "blocked",
        updatedAt: now,
        history: [
          ...prospect.history,
          `${now} invitation preparation blocked: ${blockers.join(" ")}`,
        ],
      },
    };
  }
  const invitationDraft = [
    `Local draft for ${prospect.name} at ${prospect.organization}.`,
    "Purpose: request consent to discuss a possible Angel Tech agent/research partnership.",
    "This draft was prepared for human review only. It has not been sent, and no channel or credential is connected.",
    `Requested future scopes: ${prospect.permissions.join(", ") || "none"}.`,
  ].join("\n");
  return {
    blockers: [],
    prospect: {
      ...prospect,
      status: "invitation-drafted",
      updatedAt: now,
      invitationDraft,
      history: [
        ...prospect.history,
        `${now} local invitation draft prepared; delivery still blocked`,
      ],
    },
  };
}

export function revokeProspect(prospect: Prospect, now: string): Prospect {
  return {
    ...prospect,
    status: "revoked",
    consent: "revoked",
    ownerAuthorization: false,
    humanApproval: "rejected",
    permissions: [],
    updatedAt: now,
    history: [...prospect.history, `${now} owner revoked the local partnership record`],
  };
}

export const insightSchema = z
  .object({
    audience: shortText,
    trend: longText.max(1000),
    invention: shortText,
    evidence: longText.max(1200),
    confidence: z.number().min(0).max(100),
    usesPrivateContext: z.boolean(),
    privateAuthorization: z.boolean(),
  })
  .refine((value) => !value.usesPrivateContext || value.privateAuthorization, {
    message: "Private context requires explicit owner authorization.",
    path: ["privateAuthorization"],
  });
export type InsightInput = z.infer<typeof insightSchema>;

export type SabrinaInsight = InsightInput & { id: string; createdAt: string };

export function createInsight(input: unknown, id: string, now: string): SabrinaInsight {
  return { ...insightSchema.parse(input), id, createdAt: now };
}

export type CampaignDraft = {
  id: string;
  insightId: string;
  createdAt: string;
  title: string;
  body: string;
  channels: ["owner-review", "omni-checkpoint", "jackboy-context", "jax-approval"];
};

export function draftCampaign(insight: SabrinaInsight, id: string, now: string): CampaignDraft {
  return {
    id,
    insightId: insight.id,
    createdAt: now,
    title: `${insight.invention} · Sabrina draft`,
    body: [
      `Audience: ${insight.audience}`,
      `Observed trend: ${insight.trend}`,
      `Invention connection: ${insight.invention}`,
      `Evidence note: ${insight.evidence}`,
      `Confidence: ${insight.confidence}% (owner-entered, not independently verified)`,
      "Next checkpoint: Jackboy confirms invention context, OMNI coordinates the task plan, and JAX gives final human approval.",
      "No campaign has been published, sent, scheduled or connected to an advertising account.",
    ].join("\n"),
    channels: ["owner-review", "omni-checkpoint", "jackboy-context", "jax-approval"],
  };
}

export const coordinationLanes = [
  {
    name: "Jackboy",
    role: "Invention context",
    status: "Concept handoff",
    boundary: "No automatic message or task transfer.",
  },
  {
    name: "OMNI",
    role: "Coordinator checkpoint",
    status: "Concept handoff",
    boundary: "No model request, tool execution or autonomous action.",
  },
  {
    name: "JAX",
    role: "Final human approval",
    status: "Required",
    boundary: "No outreach, spend, publishing or credential use without explicit approval.",
  },
] as const;

export function readinessSummary(prospects: Prospect[]) {
  const approved = prospects.filter(
    (p) => p.humanApproval === "approved" && p.ownerAuthorization,
  ).length;
  const drafted = prospects.filter((p) => p.status === "invitation-drafted").length;
  return {
    total: prospects.length,
    approved,
    drafted,
    connected: 0,
    pending: [
      "Verified owner account and server-side member permissions",
      "Official API/MCP credentials supplied through secure settings",
      "A consenting outreach channel selected by the owner",
      "Independent human review before any external message",
    ],
  };
}

const storeSchema = z.object({
  version: z.literal(1),
  insights: z.array(z.any()),
  prospects: z.array(z.any()),
  drafts: z.array(z.any()),
});
export type AngelTechStore = {
  insights: SabrinaInsight[];
  prospects: Prospect[];
  drafts: CampaignDraft[];
};

export function loadAngelTechStore(raw: string | null): AngelTechStore {
  if (!raw) return { insights: [], prospects: [], drafts: [] };
  try {
    const parsed = storeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { insights: [], prospects: [], drafts: [] };
    return {
      insights: parsed.data.insights as SabrinaInsight[],
      prospects: parsed.data.prospects as Prospect[],
      drafts: parsed.data.drafts as CampaignDraft[],
    };
  } catch {
    return { insights: [], prospects: [], drafts: [] };
  }
}

export function saveAngelTechStore(store: AngelTechStore) {
  return JSON.stringify({ version: 1, ...store });
}
