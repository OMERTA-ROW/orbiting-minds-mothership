import { createFileRoute } from "@tanstack/react-router";
import { RepositoryFeatures } from "@/components/evolution/RepositoryFeatures";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/_authenticated/issues")({
  head: () =>
    seo(
      "Issues",
      "Evolution private repository issues: real provider reads and explicit setup blockers.",
      { path: "/issues" },
    ),
  component: () => <RepositoryFeatures feature="issues" />,
});
