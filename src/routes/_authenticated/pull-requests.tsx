import { createFileRoute } from "@tanstack/react-router";
import { EvolutionWorkspace } from "@/components/evolution/Workspace";
import { evolutionWorkspaceQuery } from "@/lib/evolution-query";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/pull-requests")({
  head: () =>
    seo(
      "Pull Requests",
      "Evolution private owner pull requests: verified records, configuration history and explicit infrastructure blockers.",
      { path: "/pull-requests" },
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(evolutionWorkspaceQuery),
  component: Page,
});
function Page() {
  return <EvolutionWorkspace view="pull-requests" />;
}
