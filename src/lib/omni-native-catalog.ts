import { CHAT_AGENT_IDS } from "./omni-chat-agents";
import { buildManifest } from "./omni-contract";
import { CHAT_MODEL_REF, CHAT_PROVIDER } from "./omni-delegated-chat";
import { DOCK_PATHS } from "./omni-dock";
import { CLAUDE_ENGINE_IDS } from "./omni-engines";
import {
  NATIVE_CHAT_DAILY_LIMIT,
  NATIVE_CHAT_MAX_OUTPUT_TOKENS,
  NATIVE_CHAT_PROTOCOL,
} from "./omni-native-chat";

type Manifest = ReturnType<typeof buildManifest>;

export function buildNativeCatalog(
  manifest: Manifest,
  permissions: readonly string[],
  nativeChat: { nativeChatInstalled: boolean; anthropicConfigured: boolean } = {
    nativeChatInstalled: false,
    anthropicConfigured: false,
  },
) {
  const webAgents = new Map(manifest.agents.map((agent) => [agent.id, agent.enrolled]));
  const chatAgentIds = new Set<string>(CHAT_AGENT_IDS);
  const configured = manifest.providers.some((provider) => provider.id === CHAT_PROVIDER.id);
  const has = (permission: string) => permissions.includes(permission);
  const nativeChatAvailable =
    has("chat.send") && nativeChat.nativeChatInstalled && nativeChat.anthropicConfigured;
  const nativeChatReason = !has("chat.send")
    ? "chat_permission_not_granted"
    : !nativeChat.nativeChatInstalled
      ? "native_chat_not_installed"
      : !nativeChat.anthropicConfigured
        ? "anthropic_not_configured"
        : null;
  return {
    protocol: "omni.native-catalog/v2",
    checkedAt: manifest.checkedAt,
    providers: [
      ...manifest.providers.map(({ id, label }) => ({ id, label, configured: true })),
      { id: "anthropic", label: "Anthropic", configured: nativeChat.anthropicConfigured },
    ],
    models: [
      {
        id: CHAT_MODEL_REF,
        provider: CHAT_PROVIDER.id,
        configured,
        nativeChatAvailable: false,
        reason: "native_chat_not_available",
      },
      ...CLAUDE_ENGINE_IDS.map((id) => ({
        id,
        provider: "anthropic",
        configured: nativeChat.anthropicConfigured,
        nativeChatAvailable,
        ...(nativeChatReason ? { reason: nativeChatReason } : {}),
        ownerEngineSwitchRequired: true,
        freshOwnerPriceConfirmationRequired: true,
      })),
    ],
    agents: manifest.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      kind: agent.kind,
      webChatConfigured: webAgents.get(agent.id) === true,
      nativeChatAvailable: nativeChatAvailable && chatAgentIds.has(agent.id),
      ownerEngineSwitchRequired: true,
    })),
    chat: {
      available: nativeChatAvailable,
      permission: "chat.send",
      path: DOCK_PATHS.chat,
      projectsPath: DOCK_PATHS.projects,
      agentIds: [...CHAT_AGENT_IDS],
      models: [...CLAUDE_ENGINE_IDS],
      protocol: NATIVE_CHAT_PROTOCOL,
      streamingAvailable: false,
      responseDelivery: "settlement-gated-ndjson",
      maxOutputTokens: NATIVE_CHAT_MAX_OUTPUT_TOKENS,
      dailyCallLimit: NATIVE_CHAT_DAILY_LIMIT,
      perCallCapCents: 50,
      rolling24HourCapCents: 500,
      ownerAiApprovalRequired: true,
      ownerEngineSwitchRequired: true,
      freshOwnerPriceConfirmationRequired: true,
      transcriptStored: false,
      toolsAvailable: false,
      taskExecutionAvailable: false,
      ...(nativeChatReason ? { reason: nativeChatReason } : {}),
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
