import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/omni/dock/native-device-status")({
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
          await handleSigned(request, "nativeDeviceStatus", await adminDockStore(), Date.now()),
        );
      },
    },
  },
});
