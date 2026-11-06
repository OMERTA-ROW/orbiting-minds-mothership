import { createFileRoute } from "@tanstack/react-router";
import { RoboticsCatalog } from "@/components/robotics/Catalog";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/robotics")({
  head: () =>
    seo(
      "Robotics & Mobility Lab",
      "Browse seven demo robotics, EV, service, rescue, aerospace and public-sector scenarios with research provenance and independent safety gates. No hardware connected.",
    ),
  component: RoboticsCatalog,
});
