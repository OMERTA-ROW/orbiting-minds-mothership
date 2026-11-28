import { createFileRoute } from "@tanstack/react-router";
import { CloudServices } from "@/components/evolution/console/CloudServices";
import { controlCenterQuery } from "@/lib/evolution-query";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/cloud-services")({
  head: () =>
    seo(
      "Cloud Services · Evolution",
      "Owner-only cloud connection records, read-only provider checks and explicit infrastructure availability states.",
      { path: "/cloud-services" },
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(controlCenterQuery),
  component: CloudServices,
});
