import { createFileRoute } from "@tanstack/react-router";
import { Companion } from "@/components/cli/Companion";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/platform")({
  head: () =>
    seo(
      "EVOLUTION CLI · Lightweight Companion",
      "Compatibility-first Evolution CLI for existing macOS, Linux and Windows terminals. Optional basic access, transparent provider-cost boundaries, exportable policy and planned signed-release gates; no download required for preview.",
    ),
  component: Companion,
});
