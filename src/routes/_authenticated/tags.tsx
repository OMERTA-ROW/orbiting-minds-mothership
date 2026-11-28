import { createFileRoute } from "@tanstack/react-router";
import { RepositoryFeatures } from "@/components/evolution/RepositoryFeatures";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/tags")({
  head: () =>
    seo(
      "Repository Tags",
      "Evolution private Forgejo tag records through the owner-verified read-only OMNI Block gateway.",
      { path: "/tags" },
    ),
  component: () => <RepositoryFeatures feature="tags" />,
});
