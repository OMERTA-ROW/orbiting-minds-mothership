import { createFileRoute } from "@tanstack/react-router";
import { ChallengeBoard } from "@/components/genesis/Challenges";
import { seo } from "@/lib/seo";
import { roboticsPresetSearch } from "@/lib/robotics";
export const Route = createFileRoute("/challenges")({ validateSearch: roboticsPresetSearch, head: () => seo("Innovation Grand Challenges", "Local demo technical challenges, documented submissions and proposed unfunded USD bounties. No shared accounts or external actions."), component: ChallengesPage });
function ChallengesPage() { const { scenario } = Route.useSearch(); return <ChallengeBoard key={scenario ?? "board"} scenarioId={scenario} />; }