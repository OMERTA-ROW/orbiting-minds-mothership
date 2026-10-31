import { createFileRoute } from "@tanstack/react-router";
import { AngelTechWorkspace } from "@/components/omnibridge/AngelTechWorkspace";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/angel-tech")({
  head: () =>
    seo(
      "Angel Tech · Sabrina Concept Workspace",
      "Concept-stage Sabrina marketing intelligence and a private local registry for prospective consenting AI agent and research-group partnerships. No outreach, provider connection or private-data access is active.",
    ),
  component: AngelTechWorkspace,
});
