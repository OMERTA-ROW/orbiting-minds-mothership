import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/omni/noop-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env["OMNI_NOOP_WORKER_ENABLED"] !== "true")
          return Response.json({ error: "worker_disabled" }, { status: 503 });
        const { handleNoopWorker, productionNoopDeps } =
          await import("@/lib/omni-noop-broker.server");
        return handleNoopWorker(request, await productionNoopDeps());
      },
    },
  },
});
