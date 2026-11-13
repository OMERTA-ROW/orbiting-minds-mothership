/**
 * Razul intelligence provisioning (pure model). Razul (Intelligence Director) proposes, per
 * Jackboy-built app, which specialist agents it needs and how they are configured. A manifest is
 * a proposal, never a grant: Razul cannot grant tools or permissions, cannot set secrets (it may
 * only name settings the owner must add), cannot promote to production, and cannot bypass OMNI
 * CODE gates. Every change is a versioned update proposal that needs a passing sandbox evaluation,
 * an owner approval with fresh two-step sign-in, staged rollout and an always-available rollback.
 * Continuous production updates are off.
 */
import { z } from "zod";
import { noteProblem } from "./activation-approvals";
import { GLOBAL_LIMITS } from "./omni-workspace";

export const MANIFEST_CONTRACT = "razul.manifest/v1";
/** Promotion always needs the owner. There is no automatic or continuous promotion. */
export const RAZUL_AUTO_PROMOTE = false as const;
export const EVALUATION_VALID_MS = 24 * 3600_000;
export const ROLLOUT_STAGES = [10, 50, 100] as const;
export type RolloutStage = (typeof ROLLOUT_STAGES)[number];

/** Tools a manifest may request. Requesting is not granting; the owner grants. */
export const AGENT_TOOLS = {
  "knowledge.search": "Search this agent's own knowledge namespace (with sources).",
  "memory.read": "Read memory you saved for this agent.",
  "memory.propose": "Suggest a memory entry; you confirm before it is saved.",
  "status.read": "Read the app's health and job status.",
  "code.propose":
    "Propose a CODE task; it waits in the OMNI CODE queue for its gates and your approval.",
} as const;
export type AgentTool = keyof typeof AGENT_TOOLS;
/** Never requestable, by Razul or anyone, through a manifest. */
export const FORBIDDEN_TOOLS = [
  "shell",
  "shell.run",
  "deploy",
  "publish",
  "merge",
  "secrets.write",
  "secrets.read",
  "permissions.grant",
  "network.any",
  "files.write",
  "self.modify",
] as const;

export const PROVIDERS = ["none", "lovable_ai", "openai", "anthropic"] as const;

const slug = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,39}$/, "Use lowercase letters, numbers and dashes.");
const semver = z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/, "Use a version like 1.0.0.");
const clean = (v: string) => !noteProblem(v);
const settingName = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{2,63}$/, "Setting names only, like OPENAI_API_KEY.");

export const agentManifest = z
  .object({
    contract: z.literal(MANIFEST_CONTRACT),
    appId: slug,
    agentId: slug,
    version: semver,
    identity: z
      .object({
        name: z.string().trim().min(2).max(60),
        purpose: z.string().trim().min(10).max(500),
      })
      .strict(),
    tools: z.array(z.string()).max(10),
    model: z
      .object({
        provider: z.enum(PROVIDERS),
        model: z
          .string()
          .regex(/^[A-Za-z0-9._:/-]{1,80}$/)
          .nullable(),
        temperature: z.number().min(0).max(1),
        maxOutputTokens: z.number().int().min(1).max(8192),
      })
      .strict(),
    knowledgeNamespace: z.string().max(100),
    memory: z
      .object({
        scope: z.literal("agent"),
        ownerManaged: z.literal(true),
        retentionDays: z.number().int().min(1).max(365),
      })
      .strict(),
    budgets: z
      .object({
        taskCents: z.number().int().min(0),
        dayCents: z.number().int().min(0),
        totalCents: z.number().int().min(0),
      })
      .strict(),
    /** Names of settings the owner must add. Never values. */
    requiredSettings: z.array(settingName).max(10),
  })
  .strict();
export type AgentManifest = z.infer<typeof agentManifest>;

export const namespaceFor = (appId: string, agentId: string) => `app/${appId}/${agentId}`;

/** Static checks that run here without a sandbox. Returns problems; empty = passes. */
export function lintManifest(input: unknown): {
  manifest: AgentManifest | null;
  problems: string[];
} {
  const parsed = agentManifest.safeParse(input);
  if (!parsed.success)
    return {
      manifest: null,
      problems: parsed.error.issues.map((i) => `${i.path.join(".") || "manifest"}: ${i.message}`),
    };
  const m = parsed.data;
  const p: string[] = [];
  for (const t of m.tools) {
    if ((FORBIDDEN_TOOLS as readonly string[]).includes(t))
      p.push(`Tool "${t}" can never be requested.`);
    else if (!(t in AGENT_TOOLS)) p.push(`Unknown tool "${t}".`);
  }
  if (new Set(m.tools).size !== m.tools.length) p.push("Tools are listed twice.");
  if (m.knowledgeNamespace !== namespaceFor(m.appId, m.agentId))
    p.push(
      `Knowledge namespace must be ${namespaceFor(m.appId, m.agentId)} (no shared or other-agent namespaces).`,
    );
  if (m.budgets.taskCents > GLOBAL_LIMITS.task) p.push("Per-task budget is above the $1 limit.");
  if (m.budgets.dayCents > GLOBAL_LIMITS.day) p.push("Daily budget is above the $5 limit.");
  if (m.budgets.totalCents > GLOBAL_LIMITS.total) p.push("Total budget is above the $10 limit.");
  if (m.budgets.taskCents > m.budgets.dayCents || m.budgets.dayCents > m.budgets.totalCents)
    p.push("Budgets must satisfy task ≤ day ≤ total.");
  if (m.model.provider === "none" ? m.model.model !== null : m.model.model === null)
    p.push("Pick a model for the provider, or no model when the provider is none.");
  if (m.model.provider !== "none" && m.budgets.taskCents === 0)
    p.push("A model provider needs a non-zero budget.");
  if (![m.identity.name, m.identity.purpose].every(clean))
    p.push("Remove anything that looks like a key or token.");
  return { manifest: m, problems: p };
}

/** Field-level differences; escalations widen what the agent can do or spend. */
export function diffManifests(prev: AgentManifest | null, next: AgentManifest) {
  const changes: string[] = [];
  const escalations: string[] = [];
  if (!prev) {
    escalations.push("New agent.");
    for (const t of next.tools) escalations.push(`Requests tool ${t}.`);
    if (next.requiredSettings.length)
      escalations.push(`Needs settings: ${next.requiredSettings.join(", ")}.`);
    return { changes: ["New agent."], escalations };
  }
  if (prev.appId !== next.appId || prev.agentId !== next.agentId)
    escalations.push("Different app or agent.");
  for (const t of next.tools.filter((t) => !prev.tools.includes(t)))
    escalations.push(`Adds tool ${t}.`);
  for (const t of prev.tools.filter((t) => !next.tools.includes(t)))
    changes.push(`Removes tool ${t}.`);
  if (prev.model.provider !== next.model.provider || prev.model.model !== next.model.model)
    escalations.push(
      `Model ${prev.model.provider}/${prev.model.model ?? "—"} → ${next.model.provider}/${next.model.model ?? "—"}.`,
    );
  if (
    prev.model.temperature !== next.model.temperature ||
    prev.model.maxOutputTokens !== next.model.maxOutputTokens
  )
    changes.push("Model settings changed.");
  for (const k of ["taskCents", "dayCents", "totalCents"] as const) {
    if (next.budgets[k] > prev.budgets[k])
      escalations.push(`Raises ${k} ${prev.budgets[k]} → ${next.budgets[k]}.`);
    else if (next.budgets[k] < prev.budgets[k]) changes.push(`Lowers ${k}.`);
  }
  for (const s of next.requiredSettings.filter((s) => !prev.requiredSettings.includes(s)))
    escalations.push(`Needs new setting ${s}.`);
  if (next.memory.retentionDays > prev.memory.retentionDays)
    escalations.push("Keeps memory longer.");
  if (prev.identity.purpose !== next.identity.purpose || prev.identity.name !== next.identity.name)
    changes.push("Identity changed.");
  return { changes, escalations };
}

export function compareVersions(a: string, b: string) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return 0;
}

// ---------------------------------------------------------------- proposal lifecycle

export const PROPOSAL_STATUSES = [
  "proposed",
  "evaluated",
  "approved",
  "rejected",
  "staged",
  "promoted",
  "rolled_back",
  "withdrawn",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export type Evaluation = {
  kind: "static" | "sandbox";
  passed: boolean;
  manifestSha256: string;
  ranAt: number;
};
export type Proposal = {
  status: ProposalStatus;
  manifestSha256: string;
  evaluations: Evaluation[];
  stage: RolloutStage | null;
  stageHealthy: boolean | null;
};
export type ProposalAction =
  | { type: "evaluate"; evaluation: Evaluation }
  | { type: "approve"; by: "owner" | "razul"; mfaFresh: boolean }
  | { type: "reject" }
  | { type: "withdraw" }
  | { type: "stage"; to: RolloutStage; by: "owner" | "razul" }
  | { type: "stage_health"; healthy: boolean }
  | { type: "promote"; by: "owner" | "razul" }
  | { type: "rollback" };

/** A passing sandbox evaluation of exactly this manifest, from the last 24 hours. */
export function hasFreshSandboxPass(p: Proposal, now: number) {
  return p.evaluations.some(
    (e) =>
      e.kind === "sandbox" &&
      e.passed &&
      e.manifestSha256 === p.manifestSha256 &&
      now - e.ranAt <= EVALUATION_VALID_MS,
  );
}

export function applyProposal(p: Proposal, a: ProposalAction, now: number): Proposal | string {
  const s = p.status;
  switch (a.type) {
    case "evaluate":
      if (s !== "proposed" && s !== "evaluated")
        return "Only proposals waiting for review can be evaluated.";
      if (a.evaluation.manifestSha256 !== p.manifestSha256)
        return "Evaluation is for a different manifest.";
      // Static checks are recorded but only a sandbox evaluation makes a proposal reviewable.
      return {
        ...p,
        status: a.evaluation.kind === "sandbox" ? "evaluated" : s,
        evaluations: [...p.evaluations, a.evaluation],
      };
    case "approve":
      if (a.by !== "owner") return "Only the owner can approve. Razul proposes.";
      if (!a.mfaFresh) return "Confirm your two-step code (last 15 minutes) to approve.";
      if (s !== "evaluated") return "Evaluate the proposal first.";
      if (p.evaluations.some((e) => e.manifestSha256 === p.manifestSha256 && !e.passed))
        return "An evaluation of this manifest failed.";
      if (!hasFreshSandboxPass(p, now))
        return "Needs a passing sandbox evaluation from the last 24 hours.";
      return { ...p, status: "approved" };
    case "reject":
      if (!["proposed", "evaluated", "approved"].includes(s))
        return `Cannot reject a ${s} proposal.`;
      return { ...p, status: "rejected" };
    case "withdraw":
      if (s !== "proposed" && s !== "evaluated") return `Cannot withdraw a ${s} proposal.`;
      return { ...p, status: "withdrawn" };
    case "stage": {
      if (a.by !== "owner") return "Only the owner can widen a rollout.";
      const idx = ROLLOUT_STAGES.indexOf(a.to);
      if (s === "approved")
        return idx === 0
          ? { ...p, status: "staged", stage: a.to, stageHealthy: null }
          : "Start at the first stage (10%).";
      if (s !== "staged" || p.stage === null) return "Approve the proposal first.";
      if (p.stageHealthy !== true) return "The current stage has not passed its health check.";
      if (idx !== ROLLOUT_STAGES.indexOf(p.stage) + 1) return "Widen one stage at a time.";
      return { ...p, stage: a.to, stageHealthy: null };
    }
    case "stage_health":
      if (s !== "staged") return "Nothing is staged.";
      return { ...p, stageHealthy: a.healthy };
    case "promote":
      if (RAZUL_AUTO_PROMOTE as boolean) return "unreachable";
      if (a.by !== "owner") return "Only the owner can promote.";
      if (s !== "staged" || p.stage !== 100 || p.stageHealthy !== true)
        return "Promote only after a healthy 100% stage.";
      return { ...p, status: "promoted" };
    case "rollback":
      if (s !== "staged" && s !== "promoted") return "Nothing to roll back.";
      return { ...p, status: "rolled_back", stage: null, stageHealthy: null };
  }
}

/** A failing health check during a stage means roll back, never continue. */
export const rollbackRecommended = (p: Proposal) =>
  p.status === "staged" && p.stageHealthy === false;

// ---------------------------------------------------------------- knowledge retrieval

export type KnowledgeDoc = {
  id: string;
  namespace: string;
  title: string;
  body: string;
  source: {
    kind: "owner_upload" | "official_url" | "owner_typed";
    ref: string;
    retrievedAt: number;
    sha256: string;
  };
};
export type RetrievalHit = {
  id: string;
  title: string;
  score: number;
  excerpt: string;
  source: KnowledgeDoc["source"];
};

const words = (t: string) => t.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];

/**
 * Searches only the given namespace (no fallback to other namespaces), returns sources with
 * every hit, and never returns a document without provenance.
 */
export function retrieve(
  query: string,
  docs: KnowledgeDoc[],
  namespace: string,
  limit = 5,
): RetrievalHit[] {
  const q = new Set(words(query));
  if (!q.size) return [];
  return docs
    .filter(
      (d) => d.namespace === namespace && d.source.ref && /^[0-9a-f]{64}$/.test(d.source.sha256),
    )
    .map((d) => {
      const w = words(`${d.title} ${d.body}`);
      const score = w.filter((x) => q.has(x)).length / Math.sqrt(w.length || 1);
      return { d, score };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.d.id.localeCompare(b.d.id))
    .slice(0, limit)
    .map(({ d, score }) => ({
      id: d.id,
      title: d.title,
      score: Math.round(score * 1000) / 1000,
      excerpt: d.body.slice(0, 240),
      source: d.source,
    }));
}

// ---------------------------------------------------------------- integration health

export type HealthItem = { id: string; label: string; ok: boolean; detail: string };

export function integrationHealth(
  m: AgentManifest,
  c: {
    settingsPresent: ReadonlySet<string>;
    sandboxSelfTestPassed: boolean;
    knowledgeDocs: number;
    providerVerified: boolean | null;
  },
): HealthItem[] {
  const missing = m.requiredSettings.filter((s) => !c.settingsPresent.has(s));
  return [
    {
      id: "settings",
      label: "Required settings added by you",
      ok: missing.length === 0,
      detail: missing.length
        ? `Missing: ${missing.join(", ")} (names only; Razul never sets them).`
        : "All present.",
    },
    {
      id: "provider",
      label: "Model provider",
      ok: m.model.provider === "none" || c.providerVerified === true,
      detail:
        m.model.provider === "none"
          ? "No model."
          : c.providerVerified === true
            ? "Verified by the sandbox."
            : "Not verified.",
    },
    {
      id: "knowledge",
      label: "Knowledge namespace has sources",
      ok: c.knowledgeDocs > 0,
      detail: `${c.knowledgeDocs} document(s) in ${m.knowledgeNamespace}.`,
    },
    {
      id: "sandbox",
      label: "Cloud sandbox self-test (for evaluations)",
      ok: c.sandboxSelfTestPassed,
      detail: c.sandboxSelfTestPassed
        ? "Passed in the last 24 h."
        : "Not passed; sandbox evaluations cannot run.",
    },
    {
      id: "budget",
      label: "Budget set",
      ok: m.model.provider === "none" || m.budgets.taskCents > 0,
      detail: `$${(m.budgets.taskCents / 100).toFixed(2)}/task.`,
    },
  ];
}

export const proposalInput = z
  .object({ manifest: z.unknown(), note: z.string().max(280).default("") })
  .strict();
export const proposalIdInput = z.object({ proposalId: z.string().uuid() }).strict();
