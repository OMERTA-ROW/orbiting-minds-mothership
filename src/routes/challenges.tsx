import { createFileRoute } from "@tanstack/react-router";
import { ChallengeBoard } from "@/components/genesis/Challenges";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/challenges")({ head: () => seo("Innovation Grand Challenges", "Local demo technical challenges, documented submissions and proposed unfunded USD bounties. No shared accounts or external actions."), component: ChallengeBoard });