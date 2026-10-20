import { createFileRoute } from "@tanstack/react-router";
import { AgentReferencePage } from "@/components/care/AgentReference";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/care-agent")({ head: () => seo("Signed Local Agent · Architecture", "Developer reference for future signed macOS, Windows and Linux inventory adapters, trusted updates, opt-in scopes and supported recovery. Nothing shipped."), component: AgentReferencePage });
