import { createFileRoute } from "@tanstack/react-router";
import { OmniTerminal } from "@/components/omnibridge/OmniTerminal";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-terminal")({
  head: () =>
    seo(
      "OMNI Terminal · Owner Only",
      "Private owner-only OMNI terminal: status, history, held CODE and agent tasks, Emergency Stop and autonomous-mode controls. Nothing runs code or turns anything on.",
    ),
  component: OmniTerminal,
});
