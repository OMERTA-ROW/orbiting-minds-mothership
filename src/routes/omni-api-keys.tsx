import { createFileRoute } from "@tanstack/react-router";
import { OmniApiKeys } from "@/components/omnibridge/OmniApiKeys";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-api-keys")({
  head: () =>
    seo(
      "OMNI API Credentials · Owner Only",
      "Private owner-only provisioning for scoped OMNI API keys. Secrets are shown once and stored only as hashes; keys authenticate the health and jobs endpoints and connect nothing external.",
    ),
  component: OmniApiKeys,
});
