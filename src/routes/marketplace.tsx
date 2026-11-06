import { createFileRoute } from "@tanstack/react-router";
import { MarketplacePage } from "@/components/genesis/Showcases";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/marketplace")({
  head: () =>
    seo(
      "Creator Marketplace · Demo Listings",
      "Locally prepare attributed demo capsule listings after simulation and review. USD pricing TBD; checkout, payments and payouts disabled.",
    ),
  component: MarketplacePage,
});
