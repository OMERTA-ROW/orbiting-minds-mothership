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
      "RA'SUL · OMNI Agent Directory",
      "RA'SUL is the default central-intelligence conversation above OMNI's specialist directory. Research access is authenticated; agent declarations, specialized workers and resident watchers remain proposed, with scopes, Guardian policy and owner approval required.",
    ),
  component: AgentDirectory,
});
