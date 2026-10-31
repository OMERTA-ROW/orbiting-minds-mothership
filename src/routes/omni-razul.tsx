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
      "RA'SUL is OMNI Mothership's central cross-project intelligence and coordination agent, with sourced research and permissioned history. Scoped resident watch-agent coordination across owner-enrolled sites and apps remains staged; the game is only one participating project.",
    ),
  component: RazulPage,
});
