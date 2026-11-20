import { createFileRoute } from "@tanstack/react-router";

// OMNI frontend contract (see src/lib/omni-contract.ts). Engage only, with an owner delegation
// holding "safety:emergency-stop"; API keys get 403 delegation_required. Release stays owner-only.
export const Route = createFileRoute("/api/omni/emergency-stop")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { classifyBearer } = await import("@/lib/omni-delegation");
        if (classifyBearer(request.headers.get("authorization")).kind === "delegation") {
          const d = await import("@/lib/omni-delegation.server");
          return d.omniDelegatedStop(request);
        }
        const m = await import("@/lib/omni-contract.server");
        return m.omniContractNeedsDelegation(request, "safety:emergency-stop");
      },
    },
  },
});
