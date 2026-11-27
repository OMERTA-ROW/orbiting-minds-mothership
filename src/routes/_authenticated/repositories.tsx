import { createFileRoute } from "@tanstack/react-router";
import { EvolutionWorkspace } from "@/components/evolution/Workspace";
import { evolutionWorkspaceQuery } from "@/lib/evolution-query";
import { seo } from "@/lib/seo";
import { ForgejoRepos } from "@/components/evolution/ForgejoRepos";

export const Route = createFileRoute("/_authenticated/repositories")({
  head: () =>
    seo(
      "Repositories",
      "Evolution private owner repositories: verified records, configuration history and explicit infrastructure blockers.",
      { path: "/repositories" },
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(evolutionWorkspaceQuery),
  component: Page,
});
function Page() {
  return (
    <>
      <ForgejoRepos />
      <EvolutionWorkspace view="repositories" />
    </>
  );
}
