import { z } from "zod";
import { nexusProjects, omniConnectors } from "@/data/evolution";
import { proposeOmniPlan, type OmniTarget } from "./omnibridge";

export const omniWorld = z
  .string()
  .refine((v) => nexusProjects.some((p) => p.id === v), "Unknown or excluded world");
export function parseOmniMessage(raw: string) {
  const text = z.string().trim().min(3).max(2000).parse(raw);
  if (
    /cyber[\s_-]*link|sk-[a-z0-9_-]{12,}|-----BEGIN .*PRIVATE KEY|\b(?:password|api[_ -]?key|secret|token)\s*[:=]\s*\S+/i.test(
      text,
    )
  )
    throw new Error(
      "Excluded project or possible credentials. Use fictional, non-sensitive text only.",
    );
  const match = text.match(/^@(\w[\w-]*)\s*/);
  if (match && match[1]?.toLowerCase() !== "omni")
    throw new Error("No other agent is connected. Only @omni local template routing is available.");
  const body = text.replace(/^@omni\s*/i, "").trim();
  if (body.length < 3) throw new Error("Add a question or goal after @omni.");
  return body;
}
export function omniTemplateReply(
  raw: string,
  worldId: string,
  targets: OmniTarget[],
  consent: boolean,
  id: string,
  at: string,
  paused: boolean,
) {
  const body = parseOmniMessage(raw);
  omniWorld.parse(worldId);
  if (paused) throw new Error("Guardian or Nexus local planning is paused.");
  if (!consent) throw new Error("Consent to non-sensitive temporary DEMO planning is required.");
  const world = nexusProjects.find((p) => p.id === worldId);
  if (!world) throw new Error("Unknown world");
  if (/^(?:help|status|capabilities|connections)(?:\?|$)/i.test(body))
    return {
      text: `DEMO template · not a model answer.\n\nOMNI coordinates proposed tools; Oracle handles research/evidence; Guardian handles permissions and safety.\n\nSelected world: ${world.name}. ${world.context}\n\n${omniConnectors.map((c) => `${c.name}: ${c.state} — ${c.capabilities.join(", ") || "No supported capability"}`).join("\n")}\n\nNo authenticated OMNI model, tool runner or live discovery. Requests: 0. Costs: no provider call; future rates unknown.`,
      plan: null,
    };
  if (body.length < 10)
    throw new Error(
      "Describe a goal in at least 10 characters, or ask status / capabilities / help.",
    );
  const plan = proposeOmniPlan(
    { projectId: worldId, goal: body, targets, consent },
    id,
    at,
    paused,
  );
  return {
    text: `DEMO template · not a model answer.\n\nSelected world: ${world.name}.\n\nI can lay out a deterministic proposal for your review; no model interpreted this goal. ${plan.steps.length} proposed steps are shown beside this conversation.\n\n${plan.notices.join("\n\n")}\n\nHandoffs are drafts, NOT SENT. Human review cannot connect a provider or authorize execution.`,
    plan,
  };
}
// Event-only, ephemeral handoff: never stored in a URL, browser storage or server records.
let pending: { worldId: string; message: string } | null = null;
export function stageOmniHandoff(worldId: string, message: string, paused: boolean) {
  if (paused) throw new Error("Guardian or Nexus local planning is paused.");
  omniWorld.parse(worldId);
  parseOmniMessage(message);
  pending = { worldId, message };
}
export function takeOmniHandoff(worldId: string) {
  const value = pending;
  pending = null;
  return value?.worldId === worldId ? value.message : "";
}
