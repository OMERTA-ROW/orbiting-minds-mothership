import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUpRight, Check, Copy, Download, FlaskConical, LoaderCircle, Orbit, ShieldCheck, Sparkles, Square } from "lucide-react";
import { conceptExamples, modules } from "@/data/evolution";
import { CoreGeometry, PageHeader, Section, moduleIcons } from "@/components/evo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePathway } from "@/hooks/use-pathway";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/pathway")({
  head: () => seo("Evolution Pathway Creator", "Describe your technology concept and draft an AI-powered Evolution pathway with relevant Mothership modules, planned sandbox checks, owner approval and rollback."),
  component: PathwayPage,
});

function PathwayPage() {
  const [concept, setConcept] = useState("");
  const [goal, setGoal] = useState("");
  const [consent, setConsent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exportError, setExportError] = useState("");
  const { pathway, status, error, thinking, submitted, generate, stop } = usePathway();
  const busy = status === "generating";
  const output = pathway ? JSON.stringify({ status: "AI-generated proposal; sandbox validation not run", concept: submitted?.concept, goal: submitted?.goal, pathway }, null, 2) : "";
  const exportPathway = () => {
    const url = URL.createObjectURL(new Blob([output], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "evolution-pathway.json"; a.click(); URL.revokeObjectURL(url);
  };
  return <>
    <PageHeader eyebrow="Creator transmission" title="Your Evolution pathway">
      <span className="inline-flex items-center gap-2 text-gold-light"><Sparkles size={16} />AI-powered concept planning</span>
    </PageHeader>
    <Section>
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)]">
        <form className="min-w-0 space-y-6 border-t border-gold/30 pt-7" onSubmit={(e) => { e.preventDefault(); setCopied(false); setExportError(""); void generate({ concept, goal, consent }); }}>
          <div className="flex items-center gap-3"><span className="font-mono text-xs text-gold">01</span><h2 className="text-xl">Describe the concept</h2></div>
          <div><label htmlFor="technology-concept" className="mb-3 block text-sm text-foreground">Technology concept</label><Textarea id="technology-concept" value={concept} onChange={(e) => setConcept(e.target.value)} minLength={30} maxLength={6000} required disabled={busy} className="min-h-48 resize-y border-gold/25 bg-background/70 text-sm leading-relaxed" placeholder="What are you creating, who is it for, and what makes it different?" /><p className="mt-2 text-right font-mono text-[9px] text-muted-foreground">{concept.length.toLocaleString()} / 6,000</p></div>
          <div><label htmlFor="pathway-goal" className="mb-3 block text-sm">Desired outcome <span className="text-muted-foreground">(optional)</span></label><Input id="pathway-goal" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={1000} disabled={busy} placeholder="Goals, technical constraints or evidence needed" className="bg-background/70" /></div>
          <fieldset disabled={busy}><legend className="mb-3 font-mono text-[10px] uppercase text-muted-foreground">Demo starting points</legend><div className="flex flex-wrap gap-2">{conceptExamples.map((e) => <Button key={e.label} type="button" variant="signal" size="sm" onClick={() => { setConcept(e.concept); setGoal(e.goal); }}>{e.label}</Button>)}</div></fieldset>
          <div className="border-t border-border pt-5"><label className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-muted-foreground"><Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} disabled={busy} className="mt-0.5 shrink-0" /><span>I agree to send this concept to Lovable AI for a draft pathway. Do not include secrets or confidential data.</span></label><p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">AI requests use workspace credits. Nothing is applied, tested or connected. Concepts and pathways are not saved to the app.</p></div>
          <div className="flex flex-wrap gap-3"><Button variant="cosmic" type="submit" disabled={busy || !consent || concept.trim().length < 30} className="h-12"><Sparkles size={16} />{busy ? "Drafting pathway…" : status === "complete" ? "Generate a new pathway" : "Generate pathway"}</Button>{busy && <Button type="button" variant="signal" onClick={stop}><Square size={14} />Stop</Button>}</div>
          {error && <p role="alert" className="border-l-2 border-destructive pl-4 text-sm leading-relaxed text-destructive">{error}</p>}
        </form>
        <div className="min-w-0 border-t border-border pt-7" aria-busy={busy}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="font-mono text-xs text-gold">02</span><h2 className="text-xl">Evolution blueprint</h2></div><span role="status" className="inline-flex items-center gap-2 font-mono text-[10px] uppercase text-gold">{busy && <LoaderCircle size={13} className="animate-spin" />}{status === "idle" ? "Awaiting concept" : status === "complete" ? "AI draft · validation not run" : status === "stopped" ? "Stopped · incomplete" : status === "error" ? "Incomplete · not validated" : "Receiving transmission"}</span></div>
          {!pathway && <div className="relative mt-6 flex min-h-80 flex-col items-center justify-center overflow-hidden border-b border-border py-12 text-center"><CoreGeometry className="absolute inset-0 mx-auto max-w-96 opacity-40" /><Orbit size={30} strokeWidth={1} className="relative text-gold" /><p className="relative mt-5 max-w-xs text-sm leading-relaxed text-muted-foreground">{busy ? "Connecting your concept to the Mothership…" : "A concept. A constellation of possibilities."}</p></div>}
          {thinking && <details className="mt-5 border-l border-gold/25 pl-4"><summary className="cursor-pointer text-xs text-gold-light">AI planning notes</summary><p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{thinking}</p></details>}
          {pathway && <div className="mt-8 space-y-10 break-words">
            <header><p className="font-mono text-[10px] uppercase text-gold">AI-generated proposal · no experiments executed</p><h3 className="mt-4 text-2xl leading-tight">{pathway.title || "Mapping your concept…"}</h3><p className="mt-4 text-sm leading-relaxed text-muted-foreground">{pathway.summary}</p></header>
            {pathway.assumptions?.length ? <div><h4 className="eyebrow">Working assumptions</h4><ul className="mt-3 space-y-2">{pathway.assumptions.map((a, i) => <li key={i} className="text-xs leading-relaxed text-muted-foreground">{a}</li>)}</ul></div> : null}
            {pathway.modules?.length ? <div><h4 className="eyebrow">Relevant constellation</h4><div className="mt-4 grid gap-5 sm:grid-cols-2">{pathway.modules.map((m, i) => { if (!m) return null; const mod = modules.find((v) => v.id === m.moduleId); const Icon = moduleIcons[m.moduleId ?? ""] ?? Orbit; return <article key={i} className="border-t border-border pt-4"><Icon size={20} className="text-gold" /><h5 className="mt-3 text-sm text-gold-light">{mod?.name ?? "Identifying module…"}</h5><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{m.rationale}</p><p className="mt-2 text-xs leading-relaxed">{m.contribution}</p>{mod && <Button asChild size="sm" variant="ghost" className="mt-3 px-0 text-xs text-gold"><Link to="/mothership" search={{ module: mod.id }} hash="module-explorer">{mod.status} module<ArrowUpRight size={12} /></Link></Button>}</article>; })}</div></div> : null}
            {pathway.steps?.length ? <div><h4 className="eyebrow">Proposed pathway</h4><ol className="mt-5 space-y-6">{pathway.steps.map((s, i) => s && <li key={i} className="flex gap-4"><span className="shrink-0 font-mono text-xs text-gold">{String(i + 1).padStart(2, "0")}</span><div className="min-w-0 border-l border-border pl-4"><h5 className="text-sm font-semibold">{s.title}</h5><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{s.action}</p>{s.deliverable && <p className="mt-2 text-xs leading-relaxed text-gold-light">Deliverable: {s.deliverable}</p>}</div></li>)}</ol></div> : null}
            {pathway.sandboxChecks?.length ? <div><div className="flex items-center gap-3"><FlaskConical size={18} className="text-gold" /><h4 className="eyebrow">Sandbox validation · planned</h4></div><div className="mt-5 space-y-5">{pathway.sandboxChecks.map((c, i) => c && <article key={i} className="border-t border-border pt-4"><h5 className="text-sm font-semibold">{c.title}</h5><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.procedure}</p>{c.passCriteria && <p className="mt-2 text-xs leading-relaxed"><span className="text-gold">Pass criteria: </span>{c.passCriteria}</p>}</article>)}</div></div> : null}
            {pathway.risks?.length ? <div><h4 className="eyebrow">Risks & evidence gaps</h4><ul className="mt-3 space-y-2">{pathway.risks.map((r, i) => <li key={i} className="text-xs leading-relaxed text-muted-foreground">{r}</li>)}</ul></div> : null}
            {(pathway.approval || pathway.rollback) && <div className="space-y-4 border-y border-gold/25 py-6"><ShieldCheck size={22} className="text-gold" /><div><h4 className="text-sm text-gold-light">Owner opt-in gate</h4><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{pathway.approval}</p></div><div><h4 className="text-sm text-gold-light">Rollback plan</h4><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{pathway.rollback}</p></div><p className="font-mono text-[9px] uppercase text-gold">Draft only · no permission granted · no changes applied</p></div>}
            {status === "complete" && <div className="flex flex-wrap gap-2"><Button variant="signal" size="sm" aria-label="Copy pathway" onClick={async () => { try { await navigator.clipboard.writeText(output); setCopied(true); setExportError(""); } catch { setExportError("Copy is unavailable. Download the pathway instead."); } }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</Button><Button variant="signal" size="sm" onClick={exportPathway}><Download size={14} />Download</Button><Button asChild variant="ghost" size="sm"><Link to="/sandbox">Separate simulated journey<ArrowUpRight size={14} /></Link></Button>{exportError && <p role="alert" className="w-full text-xs text-destructive">{exportError}</p>}</div>}
          </div>}
        </div>
      </div>
    </Section>
  </>;
}