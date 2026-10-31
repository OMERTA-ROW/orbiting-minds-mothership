import { createFileRoute } from "@tanstack/react-router";
import { RazulArchive } from "@/components/omnibridge/RazulArchive";
import { RasulChat } from "@/components/omnibridge/RasulChat";
import { seo } from "@/lib/seo";

function RazulPage() {
  return (
    <div className="space-y-6">
      <RasulChat />
      <RazulArchive />
    </div>
  );
}

export const Route = createFileRoute("/omni-razul")({
  head: () =>
    seo(
      "RAZUL · The Eternal Archivist",
      "Owner-only conversational front door of the OMNI Mothership: sourced research answers, transparent agent handoffs and approval-gated dispatches, plus the append-only project history and public-internet observatory.",
    ),
  component: RazulPage,
});
