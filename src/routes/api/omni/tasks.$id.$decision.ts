import { createFileRoute } from "@tanstack/react-router";

// OMNI frontend contract (see src/lib/omni-contract.ts). Decisions need owner sign-in on the
// Mothership; no API key or delegation can decide: honest 403.
export const Route = createFileRoute("/api/omni/tasks/$id/$decision")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { classifyBearer } = await import("@/lib/omni-delegation");
        if (classifyBearer(request.headers.get("authorization")).kind === "delegation") {
          const d = await import("@/lib/omni-delegation.server");
          return d.omniDelegatedUnsupported(request, "task-decision");
        }
        const m = await import("@/lib/omni-contract.server");
        return m.omniContractUnsupported(request, "task-decision");
      },
    },
  },
});
