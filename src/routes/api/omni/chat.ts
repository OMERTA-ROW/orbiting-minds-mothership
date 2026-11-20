import { createFileRoute } from "@tanstack/react-router";

// OMNI frontend contract (see src/lib/omni-contract.ts). Chat is not enabled for any credential: honest 403.
export const Route = createFileRoute("/api/omni/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { classifyBearer } = await import("@/lib/omni-delegation");
        if (classifyBearer(request.headers.get("authorization")).kind === "delegation") {
          const d = await import("@/lib/omni-delegation.server");
          return d.omniDelegatedUnsupported(request, "chat");
        }
        const m = await import("@/lib/omni-contract.server");
        return m.omniContractUnsupported(request, "chat");
      },
    },
  },
});
