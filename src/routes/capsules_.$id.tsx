import { createFileRoute } from "@tanstack/react-router";
import { RetiredAreaPage } from "@/components/RetiredArea";
import { seo } from "@/lib/seo";

// Former demo area (removed 2026-11-20). Shows an honest "not connected" page.
export const Route = createFileRoute("/capsules_/$id")({
  head: () => seo("Capsules Detail \u2014 Not connected", "Capsules Detail is not connected to a real service. Evolution preserves prior browser records and provides an existing alternative."),
  component: RetiredAreaPage,
});
