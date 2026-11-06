import { createFileRoute } from "@tanstack/react-router";
import { OmniLegal } from "@/components/omnibridge/OmniLegal";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-legal")({
  head: () =>
    seo(
      "Omni Legal · Legal Forms Library & Preparation",
      "Organize limited official blank forms and federal procedural references in Legal Forms by confirmed jurisdiction, with separate synthetic PDF classification. No Desktop sync, private court records or submissions.",
    ),
  component: OmniLegal,
});
