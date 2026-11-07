import { createFileRoute } from "@tanstack/react-router";
import { DockingBay } from "@/components/omnibridge/DockingBay";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-dock")({
  head: () =>
    seo(
      "OMNI Docking Bay · Owner Only",
      "Private owner-only dock for OMNI branches such as Honeycomb Terminal: one-time pairing codes, safety-code approval, per-device permissions, revocation, logs and Emergency Stop. Nothing executes.",
    ),
  component: DockingBay,
});
