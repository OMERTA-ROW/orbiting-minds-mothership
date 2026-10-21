import { Link } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { LockKeyhole, ArrowUpRight } from "lucide-react";
import { DemoBadge, PageHeader, Section } from "@/components/evo";
import { Button } from "@/components/ui/button";
import { useGenesis } from "@/hooks/use-genesis";
export const genesisLinks = [
  { to: "/open-call", label: "Open Call" },
  { to: "/robotics", label: "Robotics & Mobility" },
  { to: "/challenges", label: "Grand Challenges" }, { to: "/embassy", label: "Agent Embassy" }, { to: "/discovery", label: "Discovery Radar" }, { to: "/sdk", label: "SDK / API" }, { to: "/digital-twin", label: "Digital Twin Lab" }, { to: "/trust", label: "Trust" }, { to: "/marketplace", label: "Marketplace" }, { to: "/compute-grid", label: "Compute Grid" }, { to: "/releases", label: "Release Galaxy" },
] as const;
export function GenesisShell({ title, eyebrow = "Genesis expansion", children }: { title: string; eyebrow?: string; children: ReactNode }) {
  const { ready, storageAvailable, storageIssue } = useGenesis();
  return <><PageHeader title={title} eyebrow={eyebrow}><p>Ideas become documented capsules. Evidence comes before approval.</p></PageHeader><Section>
    <nav aria-label="Genesis sections" className="mb-8 flex flex-wrap gap-2 border-y border-border py-4">{genesisLinks.map((link) => <Button key={link.to} asChild variant="ghost" className="h-auto min-h-10 whitespace-normal text-xs"><Link to={link.to} activeProps={{ className: "text-gold-light bg-accent/30" }}>{link.label}</Link></Button>)}</nav>
    <div className="mb-12 border-l-2 border-gold/50 pl-5"><DemoBadge label="LOCAL DEMO · NOT MULTIUSER" /><p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">Records stay in this browser and are not confidential. Identities, scopes and open/private labels are rehearsal settings, not authenticated permissions. No third-party AI, repositories, hardware, payments or releases are connected. Use non-sensitive sample content.</p><p className="mt-3 flex items-start gap-2 text-xs text-warning"><LockKeyhole size={14} className="shrink-0" />Shared accounts and real moderation await the owner’s profile-data decision and secure setup.</p></div>
    {!storageAvailable && <p role="status" className="mb-8 text-sm text-warning">{storageIssue || "Browser storage unavailable; these records will last only until this page is closed."}</p>}
    {!ready ? <p role="status">Loading local records…</p> : children}
  </Section></>;
}
export function GenesisEntryPoints() {
  return <div className="mb-10 flex flex-wrap gap-3 border-y border-border py-5"><Button asChild variant="signal"><Link to="/challenges">Grand Challenges<ArrowUpRight size={14} /></Link></Button><Button asChild variant="signal"><Link to="/embassy">Agent Embassy<ArrowUpRight size={14} /></Link></Button><Button asChild variant="signal"><Link to="/releases">Release Galaxy<ArrowUpRight size={14} /></Link></Button><Button asChild variant="signal"><Link to="/robotics">Robotics & Mobility Lab<ArrowUpRight size={14} /></Link></Button></div>;
}
export function FormNotice({ message }: { message: string }) { return message ? <p className="break-words text-sm text-warning" role="status">{message}</p> : null; }
export function IdentitySelect({ name = "identityId", scope, label = "Local submitting identity" }: { name?: string; scope?: "submit_capsules" | "simulate_twins" | "review_proposals"; label?: string }) {
  const { store } = useGenesis(); const options = store.identities.filter((person) => person.state === "Active" && (!scope || person.scopes.includes(scope)));
  return <label className="block min-w-0 text-xs text-muted-foreground">{label}<select aria-label={label} required name={name} className="exchange-select mt-2 w-full" defaultValue=""><option value="" disabled>Select an opted-in demo identity</option>{options.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.kind}{person.agentName ? ` / ${person.agentName}` : ""}</option>)}</select>{options.length === 0 && <Link to="/embassy" className="mt-2 block text-gold-light underline">Declare an identity in Embassy</Link>}</label>;
}
export const fieldLabel = "block min-w-0 text-xs text-muted-foreground";