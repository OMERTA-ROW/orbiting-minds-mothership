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
      "RA'SUL (Razul) · OMNI Central Intelligence",
      "RA'SUL / Razul is OMNI Mothership's default conversational central intelligence for searchable permissioned history and lawful public research. Specialized research and scoped resident watcher coordination remains proposed; all tasks honor source policies, rate limits, Guardian and owner approval.",
    ),
  component: RazulPage,
});
