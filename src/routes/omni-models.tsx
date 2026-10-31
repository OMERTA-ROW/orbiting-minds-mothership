import { createFileRoute } from "@tanstack/react-router";
import { OmniModelGateway } from "@/components/omnibridge/OmniModelGateway";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-models")({
  head: () =>
    seo(
      "OMNI Model Gateway · Declarations Only",
      "Model-agnostic multi-agent gateway: provider adapters, agent passports, routing plans and the Jackboy dispatch loop. No model is connected; credential prerequisites and the acceptance test are listed.",
    ),
  component: OmniModelGateway,
});
