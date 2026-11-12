/**
 * omni.dock/v1 read-only handed-off task status. Public prefix because docked devices have no
 * Mothership session; every request is verified inside the handler
 * (owner-issued single-use code and/or device ECDSA signature, nonce, clock
 * window). Returns this device's own task statuses only; nothing executes or dispatches.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/omni/dock/jobs-status")({
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
          await handleSigned(request, "jobsStatus", await adminDockStore(), Date.now()),
        );
      },
    },
  },
});
