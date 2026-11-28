import { createFileRoute } from "@tanstack/react-router";
import { RepositoryFeatures } from "@/components/evolution/RepositoryFeatures";
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
  return (
    <>
      <RepositoryFeatures feature="pull-requests" />
      <details className="mt-6 border-t border-border pt-4">
        <summary className="cursor-pointer text-sm text-primary">
          Existing project configuration and review controls
        </summary>
        <EvolutionWorkspace view="pull-requests" embedded />
      </details>
    </>
  );
}
