import { createFileRoute } from "@tanstack/react-router";
import { UpdatesPage } from "@/components/care/Updates";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/updates")({ head: () => seo("Auto-Update Engine · Dry Runs", "Historical source-cited release catalog with local policies, hypothetical verification gates and staged demo approvals. No update installation."), component: UpdatesPage });
