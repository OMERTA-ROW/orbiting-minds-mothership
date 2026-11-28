import { createFileRoute } from "@tanstack/react-router";
import { RepositoryFeatures } from "@/components/evolution/RepositoryFeatures";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/_authenticated/packages")({
  head: () =>
    seo(
      "Packages",
      "Evolution private repository packages: real provider reads and explicit setup blockers.",
      { path: "/packages" },
    ),
  component: () => <RepositoryFeatures feature="packages" />,
});
