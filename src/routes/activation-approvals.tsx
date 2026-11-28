import { createFileRoute } from "@tanstack/react-router";
import { ActivationApprovals } from "@/components/omnibridge/ActivationApprovals";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/activation-approvals")({
  head: () =>
    seo(
      "Activation Approvals · Owner Only",
      "Private owner-only OMNI–Jackboy decisions, evidence and separately confirmed activation controls. Fresh two-factor confirmation is required; execution remains unavailable without verified services.",
    ),
  component: ActivationApprovals,
});
