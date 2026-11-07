import { createFileRoute } from "@tanstack/react-router";
import { OmniTerminal } from "@/components/omnibridge/OmniTerminal";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-terminal")({
  head: () =>
    seo(
      "OMNI Terminal · Owner Only",
      "Private owner-only OMNI agent workspace: chat and live terminal over the secure link, passkey checks, per-agent budgets, Stop, kill switch and audit. Locked until the link self-test passes.",
    ),
  component: OmniTerminal,
});
