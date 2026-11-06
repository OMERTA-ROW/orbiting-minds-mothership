import { createFileRoute } from "@tanstack/react-router";
import { ActivationApprovals } from "@/components/omnibridge/ActivationApprovals";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/activation-approvals")({
  head: () =>
    seo(
      "Activation Approvals · Owner Only",
      "Private owner-only go-live checklist for the OMNI–Jackboy link and CODE. Approvals are recorded with fresh two-factor and never switch, deploy or run anything.",
    ),
  component: ActivationApprovals,
});
