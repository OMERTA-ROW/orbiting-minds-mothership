import { createFileRoute } from "@tanstack/react-router";

// OMNI frontend contract (see src/lib/omni-contract.ts). Read-only observatory runs, "jobs" scope.
export const Route = createFileRoute("/api/omni/tasks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const m = await import("@/lib/omni-contract.server");
        return m.omniContractTasks(request);
      },
    },
  },
});
