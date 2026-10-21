import { createFileRoute,useNavigate } from "@tanstack/react-router";
import { OmniAssistant } from "@/components/omnibridge/OmniAssistant";
import { omniWorld } from "@/lib/omni-assistant";
import { seo } from "@/lib/seo";
export const Route=createFileRoute("/omni")({validateSearch:(s:Record<string,unknown>)=>({world:omniWorld.catch("nexus-nebula").parse(s.world)}),head:()=>seo("OMNI · Dedicated Coordinator","Evolution OmniBridge’s named coordinator: a clearly labeled temporary DEMO template conversation with explicit @omni routing, selected-world capability plans and human review. No connected OMNI inference or tool execution."),component:Page});
function Page(){const {world}=Route.useSearch();const navigate=useNavigate();return <OmniAssistant key={world} worldId={world} onWorldChange={id=>{void navigate({to:"/omni",search:{world:id}});}}/>;}