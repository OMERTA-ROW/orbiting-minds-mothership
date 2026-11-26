import { createFileRoute } from "@tanstack/react-router";
import { EvolutionWorkspace } from "@/components/evolution/Workspace";
import { evolutionWorkspaceQuery } from "@/lib/evolution-query";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/deployments")({
  head: () =>
    seo(
      "Deployments",
      "Evolution private owner deployments: verified records, configuration history and explicit infrastructure blockers.",
      { path: "/deployments" },
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(evolutionWorkspaceQuery),
  component: Page,
});
function Page() {
  return <EvolutionWorkspace view="deployments" />;
}
