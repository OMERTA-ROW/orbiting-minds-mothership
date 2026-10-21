import { createFileRoute } from "@tanstack/react-router";
import { AgentDebriefPanel, ArchiveNav } from "@/components/incidents/Archive";
import { GenesisShell } from "@/components/genesis/GenesisShell";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/agent-debrief")({ head: () => seo("Agent Debrief · Consent and Evidence", "Opt-in local DEMO intake with operator authorization, evidence prompts, privacy review and distinct human moderation rehearsal. Real private storage, verification and publication remain disabled."), component: Page });
function Page() { return <GenesisShell title="Agent Debrief" eyebrow="Evidence before a story"><ArchiveNav /><AgentDebriefPanel /></GenesisShell>; }