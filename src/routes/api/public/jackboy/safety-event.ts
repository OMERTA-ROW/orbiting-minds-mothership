import { createFileRoute } from "@tanstack/react-router";

// Signed Jackboy stop notices only (jackboy.safety-event/v1). The handler verifies the HMAC,
// clock, nonce and project before recording; it can only record a stop, never release one.
export const Route = createFileRoute("/api/public/jackboy/safety-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleSafetyEvent } = await import("@/lib/jackboy-safety.server");
        return handleSafetyEvent(request, {
          admin: async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin,
        });
      },
    },
  },
});
