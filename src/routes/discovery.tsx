import { createFileRoute } from "@tanstack/react-router";
import { DiscoveryPage } from "@/components/genesis/Showcases";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/discovery")({ head: () => seo("Discovery Radar", "Search cited demo contributions and local knowledge capsules across domains with editorial connections and honest attribution."), component: DiscoveryPage });