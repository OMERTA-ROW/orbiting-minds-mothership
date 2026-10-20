import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy, Play } from "lucide-react";
import { cliCommands } from "@/data/evolution";
import { DemoBadge, PageHeader, Section, StatusPill } from "@/components/evo";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/platform")({
  head: () => seo("Platform & CLI", "Preview the proposed EVOLUTION developer CLI: init, connect, scan, suggest, sandbox and dry-run updates."),
  component: Page,
});

const layers = [
  { n: "App", d: "Visual command center", s: "Prototype" },
  { n: "CLI", d: "Developer terminal", s: "Planned" },
  { n: "Cloud", d: "Owner-scoped data & roles", s: "Planned" },
  { n: "Update Network", d: "Signed packages & rollback", s: "Future" },
];

function Page() {
  const [idx, setIdx] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const cur = cliCommands[idx]!;

  const copy = async (t: string) => {
    try { await navigator.clipboard.writeText(t); } catch { /* clipboard unavailable */ }
    setCopied(t); setTimeout(() => setCopied(null), 1500);
  };

  return (
    <>
      <PageHeader eyebrow="Platform" title="Built for builders">
        App, CLI and Cloud working as one. The CLI below is a <strong className="text-gold-light">coming-soon preview</strong> — commands are not live.
      </PageHeader>
      <Section>
        <div className="grid gap-4 md:grid-cols-4">
          {layers.map((l) => (
            <div key={l.n} className="glass p-5"><div className="flex justify-between"><h3 className="text-gold-light">{l.n}</h3><StatusPill status={l.s} /></div><p className="mt-2 text-sm text-muted-foreground">{l.d}</p></div>
          ))}
        </div>
      </Section>
      <Section>
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <ul className="space-y-1.5" aria-label="CLI commands">
            {cliCommands.map((c, i) => (
              <li key={c.cmd}>
                <button onClick={() => setIdx(i)} className={cn("w-full rounded-lg border px-3 py-2.5 text-left transition", i === idx ? "border-gold bg-accent/50" : "border-border hover:border-gold/40")}>
                  <code className="font-mono text-sm text-gold-light">{c.cmd}</code>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.desc}</p>
                </button>
              </li>
            ))}
          </ul>
          <div className="glass overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex gap-1.5" aria-hidden><span className="h-3 w-3 rounded-full bg-destructive/70" /><span className="h-3 w-3 rounded-full bg-warning/70" /><span className="h-3 w-3 rounded-full bg-success/70" /></div>
              <DemoBadge label="Coming soon · Preview" />
            </div>
            <div className="min-h-[340px] p-5 font-mono text-sm" aria-live="polite">
              {history.map((h, k) => (
                <div key={k} className="mb-3">
                  <p><span className="text-gold">❯</span> {cliCommands[h]!.cmd}</p>
                  {cliCommands[h]!.out.map((o) => <p key={o} className="text-muted-foreground">{o}</p>)}
                </div>
              ))}
              <p className="flex items-center gap-2"><span className="text-gold">❯</span> <span className="text-ivory">{cur.cmd}</span><span className="h-4 w-2 animate-twinkle bg-gold-light" aria-hidden /></p>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border p-3">
              <button onClick={() => setHistory((h) => [...h, idx].slice(-6))} className="inline-flex items-center gap-1.5 rounded-full bg-gold-gradient px-4 py-1.5 text-sm font-semibold text-primary-foreground"><Play size={14} />Simulate</button>
              <button onClick={() => copy(cur.cmd)} className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 px-4 py-1.5 text-sm text-gold-light">{copied === cur.cmd ? <Check size={14} /> : <Copy size={14} />}{copied === cur.cmd ? "Copied" : "Copy command"}</button>
              <button onClick={() => setHistory([])} className="rounded-full px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground">Clear</button>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
