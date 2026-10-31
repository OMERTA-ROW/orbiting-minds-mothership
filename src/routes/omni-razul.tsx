import { createFileRoute } from "@tanstack/react-router";
import { RazulArchive } from "@/components/omnibridge/RazulArchive";
import { RasulChat } from "@/components/omnibridge/RasulChat";
import { seo } from "@/lib/seo";
import { AllSeeingEye } from "@/components/razul/AllSeeingEye";

function RazulPage() {
  return (
    <div className="space-y-6">
      <RasulChat />
      <AllSeeingEye />
      <RazulArchive />
    </div>
  );
}

export const Route = createFileRoute("/omni-razul")({
  head: () =>
    seo(
      "Razul Central Intelligence · All-Seeing Eye",
      "Razul Central Intelligence is OMNI/Evolution's cross-project speaking intelligence and private All-Seeing Eye observatory: owner/MFA-gated infrastructure, lawful public research and historical records. Game servers are participating projects, not exclusive assignments; watchers and scoped dispatch remain proposed and Guardian-gated.",
    ),
  component: RazulPage,
});
