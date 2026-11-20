import { createFileRoute } from "@tanstack/react-router";
import { RetiredAreaPage } from "@/components/RetiredArea";
import { seo } from "@/lib/seo";

// Former demo area (removed 2026-11-20). Shows an honest "not connected" page.
export const Route = createFileRoute("/robotics")({
  head: () => seo("Not connected", "This feature isn't connected to a real service yet."),
  component: RetiredAreaPage,
});
