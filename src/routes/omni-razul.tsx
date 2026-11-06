import { createFileRoute } from "@tanstack/react-router";
import { RazulArchive } from "@/components/omnibridge/RazulArchive";
import { RasulChat } from "@/components/omnibridge/RasulChat";
import { seo } from "@/lib/seo";
import { AllSeeingEye } from "@/components/razul/AllSeeingEye";

function RazulPage() {
  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-12 md:px-10">
      <AllSeeingEye />
      <details className="omni-support">
        <summary>Conversation</summary>
        <RasulChat />
      </details>
      <details className="omni-support">
        <summary>Local archive · Demo</summary>
        <RazulArchive />
      </details>
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
