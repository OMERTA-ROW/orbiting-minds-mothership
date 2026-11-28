import { createFileRoute } from "@tanstack/react-router";
import { RepositoryFeatures } from "@/components/evolution/RepositoryFeatures";
import { EvolutionWorkspace } from "@/components/evolution/Workspace";
import { evolutionWorkspaceQuery } from "@/lib/evolution-query";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/actions")({
  head: () =>
    seo(
      "Actions",
      "Evolution private owner actions: verified records, configuration history and explicit infrastructure blockers.",
      { path: "/actions" },
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(evolutionWorkspaceQuery),
  component: Page,
});
function Page() {
  return (
    <>
      <RepositoryFeatures feature="actions" />
      <details className="mt-6 border-t border-border pt-4">
        <summary className="cursor-pointer text-sm text-primary">
          Existing project execution configuration and safety controls
        </summary>
        <EvolutionWorkspace view="actions" embedded />
      </details>
    </>
  );
}
