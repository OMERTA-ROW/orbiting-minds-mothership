import { createFileRoute } from "@tanstack/react-router";
import { CapsulePage } from "@/components/genesis/Capsule";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/capsules_/$id")({ head: () => seo("Genesis Capsule · Evidence & Review", "Inspect local capsule provenance, license declarations, synthetic twin records and demo human review. No certification or signed release."), component: Page });
function Page() { const { id } = Route.useParams(); return <CapsulePage key={id} id={id} />; }