/**
 * omni.dock/v1 pause/stop control (reductions only: no resume, approve or start). Public prefix because docked devices have no Mothership session; every
 * request is verified inside the handler (device ECDSA signature, nonce, clock window, paired
 * status and the matching per-device permission). Nothing here executes or dispatches work.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/omni/dock/control")({
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
          await handleSigned(request, "control", await adminDockStore(), Date.now()),
        );
      },
    },
  },
});
