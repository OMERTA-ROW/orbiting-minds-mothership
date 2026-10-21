import { createFileRoute } from "@tanstack/react-router";
import { FleetPage } from "@/components/guardian/Fleet";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/fleet")({ head: () => seo("Fleet Control · Scoped Dry Runs", "Prepare and approve device-bound demo maintenance plans with expiry, scope checks, local history and emergency pause. No live queues, arbitrary shell or device execution."), component: FleetPage });
