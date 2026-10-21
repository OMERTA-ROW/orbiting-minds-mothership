import { createFileRoute } from "@tanstack/react-router";
import { GuardianCenter } from "@/components/guardian/Center";
import { seo } from "@/lib/seo";
import { guardianReviewSurfaces } from "@/data/evolution";

export const Route = createFileRoute("/guardian")({
  validateSearch: (search: Record<string, unknown>): { tab?: string | undefined; surface?: string | undefined } => ({ tab: search["tab"] === "review" ? "review" : undefined, surface: typeof search["surface"] === "string" && guardianReviewSurfaces.some(s => s.id === search["surface"]) ? search["surface"] : undefined }),
  head: () => seo("Guardian Security Center · Defensive Demo", "Ghost Security, Iron Defense and Global Eye: local incident exercises, bounded device scopes, proposed-only security reviews and unverified public launch gates. No endpoint monitoring."),
  component: GuardianPage,
});
function GuardianPage() { const { tab, surface } = Route.useSearch(); return <GuardianCenter key={`${tab}-${surface}`} initialTab={tab} initialSurface={surface} />; }
