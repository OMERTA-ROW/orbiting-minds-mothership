import { createFileRoute } from "@tanstack/react-router";
import { OmniLegal } from "@/components/omnibridge/OmniLegal";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-legal")({
  head: () => seo("Omni Legal · Official Forms & Synthetic Preparation", "Retrieve a limited verified official California blank-form catalog and prepare synthetic legal review packets with sourced code/test traceability. No private court records, signatures or submissions."),
  component: OmniLegal,
});