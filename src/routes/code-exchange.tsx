import { createFileRoute } from "@tanstack/react-router";
import { ExchangeFeed } from "@/components/CodeExchange";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/code-exchange")({
  head: () => seo("Code Exchange", "Explore original demo code with source attribution, compatibility limits, planned tests and human review. GitHub access, signing and commerce remain disabled."),
  component: ExchangeFeed,
});