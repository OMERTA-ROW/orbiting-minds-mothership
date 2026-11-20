import { createFileRoute } from "@tanstack/react-router";

// OMNI frontend contract (see src/lib/omni-contract.ts). Owner-only on the Mothership: honest 403.
export const Route = createFileRoute("/api/omni/emergency-stop")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const m = await import("@/lib/omni-contract.server");
        return m.omniContractUnsupported(request, "emergency-stop");
      },
    },
  },
});
