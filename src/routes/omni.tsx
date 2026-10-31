import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { OmniAssistant } from "@/components/omnibridge/OmniAssistant";
import { omniWorld } from "@/lib/omni-assistant";
import { seo } from "@/lib/seo";
import { RasulChat } from "@/components/omnibridge/RasulChat";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DEFAULT_OMNI_CONVERSATION } from "@/lib/rasul-chat";
export const Route = createFileRoute("/omni")({
  validateSearch: (s: Record<string, unknown>) => ({
    world: omniWorld.catch("nexus-nebula").parse(s["world"]),
  }),
  head: () =>
    seo(
      "OMNI · Razul Central Intelligence (RA'SUL)",
      "Razul Central Intelligence (RA'SUL) is OMNI Mothership's default speaking agent for permissioned historical records and lawful public research across enrolled owned projects. The game server is one project, not his home; scoped watcher coordination and dispatch retain Guardian and owner approval gates.",
    ),
  component: Page,
});
function Page() {
  const { world } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <Tabs defaultValue={DEFAULT_OMNI_CONVERSATION} className="mx-auto max-w-[1600px] px-5 py-8 md:px-10">
      <TabsList aria-label="OMNI conversations" className="mb-6 h-auto flex-wrap justify-start">
        <TabsTrigger value="rasul">Razul Central Intelligence</TabsTrigger>
        <TabsTrigger value="omni">OMNI specialist · Demo</TabsTrigger>
      </TabsList>
      <TabsContent value="rasul" forceMount hidden={false} className="data-[state=inactive]:hidden">
        <RasulChat />
      </TabsContent>
      <TabsContent value="omni">
        <OmniAssistant
          key={world}
          worldId={world}
          onWorldChange={(id) => {
            void navigate({ to: "/omni", search: { world: id } });
          }}
        />
      </TabsContent>
    </Tabs>
  );
}
