import { createFileRoute } from "@tanstack/react-router";
import { GuardianCenter } from "@/components/guardian/Center";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/guardian")({
  head: () => seo("Guardian Security Center · Defensive Demo", "Ghost Security, Iron Defense and Global Eye: local incident exercises, bounded device scopes, proposed-only security reviews and unverified public launch gates. No endpoint monitoring."),
  component: GuardianCenter,
});
