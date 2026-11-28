import { createFileRoute } from "@tanstack/react-router";
import { RepositoryFeatures } from "@/components/evolution/RepositoryFeatures";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/_authenticated/wiki")({
  head: () =>
    seo(
      "Wiki",
      "Evolution private repository wiki: real provider reads and explicit setup blockers.",
      { path: "/wiki" },
    ),
  component: () => <RepositoryFeatures feature="wiki" />,
});
