import { createFileRoute } from "@tanstack/react-router";
import { RepositoryFeatures } from "@/components/evolution/RepositoryFeatures";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/_authenticated/code-search")({
  head: () =>
    seo(
      "Code Search",
      "Evolution private repository code search: real provider reads and explicit setup blockers.",
      { path: "/code-search" },
    ),
  component: () => <RepositoryFeatures feature="code-search" />,
});
