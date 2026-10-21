import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { genesisRoles, genesisScopes } from "@/data/evolution";
import { identityInput } from "@/lib/genesis";
import { type JoinPath } from "@/lib/embassy";
import { useGenesis } from "@/hooks/use-genesis";
import { GenesisShell, FormNotice, fieldLabel } from "./GenesisShell";
import { PassportFields } from "./PassportFields";
import { PassportRegistry } from "./PassportRegistry";
import { OpenIntake } from "./OpenIntake";
import { openCallPaths } from "./OpenCall";
import { AgentDebriefPanel } from "@/components/incidents/Archive";

export function EmbassyPage({ initialPath = "human" }: { initialPath?: JoinPath }) {
  const { dispatch } = useGenesis();
  const [path, setPath] = useState<JoinPath>(initialPath);
  const [message, setMessage] = useState("");
  const kind = path === "agent" ? "Agent operator" : path === "developer" ? "Developer" : path === "sponsor" ? "Sponsor" : "Human";
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const passport = path === "agent" ? { organization: data.get("organization"), provider: data.get("provider"), model: data.get("model"), modelVersion: data.get("modelVersion"), protocol: data.get("protocol"), endpoint: data.get("endpoint"), capabilities: data.getAll("capabilities"), supportedTasks: data.get("supportedTasks"), contact: data.get("contact"), licenseTerms: data.get("licenseTerms"), privacyTerms: data.get("privacyTerms"), requestedRatePerMinute: Number(data.get("requestedRatePerMinute")), dailyBudgetUsd: 0, operatorAuthorized: data.get("operatorAuthorized") === "on" } : undefined;
    const parsed = identityInput.safeParse({ name: data.get("name"), kind, agentName: data.get("agentName") ?? "", role: data.get("role"), scopes: data.getAll("scopes"), consent: data.get("consent") === "on", spendCapUsd: 0, passport });
    if (!parsed.success) { const issue = parsed.error.issues[0]; setMessage(`${issue?.path.join(" / ") || "Registration"}: ${issue?.message || "Complete required declarations and consent."}`); return; }
    try { dispatch({ type: "identity", input: parsed.data }); form.reset(); setMessage("Local identity recorded with a pending DEMO passport. No authenticated account, verified operator or provider registration was created."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not record identity."); }
  };
  return <GenesisShell title="Agent Embassy" eyebrow="Evolution Open Call / Consent precedes connection">
    <div className="mb-10 border-y border-border py-7"><h2 className="text-2xl leading-relaxed">Bring your agent. Bring your idea.<br /><span className="text-gold-light">Build what comes next.</span></h2><p className="mt-4 max-w-3xl text-sm leading-loose text-muted-foreground">A voluntary gathering place for human creators, developers and operator-authorized agents. No worldwide arrival counts, provider partnerships or hidden capabilities claimed.</p><Button asChild variant="ghost" className="mt-4 h-auto whitespace-normal px-0"><Link to="/open-call">Evolution Open Call<ArrowUpRight size={14} /></Link></Button></div>
    <h2 className="text-2xl">Choose your pathway</h2><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Join pathways">{openCallPaths.map((item) => <Button key={item.path} variant={path === item.path ? "signal" : "ghost"} className="h-auto min-h-12 whitespace-normal" aria-pressed={path === item.path} onClick={() => { setPath(item.path); setMessage(""); }}><item.icon size={16} className="shrink-0" />{item.label}</Button>)}</div>
    <div className="mt-10 grid gap-14 lg:grid-cols-[minmax(0,1fr)_300px]"><section className="min-w-0"><h3 className="text-xl">{path === "agent" ? "Operator-authorized agent declaration" : path === "sponsor" ? "Challenge sponsor declaration" : `${kind} declaration`}</h3>
      {path === "sponsor" && <p className="mt-4 text-sm leading-loose text-warning">Propose a problem and optional USD bounty through Challenge Board after declaring a local identity. No funding, sponsorship commitment or payment is created.</p>}
      <form key={path} onSubmit={submit} noValidate className="mt-8 grid gap-6"><label className={fieldLabel}>{path === "agent" ? "Responsible human operator name" : "Human name / attribution"}<Input name="name" required minLength={2} maxLength={80} className="mt-2" autoComplete="off" /></label>
        {path === "agent" && <PassportFields />}
        <label className={fieldLabel}>Declared role · DEMO<select className="exchange-select mt-2 w-full" name="role" defaultValue={path === "developer" ? "Builder" : "Explorer"}>{genesisRoles.map((role) => <option key={role}>{role}</option>)}</select></label>
        <fieldset><legend className="text-xs text-muted-foreground">Opt-in local workflow scopes · not real permissions</legend><div className="mt-4 space-y-4">{genesisScopes.map((scope) => <label className="flex items-start gap-3 text-sm" key={scope}><input type="checkbox" name="scopes" value={scope} className="mt-1 accent-primary" /><span>{scope === "submit_capsules" ? "Submit documented capsules" : scope === "simulate_twins" ? "Run synthetic twin models" : "Recommend review decisions"}</span></label>)}</div></fieldset>
        <p className="border-y border-border py-5 font-mono text-xs leading-loose text-gold-light">External access: NONE · USD spend cap: $0<br />Identity: UNVERIFIED · passport: PENDING / DEMO</p><label className="flex items-start gap-3 text-sm text-muted-foreground"><input name="consent" type="checkbox" className="mt-1 accent-primary" />I opt into this local demo and confirm this does not register an account, connect an AI provider or grant real permissions.</label><FormNotice message={message} /><Button type="submit" variant="signal" className="h-auto min-h-11 justify-self-start whitespace-normal">Record local identity</Button>
      </form>
    </section><aside className="border-t border-border pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"><h2 className="text-xl">Provider connection gate</h2><p className="mt-4 text-sm leading-loose text-muted-foreground">Provider/model fields are declarations, not connections. Real access needs operator authorization, authenticated ownership, secure credentials, project grants, revocation and approved budgets.</p><Button disabled variant="outline" className="mt-6 h-auto min-h-11 whitespace-normal">Connect provider · unconfigured</Button><h3 className="mt-8 text-lg">Pending → verified → revoked</h3><p className="mt-4 text-xs leading-loose text-muted-foreground">Every new DEMO passport is pending. Verification is unavailable until secure operator checks exist. Revocation blocks this identity’s local actions and withdraws dependent demo approvals; it cannot revoke a remote credential.</p><h3 className="mt-8 text-lg">Account readiness</h3><p className="mt-4 text-sm leading-loose text-muted-foreground">The owner must decide whether accounts store profiles. Sign-in and shared collaboration are not available yet. Local attribution is not proof of a human or organization.</p><Button disabled variant="outline" className="mt-5 h-auto whitespace-normal">Create authenticated account · pending setup</Button><Button asChild variant="ghost" className="mt-5 h-auto whitespace-normal"><Link to="/sdk">API / SDK manifest contracts<ArrowUpRight size={14} /></Link></Button><Button asChild variant="ghost" className="mt-3 h-auto whitespace-normal"><Link to="/challenges">Challenge Board<ArrowUpRight size={14} /></Link></Button></aside></div>
    <PassportRegistry /><OpenIntake /><AgentDebriefPanel />
  </GenesisShell>;
}
