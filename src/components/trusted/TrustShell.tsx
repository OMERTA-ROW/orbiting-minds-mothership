import { Link } from "@tanstack/react-router";
import { LockKeyhole } from "lucide-react";
import { useState, type ReactNode } from "react";
import { DemoBadge, PageHeader, Section } from "@/components/evo";
import { Button } from "@/components/ui/button";
import { FormNotice } from "@/components/genesis/GenesisShell";
import { useTrustedRelease } from "@/hooks/use-trusted-release";
export const trustLinks = [{ to:"/physical-safety",label:"Physical Safety Lock" },{ to:"/experiment-replay",label:"Experiment Replay" },{ to:"/approval-ledger",label:"Approval Ledger" },{ to:"/impact-scorecard",label:"Idea-to-Impact" }] as const;
export function TrustConnections() { return <nav aria-label="Trust tools" className="flex flex-wrap gap-2 border-y border-border py-4">{trustLinks.map(l=><Button key={l.to} asChild variant="ghost" className="h-auto min-h-10 whitespace-normal text-xs"><Link to={l.to} activeProps={{className:"text-gold-light bg-accent/30"}}>{l.label}</Link></Button>)}</nav>; }
export function TrustShell({title,eyebrow,children}:{title:string;eyebrow:string;children:ReactNode}) {
 const {ready,issue}=useTrustedRelease();
 return <><PageHeader title={title} eyebrow={eyebrow}/><Section><TrustConnections/><div className="my-9 border-l-2 border-gold/50 pl-5"><DemoBadge label="LOCAL DEMO · UNSIGNED · NO HARDWARE"/><p className="mt-4 max-w-4xl text-sm leading-loose text-muted-foreground">Only fictional, non-sensitive samples. Identities and review labels are not authenticated permissions. Local records are editable, not confidential or tamper-evident; no code is executed, tests verified or devices connected.</p></div><FormNotice message={issue}/>{ready ? children : <p role="status">Loading local trust records…</p>}<p className="mt-12 flex gap-3 border-t border-border pt-6 text-xs leading-loose text-warning"><LockKeyhole size={16} className="shrink-0"/>Real audit, signing and deployment require verified accounts, owner-scoped access, protected evidence, independent tests and security QA. Public release and all hardware actions remain blocked.</p></Section></>;
}
export function useTrustAction() {
 const [message,setMessage]=useState(""),[busy,setBusy]=useState(false); const {dispatch}=useTrustedRelease();
 const run=async (action:Parameters<typeof dispatch>[0],ok:string) => { setBusy(true); try { const id=await dispatch(action); setMessage(ok); return id; } catch(e) { setMessage(e instanceof Error ? e.message : "Local action unavailable."); return undefined; } finally { setBusy(false); } };
 return {run,message,busy,setMessage};
}