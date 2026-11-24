/**
 * Signed, device-scoped native capability discovery. The response reports live
 * server configuration separately from capabilities the native API can use.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/omni/dock/catalog")({
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
          await handleSigned(request, "catalog", await adminDockStore(), Date.now()),
        );
      },
    },
  },
});
