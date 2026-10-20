import { createFileRoute } from "@tanstack/react-router";
import { ChallengePage } from "@/components/genesis/Challenges";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/challenges_/$id")({ head: () => seo("Grand Challenge · Submission Workspace", "Document a technical challenge, inspect acceptance criteria and submit attributed local demo code or knowledge capsules."), component: Page });
function Page() { const { id } = Route.useParams(); return <ChallengePage key={id} id={id} />; }