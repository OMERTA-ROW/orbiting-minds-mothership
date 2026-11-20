import { createFileRoute } from "@tanstack/react-router";

// OMNI frontend contract (see src/lib/omni-contract.ts). Chat needs an owner delegation with
// "chat:write" and database change 0066; until 0066 is installed every credential gets an
// honest refusal. API keys never chat.
export const Route = createFileRoute("/api/omni/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { classifyBearer } = await import("@/lib/omni-delegation");
        const chat = await import("@/lib/omni-delegated-chat.server");
        const installed = await chat.delegatedChatInstalled();
        if (classifyBearer(request.headers.get("authorization")).kind === "delegation") {
          if (installed) return chat.omniDelegatedChat(request);
          const d = await import("@/lib/omni-delegation.server");
          return d.omniDelegatedUnsupported(request, "chat");
        }
        const m = await import("@/lib/omni-contract.server");
        return installed
          ? m.omniContractNeedsDelegation(request, "chat:write")
          : m.omniContractUnsupported(request, "chat");
      },
    },
  },
});
