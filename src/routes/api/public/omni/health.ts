/**
 * OMNI health endpoint. Public-route prefix so owner tooling can reach it;
 * authentication is the owner's own scoped expiring API key (SHA-256 hash
 * verified in the database by a service-role-only function). Returns service
 * liveness metadata only — no secrets, keys, payloads or private records.
 */
import { createFileRoute } from "@tanstack/react-router";
import { parseOmniBearer, sha256Hex } from "@/lib/omni-api-keys";

export const Route = createFileRoute("/api/public/omni/health")({
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
          _scope: "health",
        });
        if (verify.error || !verify.data)
          return Response.json(
            { error: "Credential rejected" },
            { status: 401, headers: { "Cache-Control": "no-store" } },
          );
        return Response.json(
          {
            ok: true,
            service: "omni-mothership",
            scope: "health",
            time: new Date().toISOString(),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
