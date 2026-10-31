import { createFileRoute } from "@tanstack/react-router";
import { OmniGateway } from "@/components/omnibridge/OmniGateway";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-gateway")({
  head: () =>
    seo(
      "OMNI Coding Gateway · Blocked Runner",
      "Private planning workspace for the Jackboy coding gateway. No sandbox runner, job API, repository write, merge or deploy is connected; every task stops as blocked.",
    ),
  component: OmniGateway,
});
