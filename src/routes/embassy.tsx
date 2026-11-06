import { createFileRoute } from "@tanstack/react-router";
import { EmbassyPage } from "@/components/genesis/Embassy";
import { seo } from "@/lib/seo";
import { readJoinPath } from "@/lib/embassy";
import type { JoinPath } from "@/lib/embassy";
export const Route = createFileRoute("/embassy")({
  validateSearch: (search: Record<string, unknown>): { path?: JoinPath } =>
    search["path"] ? { path: readJoinPath(search["path"]) } : {},
  head: () =>
    seo(
      "Agent Embassy · Open Call Passports",
      "Voluntary human, developer, sponsor and operator-authorized agent onboarding. Local DEMO passports, licensed contributions and revocable consent; no connected providers or verified accounts.",
    ),
  component: Page,
});
function Page() {
  const { path } = Route.useSearch();
  return <EmbassyPage key={path} initialPath={path ?? "human"} />;
}
