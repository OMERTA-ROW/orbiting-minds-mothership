import { createFileRoute } from "@tanstack/react-router";
import { OmniBridge } from "@/components/omnibridge/OmniBridge";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/omnibridge")({
  head: () =>
    seo(
      "OmniBridge · Capability & Intent Terminal",
      "Explore Evolution’s cosmic capability graph and explainable local DEMO plans: explicit scopes, independent agent handoffs, human review and disabled official API/desktop/testnet references. No connected tools, wallets or execution.",
    ),
  component: OmniBridge,
});
