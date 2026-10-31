import { z } from "zod";

/**
 * OMNI model-agnostic multi-agent gateway ("open doors for all AI models").
 * Browser-local declarations only. No provider credential, model endpoint,
 * runner or backend membership is connected in this project, so every adapter
 * is "declared" or "credential-missing" — never "connected" — and routing
 * decisions are plans, not executions.
 */
export const OMNI_MODEL_GW_STORE_KEY = "evolution.omni-model-gateway.v1";

// ---- Provider adapter registry ----------------------------------------------

export const adapterKinds = ["cloud-api", "local-model"] as const;
export type AdapterKind = (typeof adapterKinds)[number];

export const adapterStatuses = ["declared", "credential-missing", "connected"] as const;
export type AdapterStatus = (typeof adapterStatuses)[number];

const shortText = z.string().trim().min(2).max(240);
const longText = z.string().trim().min(10).max(2000);

export const adapterInputSchema = z
  .object({
    name: shortText,
    kind: z.enum(adapterKinds),
    endpoint: shortText.max(500),
    models: z.array(shortText).min(1).max(20),
    credentialName: shortText.max(120).optional(),
  })
  .strict();
export type AdapterInput = z.infer<typeof adapterInputSchema>;

export type ProviderAdapter = AdapterInput & {
  id: string;
  declaredAt: string;
  status: Exclude<AdapterStatus, "connected">;
  history: string[];
};

/**
 * Declare an adapter. Cloud APIs without a credential name are marked
 * credential-missing. Nothing can be marked connected here: connection is
 * only real after an end-to-end acceptance test, which does not exist yet.
 */
export function declareAdapter(input: unknown, id: string, now: string): ProviderAdapter {
  const parsed = adapterInputSchema.parse(input);
  const status: ProviderAdapter["status"] =
    parsed.kind === "cloud-api" && !parsed.credentialName ? "credential-missing" : "declared";
  return {
    ...parsed,
    id,
    declaredAt: now,
    status,
    history: [
      `${now} · adapter declared (${status}); capability discovery is from declarations only, not a live probe`,
    ],
  };
}

/** Capability discovery: report what adapters declare, never claim a live probe. */
export function discoverCapabilities(adapters: ProviderAdapter[]) {
  return adapters.map((a) => ({
    adapter: a.name,
    kind: a.kind,
    models: a.models,
    status: a.status,
    probed: false as const,
    note:
      a.status === "credential-missing"
        ? `Needs credential ${a.credentialName ?? "(unnamed)"} in Project Settings → Secrets before any real call.`
        : "Declared only; no live probe has run.",
  }));
}

// ---- Agent passports ---------------------------------------------------------

export const passportPermissions = [
  "inspect-own-project",
  "report-gaps",
  "draft-code",
  "request-tests",
  "broker-external",
] as const;
export type PassportPermission = (typeof passportPermissions)[number];

export const passportHealth = ["unknown", "reachable", "unreachable"] as const;
export type PassportHealth = (typeof passportHealth)[number];

export const passportInputSchema = z
  .object({
    agentName: shortText,
    specialty: shortText.max(500),
    adapterId: z.string().uuid(),
    projectId: z.string().uuid(),
    permissions: z.array(z.enum(passportPermissions)).min(1).max(passportPermissions.length),
    endpoint: shortText.max(500),
    ownerConfirmed: z.literal(true),
  })
  .strict();
export type PassportInput = z.infer<typeof passportInputSchema>;

export type AgentPassport = PassportInput & {
  id: string;
  issuedAt: string;
  health: "unknown";
  revoked: boolean;
  history: string[];
};

export function issuePassport(input: unknown, id: string, now: string): AgentPassport {
  const parsed = passportInputSchema.parse(input);
  return {
    ...parsed,
    id,
    issuedAt: now,
    health: "unknown",
    revoked: false,
    history: [`${now} · passport issued for project ${parsed.projectId}; health unknown until a real probe`],
  };
}

export function revokePassport(p: AgentPassport, now: string): AgentPassport {
  if (p.revoked) return p;
  return { ...p, revoked: true, history: [...p.history, `${now} · passport revoked; all permissions withdrawn`] };
}

// ---- Routing and the Jackboy dispatch loop -----------------------------------

export const routeDecisions = ["planned", "blocked"] as const;
export type RouteDecisionKind = (typeof routeDecisions)[number];

export type RouteDecision = {
  id: string;
  at: string;
  passportId: string;
  kind: RouteDecisionKind;
  reason: string;
  executed: false;
};

/** Route a task to an agent. Always a plan: nothing executes without a runner. */
export function routeTask(
  passport: AgentPassport,
  adapter: ProviderAdapter | undefined,
  permission: PassportPermission,
  id: string,
  now: string,
): RouteDecision {
  const base = { id, at: now, passportId: passport.id, executed: false as const };
  if (passport.revoked)
    return { ...base, kind: "blocked", reason: "Passport revoked; routing denied." };
  if (!passport.permissions.includes(permission))
    return { ...base, kind: "blocked", reason: `${permission} is not in this agent's passport.` };
  if (!adapter)
    return { ...base, kind: "blocked", reason: "Passport references an unknown adapter." };
  if (adapter.status === "credential-missing")
    return { ...base, kind: "blocked", reason: `Adapter ${adapter.name} is missing its credential.` };
  return {
    ...base,
    kind: "planned",
    reason: "Route planned against declarations; execution needs the connected runner.",
  };
}

export const dispatchStages = ["inspect", "gap-report", "dispatch", "outcome"] as const;
export type DispatchStage = (typeof dispatchStages)[number];

export const dispatchRecordSchema = z
  .object({
    passportId: z.string().uuid(),
    stage: z.enum(dispatchStages),
    summary: longText,
  })
  .strict();
export type DispatchRecordInput = z.infer<typeof dispatchRecordSchema>;

export type DispatchRecord = DispatchRecordInput & { id: string; at: string; simulated: true };

/**
 * Record one step of the loop: project-assigned agent inspects its own project
 * within approved scopes, reports gaps/issues to Jackboy; Jackboy dispatches
 * coding and tests through OMNI and reports outcomes. All records are
 * simulated until the runner and backend exist.
 */
export function recordDispatch(
  input: unknown,
  passport: AgentPassport | undefined,
  id: string,
  now: string,
): DispatchRecord {
  const parsed = dispatchRecordSchema.parse(input);
  if (!passport) throw new Error("Unknown passport.");
  if (passport.revoked) throw new Error("Passport revoked; the loop stops here.");
  return { ...parsed, id, at: now, simulated: true };
}

// ---- JAX broker constraints ----------------------------------------------------

export const JAX_FORBIDDEN_SCOPES = ["honeycomb-vault-secrets"] as const;

export type JaxBrokerRequest = {
  action: string;
  targetScope: string;
  hasConsent: boolean;
  submitsExternalData: boolean;
};

/**
 * JAX is a separately enrolled autonomous agent with its own approved broker
 * workflow. It never gets Honeycomb Vault secrets and never submits external
 * data without explicit permission/consent.
 */
export function jaxBrokerDecision(req: JaxBrokerRequest): { allowed: boolean; reason: string } {
  if (JAX_FORBIDDEN_SCOPES.includes(req.targetScope as (typeof JAX_FORBIDDEN_SCOPES)[number]))
    return { allowed: false, reason: "JAX never has access to Honeycomb Vault secrets." };
  if (req.submitsExternalData && !req.hasConsent)
    return {
      allowed: false,
      reason: "External data submission needs explicit permission and consent first.",
    };
  return {
    allowed: true,
    reason: "Within JAX's approved broker workflow; still requires the connected runner.",
  };
}

// ---- Readiness: real vs simulated ----------------------------------------------

export type ModelGatewayReadiness = {
  state: "Blocked";
  real: string[];
  simulated: string[];
  credentialPrerequisites: string[];
  acceptanceTest: string;
};
export function modelGatewayReadiness(): ModelGatewayReadiness {
  return {
    state: "Blocked",
    real: [
      "Local declaration registry, passports, routing plans, dispatch records and JAX broker rules (this page).",
      "Guardian default-deny governance and owner approval boundaries from the coding gateway.",
    ],
    simulated: [
      "Capability discovery (declarations only, no live probe).",
      "Agent health (unknown until a real probe runs).",
      "All routing and dispatch-loop records.",
    ],
    credentialPrerequisites: [
      "Each cloud model API needs its own key in Project Settings → Secrets (never in chat).",
      "Local models need the host companion/CLI with an OS-granted scope.",
      "Private account/member activation on the backend for authenticated enrollment.",
    ],
    acceptanceTest:
      "End-to-end acceptance test (not yet runnable): enroll one owner agent with a real credential → live capability probe returns model list → passport health becomes reachable → one bounded Jackboy dispatch produces a real patch proposal and sandbox test evidence → Guardian decision logged → owner approves or rejects. Until this passes, no integration is claimed as connected.",
  };
}

// ---- Store -----------------------------------------------------------------------

export type ModelGatewayStore = {
  version: 1;
  adapters: ProviderAdapter[];
  passports: AgentPassport[];
  routes: RouteDecision[];
  dispatches: DispatchRecord[];
};
export const emptyModelGatewayStore: ModelGatewayStore = {
  version: 1,
  adapters: [],
  passports: [],
  routes: [],
  dispatches: [],
};

export function loadModelGatewayStore(raw: string | null): ModelGatewayStore {
  if (!raw) return emptyModelGatewayStore;
  try {
    const parsed = JSON.parse(raw) as Partial<ModelGatewayStore>;
    return {
      version: 1,
      adapters: Array.isArray(parsed.adapters) ? parsed.adapters : [],
      passports: Array.isArray(parsed.passports) ? parsed.passports : [],
      routes: Array.isArray(parsed.routes) ? parsed.routes : [],
      dispatches: Array.isArray(parsed.dispatches) ? parsed.dispatches : [],
    };
  } catch {
    return emptyModelGatewayStore;
  }
}
