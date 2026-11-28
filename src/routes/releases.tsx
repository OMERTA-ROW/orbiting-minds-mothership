import { createFileRoute } from "@tanstack/react-router";
import { RepositoryFeatures } from "@/components/evolution/RepositoryFeatures";
import { RetiredAreaPage } from "@/components/RetiredArea";
import { seo } from "@/lib/seo";

// Real provider reads; earlier browser-saved records remain downloadable.
export const Route = createFileRoute("/releases")({
  head: () =>
    seo(
      "Repository Releases",
      "Evolution private repository release reads with owner verification and preserved earlier browser records.",
    ),
  component: () => (
    <>
      <RepositoryFeatures feature="releases" />
      <details className="mx-4 mt-6 border-t border-border pt-4">
        <summary className="cursor-pointer text-sm text-primary">
          Earlier browser records and release preparation status
        </summary>
        <RetiredAreaPage />
      </details>
    </>
  ),
});
