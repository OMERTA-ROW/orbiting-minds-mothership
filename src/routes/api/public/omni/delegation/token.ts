import { createFileRoute } from "@tanstack/react-router";

// OMNI owner delegation (token). Server-to-server only; see docs/OMNI-OWNER-DELEGATION.md.
export const Route = createFileRoute("/api/public/omni/delegation/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const m = await import("@/lib/omni-delegation.server");
        return m.omniDelegationToken(request);
      },
    },
  },
});
