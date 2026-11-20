import { createFileRoute } from "@tanstack/react-router";

// OMNI frontend contract (see src/lib/omni-contract.ts). Decisions need owner sign-in: honest 403.
export const Route = createFileRoute("/api/omni/tasks/$id/$decision")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const m = await import("@/lib/omni-contract.server");
        return m.omniContractUnsupported(request, "task-decision");
      },
    },
  },
});
