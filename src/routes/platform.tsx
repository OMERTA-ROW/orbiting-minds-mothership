import { createFileRoute } from "@tanstack/react-router";
import { Companion } from "@/components/cli/Companion";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/platform")({
  head: () => seo("EVOLUTION CLI · Lightweight Companion", "Optional Evolution companion for existing macOS, Linux and Windows terminals. Planned command references, collision-safe omni fallback and honest signed-release gates; browser preview needs no download."),
  component: Companion,
});
