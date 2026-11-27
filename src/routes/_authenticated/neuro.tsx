import { createFileRoute } from "@tanstack/react-router";
import { NeuroRegistry } from "@/components/evolution/NeuroRegistry";
import { neuroRegistryQuery } from "@/lib/neuro-query";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/_authenticated/neuro")({
  head: () =>
    seo(
      "Neuro Intelligence",
      "Private Evolution component registry with owner-scoped profile reviews, integrity evidence, approval and metadata rollback. Autonomy off.",
      { path: "/neuro" },
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(neuroRegistryQuery),
  component: NeuroRegistry,
});
