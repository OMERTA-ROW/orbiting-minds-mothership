import { createFileRoute } from "@tanstack/react-router";
import { ReleasesPage } from "@/components/genesis/Showcases";
import { seo } from "@/lib/seo";
import { roboticsPresetSearch } from "@/lib/robotics";
export const Route = createFileRoute("/releases")({
  validateSearch: roboticsPresetSearch,
  head: () =>
    seo(
      "Release Galaxy · Unsigned Previews",
      "Prepare local demo release manifests and robotics research passports with rollback, license and synthetic records. No signing, distribution or deployment.",
    ),
  component: ReleasesRoute,
});
function ReleasesRoute() {
  const { scenario } = Route.useSearch();
  return <ReleasesPage scenarioId={scenario} />;
}
