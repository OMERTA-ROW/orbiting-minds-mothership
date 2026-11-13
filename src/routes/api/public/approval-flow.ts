/**
 * Public approval-flow marker. Returns only the Activation Approvals flow version this build
 * carries, so a preview can tell whether the published site is outdated. No records, settings,
 * approvals or identities are read; nothing here needs or grants access.
 */
import { createFileRoute } from "@tanstack/react-router";
import { markerBody } from "@/lib/approval-flow-build";

export const Route = createFileRoute("/api/public/approval-flow")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(markerBody(), {
          headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
        }),
    },
  },
});
