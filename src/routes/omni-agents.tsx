import { createFileRoute } from "@tanstack/react-router";
import { OmniAgentRegistry } from "@/components/omnibridge/OmniAgentRegistry";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-agents")({
  head: () =>
    seo(
      "OMNI Agent Registry · Concept",
      "Private registry and collaboration conventions for specialist agents (AngelTech, DemonTech, Guardian). Declarations only — no agent is live, and approval boundaries always need the owner.",
    ),
  component: OmniAgentRegistry,
});
