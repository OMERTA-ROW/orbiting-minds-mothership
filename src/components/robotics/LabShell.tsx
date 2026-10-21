import { Link } from "@tanstack/react-router";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { type ReactNode } from "react";
import { DemoBadge, PageHeader, Section } from "@/components/evo";
import { Button } from "@/components/ui/button";
import { TrustConnections } from "@/components/trusted/TrustShell";
export function LabBoundary() {
 return <div className="border-l-2 border-gold/50 pl-5"><DemoBadge label="DEMO · RESEARCH ONLY · NO HARDWARE" /><p className="mt-4 max-w-4xl text-sm leading-loose text-muted-foreground">Synthetic fixtures and educational arithmetic only. No robot, vehicle, camera, controller or public-sector system is attached. No code, ROS simulator, emergency contact or hardware command runs.</p><p className="mt-3 max-w-4xl text-xs leading-loose text-warning">No weapons, targeting, force automation, face profiling or unrestricted surveillance. Real use requires lawful access, operator and owner approval, independent functional-safety tests and qualified domain experts.</p></div>;
}
export function LabConnections() {
 return <nav aria-label="Lab connections" className="flex flex-wrap gap-2 border-y border-border py-4"><Button asChild variant="signal" className="h-auto min-h-10 whitespace-normal text-xs"><Link to="/robotics">Robotics & Mobility Lab</Link></Button>{([{ to: "/discovery", label: "Oracle · Discovery Radar" }, { to: "/pathway", label: "Founder Lab · AI Pathway" }, { to: "/challenges", label: "Challenge Board" }, { to: "/code-exchange", label: "Code Exchange" }, { to: "/releases", label: "Release Galaxy" }] as const).map(p => <Button key={p.to} asChild variant="ghost" className="h-auto min-h-10 whitespace-normal text-xs"><Link to={p.to}>{p.label}<ArrowUpRight size={12} /></Link></Button>)}<Button asChild variant="ghost" className="text-xs"><Link to="/guardian" search={{ tab: "review", surface: "robotics" }}>Guardian · Safety review</Link></Button></nav>;
}
export function LabShell({ title, children }: { title: string; children: ReactNode }) {
 return <><PageHeader title={title} eyebrow="Robotics & Mobility · Simulation first" /><Section><LabConnections /><TrustConnections /><div className="my-9"><LabBoundary /></div>{children}<p className="mt-12 flex items-start gap-3 border-t border-border pt-6 text-xs leading-loose text-warning"><LockKeyhole size={16} className="shrink-0" />Shared accounts, verified operator identities, independent tests, signed hardware adapters and physical emergency stops remain unconfigured. Public launch and field deployment are blocked.</p></Section></>;
}
