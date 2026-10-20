import { createFileRoute } from "@tanstack/react-router";
import { ReleasesPage } from "@/components/genesis/Showcases";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/releases")({ head: () => seo("Release Galaxy · Unsigned Previews", "Prepare local demo release manifests with rollback, license and synthetic test records. No signing, distribution, deployment or funded rewards."), component: ReleasesPage });