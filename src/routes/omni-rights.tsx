import { createFileRoute } from "@tanstack/react-router";
import { OmniRights } from "@/components/omnibridge/OmniRights";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-rights")({
  head: () =>
    seo(
      "OMNI Rights · Copyright & Trademark Workspace",
      "Organise fictional or client copyright and trademark matters locally: evidence with URL and date, specimen flags, correspondence drafts and unconfirmed deadlines. No filings, payments or emails are sent.",
    ),
  component: OmniRights,
});
