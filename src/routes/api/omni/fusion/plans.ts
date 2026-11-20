import { createFileRoute } from "@tanstack/react-router";

// OMNI frontend contract (see src/lib/omni-fusion.ts). Asking Fusion for a plan needs an owner
// delegation with "fusion:plan" (database change 0067, installed 2026-11-20). It can't start work, spend or
// pass the Emergency Stop; the planner isn't built, so admitted requests answer 503. API keys
// never reach Fusion.
export const Route = createFileRoute("/api/omni/fusion/plans")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { classifyBearer } = await import("@/lib/omni-delegation");
        if (classifyBearer(request.headers.get("authorization")).kind === "delegation") {
          const f = await import("@/lib/omni-fusion.server");
          return f.omniFusionPlanRequest(request);
        }
        const m = await import("@/lib/omni-contract.server");
        return m.omniContractNeedsDelegation(request, "fusion:plan");
      },
    },
  },
});
