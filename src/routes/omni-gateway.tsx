import { createFileRoute } from "@tanstack/react-router";
import { RetiredAreaPage } from "@/components/RetiredArea";
import { seo } from "@/lib/seo";

// Former browser-only prototype (removed 2026-11-20). Shows an honest "not connected" page.
export const Route = createFileRoute("/omni-gateway")({
  head: () => seo("OMNI Gateway \u2014 Not connected", "OMNI Gateway is not connected to a real service. Evolution preserves prior browser records and provides an existing alternative."),
  component: RetiredAreaPage,
});
