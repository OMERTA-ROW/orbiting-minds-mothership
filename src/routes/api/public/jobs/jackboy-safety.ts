import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Scheduled Jackboy safety sync: freshness enforcement plus, once Step 9 is in effect, one
// signed read-only safety-state request. Failures record "unknown", which halts autonomy/CODE.
export const Route = createFileRoute("/api/public/jobs/jackboy-safety")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const body = await request.json().catch(() => null);
        if (!body || body.kind !== "jackboy_safety" || Object.keys(body).length !== 1)
          return Response.json({ error: "Invalid job request" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncJackboySafety } = await import("@/lib/jackboy-safety.server");
        try {
          const result = await syncJackboySafety(supabaseAdmin);
          return Response.json(result, { headers: { "cache-control": "no-store" } });
        } catch {
          return Response.json({ error: "sync_failed" }, { status: 500 });
        }
      },
    },
  },
});
