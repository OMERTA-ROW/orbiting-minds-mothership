import { createFileRoute } from "@tanstack/react-router";
import { ComputePage } from "@/components/genesis/Showcases";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/compute-grid")({
  head: () =>
    seo(
      "Opt-in Compute Grid",
      "Local node configuration and revocable opt-in architecture with USD zero spend caps. No connected devices, remote tasks or shell execution.",
    ),
  component: ComputePage,
});
