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
      "RA'SUL · All-Seeing Eye Observatory",
      "Razul's private intelligence observatory inside OMNI/Evolution: verified-owner MFA-gated infrastructure metadata, sourced findings and chronological history. Scoped watcher and continuous-monitoring capabilities remain proposed; no unrestricted scraping or entire-internet visibility.",
    ),
  component: RazulPage,
});
