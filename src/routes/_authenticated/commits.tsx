import { createFileRoute } from "@tanstack/react-router";
import { RepositoryFeatures } from "@/components/evolution/RepositoryFeatures";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/_authenticated/commits")({
  head: () =>
    seo(
      "Commits",
      "Evolution private repository commits: real provider reads and explicit setup blockers.",
      { path: "/commits" },
    ),
  component: () => <RepositoryFeatures feature="commits" />,
});
