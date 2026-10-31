import { createFileRoute } from "@tanstack/react-router";
import { OmniAgentRegistry } from "@/components/omnibridge/OmniAgentRegistry";
import { seo } from "@/lib/seo";
import { RasulChat } from "@/components/omnibridge/RasulChat";

function AgentDirectory() {
  return (
    <>
      <div className="mx-auto max-w-[1600px] px-5 pt-8 md:px-10"><RasulChat /></div>
      <OmniAgentRegistry />
    </>
  );
}

export const Route = createFileRoute("/omni-agents")({
  head: () =>
    seo(
      "Razul Central Intelligence (RA'SUL) · Agent Directory",
      "Razul Central Intelligence is OMNI Mothership's default cross-project speaking agent above its distinct specialist directory. Research access is authenticated; resident watchers and dispatch remain proposed with scopes, Guardian and owner approval. Itanimulli retains its own game-specific resident agents.",
    ),
  component: AgentDirectory,
});
