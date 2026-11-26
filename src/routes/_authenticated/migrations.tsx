import { createFileRoute } from "@tanstack/react-router";
import { EvolutionWorkspace } from "@/components/evolution/Workspace";
import { evolutionWorkspaceQuery } from "@/lib/evolution-query";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/migrations")({
  head: () =>
    seo(
      "Migrations",
      "Evolution private owner migrations: verified records, configuration history and explicit infrastructure blockers.",
      { path: "/migrations" },
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(evolutionWorkspaceQuery),
  component: Page,
});
function Page() {
  return <EvolutionWorkspace view="migrations" />;
}
