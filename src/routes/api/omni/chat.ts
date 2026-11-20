import { createFileRoute } from "@tanstack/react-router";

// OMNI frontend contract (see src/lib/omni-contract.ts). Not enabled for API keys: honest 403.
export const Route = createFileRoute("/api/omni/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const m = await import("@/lib/omni-contract.server");
        return m.omniContractUnsupported(request, "chat");
      },
    },
  },
});
