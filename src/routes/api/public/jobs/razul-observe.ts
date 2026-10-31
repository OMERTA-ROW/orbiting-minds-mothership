import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { dispatchKnowledgeWork } from "@/lib/knowledge-runtime.server";

export const Route = createFileRoute("/api/public/jobs/razul-observe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const body = await request.json().catch(() => null);
        if (!body || body.kind !== "observe" || Object.keys(body).length !== 1)
          return Response.json({ error: "Invalid job request" }, { status: 400 });
        return dispatchKnowledgeWork(
          request,
          async () => {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { runRazulObservatoryJob } = await import("@/lib/razul-observatory-job.server");
            return runRazulObservatoryJob(
              {
                admin: supabaseAdmin,
                fetch,
                now: () => new Date(),
              },
              import.meta.env.DEV ? "preview_verification" : "schedule",
            );
          },
          import.meta.env.DEV,
        );
      },
    },
  },
});
