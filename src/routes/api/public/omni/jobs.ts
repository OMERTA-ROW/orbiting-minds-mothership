/**
 * OMNI jobs endpoint. Authenticated by the owner's scoped API key (hash
 * verified service-side); returns observatory job/run metadata only — status,
 * timestamps and counts, never payloads, secrets or private source errors.
 * Successful reads are recorded in the owner-visible control audit log.
 */
import { createFileRoute } from "@tanstack/react-router";
import { parseOmniBearer, sha256Hex } from "@/lib/omni-api-keys";

export const Route = createFileRoute("/api/public/omni/jobs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = parseOmniBearer(request.headers.get("authorization"));
        if (!key)
          return Response.json(
            { error: "A valid OMNI API key is required" },
            { status: 401, headers: { "Cache-Control": "no-store" } },
          );
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const hash = await sha256Hex(key);
        const verify = await supabaseAdmin.rpc("omni_api_key_verify", {
          _key_hash: hash,
          _scope: "jobs",
        });
        if (verify.error || !verify.data)
          return Response.json(
            { error: "Credential rejected" },
            { status: 401, headers: { "Cache-Control": "no-store" } },
          );

        const [state, runs] = await Promise.all([
          supabaseAdmin
            .from("razul_job_state")
            .select("paused_at,paused_reason,lease_until,retention_days,alert_threshold,updated_at")
            .eq("id", 1)
            .maybeSingle(),
          supabaseAdmin
            .from("razul_runs")
            .select("id,status,started_at,finished_at,fetched,inserted,alerts")
            .order("started_at", { ascending: false })
            .limit(10),
        ]);
        if (state.error || runs.error)
          return Response.json(
            { error: "Job metadata could not be read" },
            { status: 500, headers: { "Cache-Control": "no-store" } },
          );

        await supabaseAdmin.from("razul_control_audit").insert({
          actor_id: null,
          action: "use-jobs",
          record_type: "omni_api_key",
          record_id: verify.data,
        });

        return Response.json(
          {
            ok: true,
            scope: "jobs",
            observatory: state.data ?? null,
            recentRuns: runs.data,
            time: new Date().toISOString(),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
