import { createFileRoute } from "@tanstack/react-router";
import { TwinPage } from "@/components/genesis/Twin";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/digital-twin")({
  validateSearch: (search: Record<string, unknown>): { capsule?: string } =>
    typeof search["capsule"] === "string" ? { capsule: search["capsule"].slice(0, 100) } : {},
  head: () =>
    seo(
      "Digital Twin Lab",
      "Configure deterministic synthetic latency models with baseline, target and result records. Submitted code is not executed; no hardware evidence.",
    ),
  component: Page,
});
function Page() {
  const { capsule } = Route.useSearch();
  return <TwinPage key={capsule ?? ""} capsuleId={capsule ?? ""} />;
}
