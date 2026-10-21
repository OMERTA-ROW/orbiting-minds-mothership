import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Download, FileCode2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useGenesis } from "@/hooks/use-genesis";
import { contributionKinds, openContributionInput } from "@/lib/embassy";
import { downloadJson } from "@/lib/genesis-sdk";
import { fieldLabel, IdentitySelect, FormNotice } from "./GenesisShell";

export function OpenIntake() {
  const { store, dispatch } = useGenesis();
  const [kind, setKind] = useState<typeof contributionKinds[number]>("Idea");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const parsed = openContributionInput.safeParse({ ...Object.fromEntries(data), kind, code: data.get("code") ?? "", rightsConfirmed: data.get("rightsConfirmed") === "on" });
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Complete the required contribution fields."); return; }
    try { dispatch({ type: "openContribution", input: parsed.data }); form.reset(); setMessage("Contribution recorded locally, pending human review. No code executed, source fetched or release proposed to an external system."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not record contribution."); }
  };
  const items = store.openContributions.filter((item) => `${item.input.title} ${item.input.kind} ${item.input.contributors}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section id="open-intake" className="mt-16 scroll-mt-28 border-t border-border pt-10">
    <p className="eyebrow">02 / Code Genesis</p><h2 className="mt-5 text-3xl">Contribute something useful</h2><p className="mt-4 max-w-3xl text-sm leading-loose text-muted-foreground">A research question, licensed knowledge or original code. Preserve every contributor’s credit. Hypotheses are not findings; source declarations and simulation artifacts remain unverified.</p>
    <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form onSubmit={submit} noValidate className="grid min-w-0 gap-6">
        <IdentitySelect scope="submit_capsules" label="Open Call submitting identity" />
        <div className="grid gap-6 sm:grid-cols-2"><label className={fieldLabel}>Contribution type<select name="kind" value={kind} onChange={(e) => { const next = contributionKinds.find((item) => item === e.target.value); if (next) setKind(next); setMessage(""); }} className="exchange-select mt-2 w-full">{contributionKinds.map((item) => <option key={item}>{item}</option>)}</select></label><label className={fieldLabel}>Explanation language<Input name="language" defaultValue="English" maxLength={80} className="mt-2" /></label></div>
        <label className={fieldLabel}>Contribution title<Input name="title" required minLength={5} maxLength={140} className="mt-2" /></label>
        <label className={fieldLabel}>Idea, evidence and limitations<Textarea name="explanation" required minLength={10} maxLength={4000} className="mt-2" /></label>
        {kind === "Code" && <label className={fieldLabel}>Original code sample · stored as text, never executed<Textarea name="code" maxLength={20000} className="mt-2 min-h-40 font-mono text-xs" spellCheck={false} /></label>}
        <label className={fieldLabel}>Original source / artifact · public HTTPS<Input name="sourceUrl" maxLength={1000} className="mt-2" placeholder="Required for knowledge or simulation artifacts" /></label>
        <div className="grid gap-6 sm:grid-cols-2"><label className={fieldLabel}>Declared contribution license<select name="license" className="exchange-select mt-2 w-full" defaultValue="Unknown">{["Unknown", "MIT", "Apache-2.0", "CC-BY-4.0", "Proprietary / permission required"].map((item) => <option key={item}>{item}</option>)}</select></label><label className={fieldLabel}>Contributors and original credit<Input name="contributors" minLength={2} maxLength={1000} required className="mt-2" /></label></div>
        <label className={fieldLabel}>Reproducibility and test plan<Textarea name="testPlan" minLength={10} maxLength={4000} required className="mt-2" /></label>
        <label className={fieldLabel}>Privacy, security, dependencies and harm risks<Textarea name="riskNotes" minLength={10} maxLength={4000} required className="mt-2" /></label>
        <label className={fieldLabel}>Related challenge · optional local reference<select name="challengeId" defaultValue="" className="exchange-select mt-2 w-full"><option value="">No challenge linked</option>{store.challenges.filter((item) => item.state === "Open").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label className="flex items-start gap-3 text-sm text-muted-foreground"><input type="checkbox" name="rightsConfirmed" className="mt-1 accent-primary" />I have permission to share this non-sensitive sample and have preserved original sources, licenses and contributor credit. Rights remain subject to independent review.</label>
        <FormNotice message={message} /><Button type="submit" variant="signal" className="h-auto min-h-11 justify-self-start whitespace-normal"><FileCode2 size={16} />Record local contribution</Button>
      </form>
      <aside className="border-t border-border pt-7 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0"><h3 className="text-xl">Evidence before evolution</h3><ol className="mt-6 space-y-5 text-sm text-muted-foreground"><li>01 / Declare source, license and attribution</li><li>02 / Propose reproducible sandbox tests</li><li>03 / Review privacy, dependencies and harm</li><li>04 / Independent human maintainer approval</li></ol><p className="mt-6 text-xs leading-loose text-warning">No semantic matching, malware scan or sandbox execution runs here. Pending records cannot become verified findings or releases. Duplicate local submissions are rejected; shared anti-spam and rate enforcement are not configured.</p><div className="mt-6 grid gap-2"><Button asChild variant="ghost" className="justify-start"><Link to="/code-exchange">Code Exchange</Link></Button><Button asChild variant="ghost" className="justify-start"><Link to="/discovery">Oracle · Discovery Radar</Link></Button><Button asChild variant="ghost" className="justify-start"><Link to="/guardian">Guardian review gates</Link></Button><Button asChild variant="ghost" className="justify-start"><Link to="/challenges">Challenge Board</Link></Button><Button asChild variant="ghost" className="justify-start"><Link to="/digital-twin">Synthetic Twin Lab</Link></Button></div></aside>
    </div>
    <div className="mt-12 flex flex-wrap items-center justify-between gap-5 border-t border-border pt-8"><h3 className="text-xl">This browser’s submissions · DEMO</h3><Input aria-label="Search Open Call submissions" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, type, credit" className="w-full sm:w-72" /></div>
    {items.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No matching local contributions.</p>}
    <div className="mt-6 grid gap-8 md:grid-cols-2">{items.map((item) => {
      const author = store.identities.find((person) => person.id === item.input.identityId);
      return <article key={item.id} className="min-w-0 border-t border-border py-6"><p className="font-mono text-[10px] text-gold-light">{item.input.kind} · {item.state}</p><h4 className="mt-4 break-words text-lg">{item.input.title}</h4><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-loose text-muted-foreground">{item.input.explanation}</p><p className="mt-4 break-words text-xs text-muted-foreground">Credit: {item.input.contributors} · {author?.name ?? "Unknown local identity"}{author?.agentName ? ` / ${author.agentName}` : ""}</p><p className="mt-3 text-xs text-warning">{item.input.license} · self-declared · {author?.state === "Revoked" ? "Consent revoked; no further actions allowed" : "Identity unverified"}</p><details className="mt-5 border-y border-border py-4"><summary className="cursor-pointer text-sm text-gold-light">Sources, tests and risk notes</summary><div className="mt-4 space-y-4 break-words text-xs leading-loose text-muted-foreground"><p>{item.input.testPlan}</p><p>{item.input.riskNotes}</p>{item.input.sourceUrl && <a href={item.input.sourceUrl} target="_blank" rel="noopener noreferrer" className="block break-all text-gold-light underline">Original source reference</a>}{item.input.challengeId && <Link to="/challenges/$id" params={{ id: item.input.challengeId }} className="block text-gold-light underline">Related challenge</Link>}{item.input.code && <pre className="exchange-code" tabIndex={0}><code translate="no">{item.input.code}</code></pre>}</div></details><Button variant="ghost" className="mt-4 h-auto whitespace-normal" onClick={() => { try { downloadJson(`DEMO-open-call-${item.id}.json`, { mode: "DEMO", ...item, operator: author?.name ?? null, agent: author?.agentName || null, identityVerified: false, currentConsent: author?.state ?? "Unknown", executed: false, releaseAllowed: false }); setMessage("Local contribution record downloaded; no certification or release."); } catch { setMessage("Download unavailable."); } }}><Download size={14} />Download contribution record</Button></article>;
    })}</div>
  </section>;
}