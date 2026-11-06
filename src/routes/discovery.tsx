import { createFileRoute } from "@tanstack/react-router";
import { DiscoveryPage } from "@/components/genesis/Showcases";
import { seo } from "@/lib/seo";
import { roboticsPresetSearch } from "@/lib/robotics";
export const Route = createFileRoute("/discovery")({
  validateSearch: roboticsPresetSearch,
  head: () =>
    seo(
      "Oracle · Discovery Radar",
      "Search cited demo contributions, robotics research hypotheses and local knowledge capsules with editorial connections and honest attribution.",
    ),
  component: DiscoveryRoute,
});
function DiscoveryRoute() {
  const { scenario } = Route.useSearch();
  return <DiscoveryPage key={scenario ?? "discovery"} scenarioId={scenario} />;
}
