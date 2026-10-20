import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check } from "lucide-react";
import { sampleProjects } from "@/data/evolution";
import { DemoBadge, GoldButton, PageHeader, Section } from "@/components/evo";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/sandbox")({
  head: () => seo("Sandbox Lab", "Walk a simulated evolution journey: DNA profile, research, invention, sandbox, Guardian checks and opt-in approval."),
  component: Page,
});

const steps = ["Project", "Evolution DNA", "Global Brain", "Invention Engine", "Sandbox / Time Machine", "Guardian", "Approval"];

function Page() {
  const [step, setStep] = useState(0);
  const [pid, setPid] = useState(sampleProjects[0]!.id);
  const [decision, setDecision] = useState<null | "approved" | "rolledback" | "declined">(null);
  const p = sampleProjects.find((x) => x.id === pid)!;
  const score = 60 + (p.maturity % 30);

  const body = [
    <div key="0" className="grid gap-3 sm:grid-cols-3">
      {sampleProjects.map((s) => (
        <button key={s.id} onClick={() => setPid(s.id)} aria-pressed={pid === s.id} className={cn("rounded-xl border p-4 text-left transition", pid === s.id ? "border-gold bg-accent/50" : "border-border hover:border-gold/40")}>
          <p className="font-semibold text-gold-light">{s.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{s.stack.join(" · ")}</p>
          <p className="mt-2 text-xs">Goal: {s.goal}</p>
        </button>
      ))}
    </div>,
    <div key="1" className="space-y-3">
      {[["Stack genome", p.stack.join(", ")], ["Maturity", `${p.maturity}/100`], ["Compatibility", `${score}% with 4 network evolutions`]].map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-border pb-2 text-sm"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>
      ))}
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-gold-gradient" style={{ width: `${score}%` }} /></div>
    </div>,
    <ul key="2" className="space-y-2 text-sm">
      <li>◆ Matched 3 voluntarily shared research items on “{p.goal.toLowerCase()}”.</li>
      <li>◆ Linked to Atlas Research Agent (consenting) citation graph.</li>
      <li>◆ 2 similar projects completed this evolution successfully.</li>
    </ul>,
    <div key="3" className="rounded-xl border border-gold/40 p-5">
      <p className="font-mono text-xs text-gold">PROPOSAL #P-{100 + p.maturity}</p>
      <p className="mt-2 font-semibold">Improve {p.goal.toLowerCase()} for {p.name}</p>
      <p className="mt-1 text-sm text-muted-foreground">Estimated 6 files changed, low risk. Attributed to 3 contributors.</p>
    </div>,
    <div key="4" className="grid gap-3 sm:grid-cols-3 text-center">
      {[["Tests", "248/248"], ["Perf (90d sim)", "+12%"], ["Regressions forecast", "0"]].map(([k, v]) => (
        <div key={k} className="rounded-xl border border-border p-4"><p className="font-display text-2xl text-gold-light">{v}</p><p className="text-xs text-muted-foreground">{k}</p></div>
      ))}
    </div>,
    <ul key="5" className="space-y-2 text-sm">
      {["Package signature verified", "Within granted permission scopes", "Sandbox passed", "Rollback snapshot created", "No secrets accessed"].map((c) => <li key={c} className="flex gap-2"><Check size={16} className="text-success" />{c}</li>)}
    </ul>,
    <div key="6" className="space-y-4">
      <p className="text-sm text-muted-foreground">Explicit owner opt-in is required. Nothing is applied automatically.</p>
      <div className="flex flex-wrap gap-2">
        <GoldButton onClick={() => setDecision("approved")}>Approve (opt-in)</GoldButton>
        <GoldButton variant="ghost" onClick={() => setDecision("rolledback")}>Propose rollback</GoldButton>
        <GoldButton variant="ghost" onClick={() => setDecision("declined")}>Decline</GoldButton>
      </div>
      {decision && (
        <p role="status" className="rounded-lg border border-gold/40 bg-accent/40 p-3 text-sm text-gold-light">
          {decision === "approved" && "✔ Approved (simulated). Update staged with rollback snapshot snap_7f3a."}
          {decision === "rolledback" && "↺ Rollback proposal recorded (simulated). Project remains at current version."}
          {decision === "declined" && "✕ Declined. Nothing was changed."}
        </p>
      )}
    </div>,
  ];

  return (
    <>
      <PageHeader eyebrow="Demo Project Journey" title="Sandbox Lab">
        Walk a full evolution from DNA to approval. <DemoBadge className="ml-1 align-middle" label="All results simulated" />
      </PageHeader>
      <Section>
        <ol className="mb-6 flex flex-wrap gap-2" aria-label="Journey steps">
          {steps.map((s, i) => (
            <li key={s}>
              <button onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined}
                className={cn("rounded-full border px-3 py-1.5 text-xs transition", i === step ? "border-gold bg-gold-gradient text-primary-foreground" : i < step ? "border-gold/50 text-gold-light" : "border-border text-muted-foreground")}>
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>
        <div className="glass p-6 md:p-8">
          <p className="eyebrow">Step {step + 1} of {steps.length}</p>
          <h2 className="mt-2 mb-6 text-2xl text-ivory">{steps[step]}</h2>
          {body[step]}
          <div className="mt-8 flex justify-between">
            <GoldButton variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</GoldButton>
            {step < steps.length - 1
              ? <GoldButton onClick={() => setStep(step + 1)}>Continue</GoldButton>
              : <GoldButton variant="ghost" onClick={() => { setStep(0); setDecision(null); }}>Restart journey</GoldButton>}
          </div>
        </div>
      </Section>
    </>
  );
}
