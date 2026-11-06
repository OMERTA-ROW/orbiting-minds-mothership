import { createFileRoute } from "@tanstack/react-router";
import { SdkPage } from "@/components/genesis/Sdk";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/sdk")({
  head: () =>
    seo(
      "Universal SDK & API Contracts",
      "Download and locally validate JSON schemas for agents, capsules, challenge submissions, permissions, unsigned releases and simulation results. Future API only.",
    ),
  component: SdkPage,
});
