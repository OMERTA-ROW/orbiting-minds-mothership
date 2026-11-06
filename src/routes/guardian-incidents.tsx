import { createFileRoute } from "@tanstack/react-router";
import { AccountabilityDashboard } from "@/components/incidents/AccountabilityDashboard";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/guardian-incidents")({
  head: () =>
    seo(
      "Guardian Incident Accountability",
      "Evolution Mothership local DEMO incident register with evidence-separated accountability, independent review declarations and restricted publication.",
    ),
  component: AccountabilityDashboard,
});
