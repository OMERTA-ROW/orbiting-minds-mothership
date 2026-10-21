import { createFileRoute } from "@tanstack/react-router";
import { Companion } from "@/components/cli/Companion";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/platform")({
  head: () =>
    seo(
      "EVOLUTION CLI · Lightweight Companion",
      "Compatibility-first Evolution CLI: private opt-in local discovery source and an offline AI usage/rate estimator. No mandatory subscription, device uploads, connected account or signed download required for browser preview.",
    ),
  component: Companion,
});
