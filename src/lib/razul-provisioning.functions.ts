/**
 * Razul intelligence provisioning: owner-only (verified email, owner role, aal2) server functions.
 * Owners propose manifests, decide on proposals and manage per-agent knowledge. Nothing here runs a
 * model, grants a tool, sets a setting, contacts the sandbox or changes a running agent: no
 * sandbox evaluator or agent runtime is connected, so approval stays refused by the database.
 */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { isMfaFresh, mfaAgeSeconds } from "./activation-approvals";
import {
  agentManifest,
  diffManifests,
  integrationHealth,
  lintManifest,
  proposalInput,
  retrieve,
  ROLLOUT_STAGES,
  type AgentManifest,
  type KnowledgeDoc,
} from "./razul-provisioning";

type Ctx = { supabase: any; userId: string; claims: Record<string, unknown> };
async function owner(context: Ctx) {
  setResponseHeader("Cache-Control", "private, no-store");
  const { requireRazulOwner } = await import("./razul-owner.server");
  await requireRazulOwner(context.supabase, context.userId, context.claims);
}
function ruleError(error: { code?: string; message: string } | null) {
  if (!error) return null;
  if (error.message.includes("Fresh two-factor")) return "Confirm your two-step code (last 15 minutes) first.";
  // 22023 messages are written by the provisioning functions themselves and contain no data.
  if (error.code === "22023") return error.message;
  return "Not recorded. Check owner access and refresh.";
}

export const readProvisioning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await owner(context);
    const db = context.supabase;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ws = await import("./omni-workspace.server");
    const [manifests, proposals, evals, releases, events, docs, link] = await Promise.all([
      db.from("razul_agent_manifests").select("id,app_id,agent_id,version,manifest,manifest_sha256,created_by,created_at").order("created_at", { ascending: false }).limit(100),
      db.from("razul_update_proposals").select("*").order("created_at", { ascending: false }).limit(50),
      db.from("razul_evaluations").select("id,proposal_id,manifest_sha256,kind,passed,proof_verified,runner,ran_at").order("ran_at", { ascending: false }).limit(200),
      db.from("razul_agent_releases").select("*"),
      db.from("razul_provisioning_events").select("id,at,actor,event,app_id,agent_id,proposal_id,detail").order("at", { ascending: false }).limit(50),
      db.from("razul_knowledge_docs").select("id,namespace,title,source_kind,source_ref,source_sha256,retrieved_at,created_at").order("created_at", { ascending: false }).limit(500),
      ws.linkState(supabaseAdmin),
    ]);
    const now = Date.now();
    const sandboxPassed = link.selfTestPassedAt !== null && now - link.selfTestPassedAt < 24 * 3600_000;
    const docCount = new Map<string, number>();
    for (const d of docs.data ?? []) docCount.set(d.namespace, (docCount.get(d.namespace) ?? 0) + 1);
    const health: Record<string, ReturnType<typeof integrationHealth>> = {};
    for (const m of manifests.data ?? []) {
      const parsed = agentManifest.safeParse(m.manifest);
      if (!parsed.success) continue;
      // Presence of setting NAMES only; values are never read or returned.
      const present = new Set(parsed.data.requiredSettings.filter((n) => Boolean(process.env[n])));
      health[m.id] = integrationHealth(parsed.data, {
        settingsPresent: present,
        sandboxSelfTestPassed: sandboxPassed,
        knowledgeDocs: docCount.get(parsed.data.knowledgeNamespace) ?? 0,
        providerVerified: null,
      });
    }
    return {
      now,
      readable: !manifests.error && !proposals.error,
      manifests: manifests.data ?? [],
      proposals: proposals.data ?? [],
      evaluations: evals.data ?? [],
      releases: releases.data ?? [],
      events: events.data ?? [],
      docs: docs.data ?? [],
      health,
      sandbox: { configured: link.configured, selfTestPassed: sandboxPassed },
      runtime: { evaluator: false, agentRuntime: false, razulProposer: false },
      mfaAgeSeconds: mfaAgeSeconds(context.claims["amr"], Math.floor(now / 1000)),
    };
  });

export const proposeManifest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => proposalInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { manifest, problems } = lintManifest(data.manifest);
    if (!manifest || problems.length) return { ok: false as const, problems };
    const db = context.supabase;
    const rel = await db
      .from("razul_agent_releases")
      .select("manifest_id")
      .eq("app_id", manifest.appId)
      .eq("agent_id", manifest.agentId)
      .maybeSingle();
    let prev: AgentManifest | null = null;
    if (rel.data?.manifest_id) {
      const m = await db.from("razul_agent_manifests").select("manifest").eq("id", rel.data.manifest_id).maybeSingle();
      const parsed = agentManifest.safeParse(m.data?.manifest);
      prev = parsed.success ? parsed.data : null;
    }
    const diff = diffManifests(prev, manifest);
    const { data: id, error } = await db.rpc("razul_propose_manifest", {
      _manifest: manifest as unknown as Json,
      _escalations: diff.escalations as unknown as Json,
      _changes: diff.changes as unknown as Json,
      _note: data.note,
      _static: { problems: 0, checks: ["schema", "tools", "namespace", "budgets", "model", "text"] } as Json,
    });
    const message = ruleError(error);
    if (message) return { ok: false as const, problems: [message] };
    return { ok: true as const, proposalId: id as string, escalations: diff.escalations };
  });

const decideInput = z
  .object({
    proposalId: z.string().uuid(),
    action: z.enum(["approve", "reject", "withdraw", "stage", "promote", "rollback"]),
    stage: z.union([z.literal(ROLLOUT_STAGES[0]), z.literal(ROLLOUT_STAGES[1]), z.literal(ROLLOUT_STAGES[2])]).nullable().default(null),
    acknowledge: z.boolean().default(false),
  })
  .strict();

export const decideProvisioning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decideInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    if (["approve", "stage", "promote"].includes(data.action) && !isMfaFresh(context.claims["amr"], Math.floor(Date.now() / 1000)))
      return { ok: false as const, message: "Confirm your two-step code (last 15 minutes) first." };
    const { error } = await context.supabase.rpc("razul_decide_proposal", {
      _id: data.proposalId,
      _action: data.action,
      _stage: data.stage as unknown as number,
      _acknowledge: data.acknowledge,
    });
    const message = ruleError(error);
    return message ? { ok: false as const, message } : { ok: true as const };
  });

const ns = z.string().regex(/^app\/[a-z][a-z0-9-]{1,39}\/[a-z][a-z0-9-]{1,39}$/);
const addInput = z
  .object({
    namespace: ns,
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(20000),
    sourceKind: z.enum(["owner_upload", "official_url", "owner_typed"]),
    sourceRef: z.string().trim().min(1).max(300),
    retrievedAt: z.string().datetime(),
  })
  .strict();

export const addKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { error } = await context.supabase.rpc("razul_add_knowledge", {
      _namespace: data.namespace,
      _title: data.title,
      _body: data.body,
      _source_kind: data.sourceKind,
      _source_ref: data.sourceRef,
      _retrieved_at: data.retrievedAt,
    });
    const message = ruleError(error);
    return message ? { ok: false as const, message } : { ok: true as const };
  });

export const deleteKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).strict().parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { error } = await context.supabase.rpc("razul_delete_knowledge", { _id: data.id });
    const message = ruleError(error);
    return message ? { ok: false as const, message } : { ok: true as const };
  });

/** Owner-run search of one namespace only. Results always carry their source. */
export const searchKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ namespace: ns, query: z.string().trim().min(1).max(200) }).strict().parse(input),
  )
  .handler(async ({ context, data }) => {
    await owner(context);
    const { data: rows, error } = await context.supabase
      .from("razul_knowledge_docs")
      .select("id,namespace,title,body,source_kind,source_ref,source_sha256,retrieved_at")
      .eq("namespace", data.namespace)
      .limit(200);
    if (error) return { ok: false as const, message: "Knowledge could not be read." };
    const docs: KnowledgeDoc[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      namespace: r.namespace,
      title: r.title,
      body: r.body,
      source: { kind: r.source_kind, ref: r.source_ref, retrievedAt: Date.parse(r.retrieved_at), sha256: r.source_sha256 },
    }));
    return { ok: true as const, hits: retrieve(data.query, docs, data.namespace) };
  });
