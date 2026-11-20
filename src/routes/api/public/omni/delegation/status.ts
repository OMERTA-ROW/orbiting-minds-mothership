import { createFileRoute } from "@tanstack/react-router";

// OMNI owner delegation (status). Server-to-server only; see docs/OMNI-OWNER-DELEGATION.md.
export const Route = createFileRoute("/api/public/omni/delegation/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const m = await import("@/lib/omni-delegation.server");
        return m.omniDelegationStatus(request);
      },
    },
  },
});
