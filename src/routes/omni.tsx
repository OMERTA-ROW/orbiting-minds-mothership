import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { OmniAssistant } from "@/components/omnibridge/OmniAssistant";
import { omniWorld } from "@/lib/omni-assistant";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/omni")({
  validateSearch: (s: Record<string, unknown>) => ({
    world: omniWorld.catch("nexus-nebula").parse(s["world"]),
  }),
  head: () =>
    seo(
      "OMNI · Dedicated Coordinator",
      "OMNI private connection checkpoints and authenticated AI handoff, alongside a separate Demo template conversation. No native terminal, independent agents or automatic tool execution.",
    ),
  component: Page,
});
function Page() {
  const { world } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <OmniAssistant
      key={world}
      worldId={world}
      onWorldChange={(id) => {
        void navigate({ to: "/omni", search: { world: id } });
      }}
    />
  );
}
