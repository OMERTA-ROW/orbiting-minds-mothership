import { createFileRoute } from "@tanstack/react-router";

// OMNI owner delegation (revoke). Server-to-server only; see docs/OMNI-OWNER-DELEGATION.md.
export const Route = createFileRoute("/api/public/omni/delegation/revoke")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const m = await import("@/lib/omni-delegation.server");
        return m.omniDelegationRevoke(request);
      },
    },
  },
});
