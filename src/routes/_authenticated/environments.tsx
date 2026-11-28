import { createFileRoute } from "@tanstack/react-router";
import { RepositoryFeatures } from "@/components/evolution/RepositoryFeatures";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/_authenticated/environments")({
  head: () =>
    seo(
      "Environments",
      "Evolution private repository environments: real provider reads and explicit setup blockers.",
      { path: "/environments" },
    ),
  component: () => <RepositoryFeatures feature="environments" />,
});
