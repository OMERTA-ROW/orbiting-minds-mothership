import { CHAT_AGENT_IDS } from "./omni-chat-agents";
import { buildManifest } from "./omni-contract";
import { CHAT_MODEL_REF, CHAT_PROVIDER } from "./omni-delegated-chat";
import { DOCK_PATHS } from "./omni-dock";

type Manifest = ReturnType<typeof buildManifest>;

export function buildNativeCatalog(manifest: Manifest, permissions: readonly string[]) {
  const webAgents = new Map(manifest.agents.map((agent) => [agent.id, agent.enrolled]));
  const configured = manifest.providers.some((provider) => provider.id === CHAT_PROVIDER.id);
  const has = (permission: string) => permissions.includes(permission);
  return {
    protocol: "omni.native-catalog/v1",
    checkedAt: manifest.checkedAt,
    providers: manifest.providers.map(({ id, label }) => ({ id, label, configured: true })),
    models: [
      {
        id: CHAT_MODEL_REF,
        provider: CHAT_PROVIDER.id,
        configured,
        nativeChatAvailable: false,
        reason: "native_chat_not_available",
      },
    ],
    agents: manifest.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      kind: agent.kind,
      webChatConfigured: webAgents.get(agent.id) === true,
      nativeChatAvailable: false,
    })),
    chat: {
      available: false,
      streamingAvailable: false,
      agentIds: [...CHAT_AGENT_IDS],
      model: CHAT_MODEL_REF,
      reason: "native_chat_not_available",
    },
    tasks: {
      proposal: {
        available: has("jobs.propose"),
        path: DOCK_PATHS.jobs,
        result: "held",
      },
      status: {
        available: has("status.read"),
        path: DOCK_PATHS.jobsStatus,
      },
      approval: {
        available: false,
        reason: "owner_approval_requires_mothership",
      },
      execution: {
        available: false,
        executor: "none",
      },
    },
    fusion: {
      state: manifest.orchestrationStatus.permission.state,
      orchestratorAvailable: false,
      nativePlanningAvailable: false,
      reason: "native_fusion_api_not_available",
    },
  };
}
