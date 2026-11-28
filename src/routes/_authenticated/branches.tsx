import { createFileRoute } from "@tanstack/react-router";
import { RepositoryFeatures } from "@/components/evolution/RepositoryFeatures";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/_authenticated/branches")({
  head: () =>
    seo(
      "Branches",
      "Evolution private repository branches: real provider reads and explicit setup blockers.",
      { path: "/branches" },
    ),
  component: () => <RepositoryFeatures feature="branches" />,
});
