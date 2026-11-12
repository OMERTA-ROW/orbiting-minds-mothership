/**
 * omni.dock/v1 read-only cloud task snapshot (metadata only: no commands, output or secrets). Public prefix because docked devices have no Mothership session; every
 * request is verified inside the handler (device ECDSA signature, nonce, clock window, paired
 * status and the matching per-device permission). Nothing here executes or dispatches work.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/omni/dock/cloud")({
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
          await handleSigned(request, "cloud", await adminDockStore(), Date.now()),
        );
      },
    },
  },
});
