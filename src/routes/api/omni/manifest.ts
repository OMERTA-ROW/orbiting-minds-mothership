import { createFileRoute } from "@tanstack/react-router";

// OMNI frontend contract (see src/lib/omni-contract.ts). Key scope: health.
export const Route = createFileRoute("/api/omni/manifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const m = await import("@/lib/omni-contract.server");
        return m.omniContractRead(request, "manifest");
      },
    },
  },
});
