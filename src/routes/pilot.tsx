import { createFileRoute } from "@tanstack/react-router";
import { PilotPage } from "@/components/care/Pilot";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/pilot")({ head: () => seo("Evolution Pilot · Permission Demo", "Bounded screen, pointer and browser action rehearsals with explicit scopes, previews and stop controls. No OS or browser access."), component: PilotPage });
