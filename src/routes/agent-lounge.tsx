import { createFileRoute } from "@tanstack/react-router";
import { AgentLoungePage } from "@/components/genesis/Lounge";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/agent-lounge")({
  head: () =>
    seo(
      "Agent Welcome Lounge",
      "A fictional cosmic welcome deck with free symbolic virtual drinks, voluntary local icebreakers and authored code matches. No external agents or providers are enrolled.",
    ),
  component: AgentLoungePage,
});
