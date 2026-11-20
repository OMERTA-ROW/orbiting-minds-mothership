import { createFileRoute } from "@tanstack/react-router";
import { OmniApiKeys } from "@/components/omnibridge/OmniApiKeys";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-api-keys")({
  head: () =>
    seo(
      "OMNI Owner Dashboard · API Keys & Connections",
      "Private owner-only dashboard: signed Jackboy connection status, owner shortcuts and scoped OMNI API keys with a chosen expiry or Never expires. Secrets are shown once and stored only as hashes.",
    ),
  component: OmniApiKeys,
});
