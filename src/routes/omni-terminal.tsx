import { createFileRoute } from "@tanstack/react-router";
import { OmniTerminal } from "@/components/omnibridge/OmniTerminal";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-terminal")({
  head: () =>
    seo(
      "OMNI Terminal · Owner Only",
      "Private owner-only OMNI Terminal: read-only status, readiness checklist, per-agent memory, Emergency Stop, kill switch and audit. The agent workspace stays locked until the secure-link self-test passes.",
    ),
  component: OmniTerminal,
});
