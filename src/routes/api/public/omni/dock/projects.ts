/**
 * Signed, native-only owner project discovery for the text-chat client.
 * The response contains project IDs and names only, never briefs or records.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/omni/dock/projects")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { dockPreflight } = await import("@/lib/omni-dock.server");
        return dockPreflight(request);
      },
      POST: async ({ request }) => {
        const { dockResponse, handleSigned } = await import("@/lib/omni-dock.server");
        const { adminDockStore } = await import("@/lib/omni-dock-store.server");
        return dockResponse(
          request,
          await handleSigned(request, "projects", await adminDockStore(), Date.now()),
        );
      },
    },
  },
});
