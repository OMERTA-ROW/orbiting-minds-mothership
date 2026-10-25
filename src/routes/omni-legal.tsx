import { createFileRoute } from "@tanstack/react-router";
import { OmniLegal } from "@/components/omnibridge/OmniLegal";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-legal")({
  head: () => seo("Omni Legal · Synthetic Case Preparation", "Prepare synthetic legal drafts, exhibits and PDF review packets with dated official federal procedural sources and code/test traceability. No real cases, signatures, court submissions or compliance certification."),
  component: OmniLegal,
});