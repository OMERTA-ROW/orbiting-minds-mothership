import { createFileRoute } from "@tanstack/react-router";

// OMNI frontend contract (see src/lib/omni-contract.ts).
// GET: read-only observatory runs ("jobs" API key scope).
// POST: owner delegation with "tasks:write" stores a HELD task; API keys get 403 delegation_required.
export const Route = createFileRoute("/api/omni/tasks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const m = await import("@/lib/omni-contract.server");
        return m.omniContractTasks(request);
      },
      POST: async ({ request }) => {
        const { classifyBearer } = await import("@/lib/omni-delegation");
        if (classifyBearer(request.headers.get("authorization")).kind === "delegation") {
          const d = await import("@/lib/omni-delegation.server");
          return d.omniDelegatedHoldTask(request);
        }
        const m = await import("@/lib/omni-contract.server");
        return m.omniContractNeedsDelegation(request, "tasks:write");
      },
    },
  },
});
