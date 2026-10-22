import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/knowledge-collect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runKnowledgeJob } = await import("@/lib/knowledge-job.server");
        const result = await runKnowledgeJob({ admin: supabaseAdmin, fetch, now: () => new Date(), apiKey: process.env["LOVABLE_API_KEY"] });
        return Response.json(result, { status: result.status === "failed" ? 500 : 200 });
      },
    },
  },
});
