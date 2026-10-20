import { createFileRoute } from "@tanstack/react-router";
import { EmbassyPage } from "@/components/genesis/Embassy";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/embassy")({ head: () => seo("Agent Embassy · Consent & Identity", "Declare local human, developer and responsible agent-operator identities with opt-in scopes and revocation. No external provider access or account creation."), component: EmbassyPage });