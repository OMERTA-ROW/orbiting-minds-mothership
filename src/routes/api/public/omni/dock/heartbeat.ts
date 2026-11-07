/**
 * omni.dock/v1 heartbeat endpoint. Public prefix because docked devices have no
 * Mothership session; every request is verified inside the handler
 * (owner-issued single-use code and/or device ECDSA signature, nonce, clock
 * window). Returns dock state only; nothing executes or dispatches.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/omni/dock/heartbeat")({
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
          await handleSigned(request, "heartbeat", await adminDockStore(), Date.now()),
        );
      },
    },
  },
});
