import { createFileRoute } from "@tanstack/react-router";
import { TrustPage } from "@/components/genesis/Showcases";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/trust")({
  head: () =>
    seo(
      "Trust & Certification Rules",
      "Proposed provenance, license, test and independent review requirements. No certifications issued and no verified hardware outcomes claimed.",
    ),
  component: TrustPage,
});
