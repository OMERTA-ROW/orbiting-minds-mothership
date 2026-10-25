import { createFileRoute } from "@tanstack/react-router";
import { OmniMarketing } from "@/components/omnibridge/OmniMarketing";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-marketing")({
  head: () =>
    seo(
      "OMNI Marketing · Project-to-Market Workspace",
      "Upload a text brief, see extracted evidence, compare three launch routes, draft versioned assets and set an execution policy. Publishing adapters are not connected; jobs stay blocked with exact prerequisites.",
    ),
  component: OmniMarketing,
});
