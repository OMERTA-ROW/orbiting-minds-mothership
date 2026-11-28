import { createFileRoute } from "@tanstack/react-router";
import { EvolutionWorkspace } from "@/components/evolution/Workspace";
import { evolutionWorkspaceQuery } from "@/lib/evolution-query";
import { seo } from "@/lib/seo";
import { ForgejoRepos } from "@/components/evolution/ForgejoRepos";
import { OwnerConsoleShell } from "@/components/evolution/console/OwnerConsoleShell";

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
    <OwnerConsoleShell area="developer">
      <ForgejoRepos />
      <details className="mx-auto mt-5 max-w-[1700px] rounded-2xl border border-gold/20 bg-console-panel/90 p-5 shadow-console backdrop-blur-md">
        <summary className="cursor-pointer text-sm font-semibold text-gold-light">
          Project records & configuration
        </summary>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Existing private project creation and immutable configuration controls are preserved here.
        </p>
        <EvolutionWorkspace view="repositories" embedded />
      </details>
    </OwnerConsoleShell>
  );
}
