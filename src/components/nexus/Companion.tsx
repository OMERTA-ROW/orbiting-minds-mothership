import { useState } from "react";
import { nexusCompanionPlans } from "@/data/evolution";
import { Button } from "@/components/ui/button";
import { Monitor, FileDown, LockKeyhole } from "lucide-react";
export function NexusCompanion() {
  const [plan, setPlan] = useState("unity"),
    [consent, setConsent] = useState(false);
  const selected = nexusCompanionPlans.find((p) => p.id === plan) ?? nexusCompanionPlans[0];
  return (
    <section>
      <h2 className="flex items-center gap-3 text-2xl">
        <Monitor className="text-gold" />
        Optional desktop companion
      </h2>
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        PLANNED · Not shipped or installed. The browser cannot operate installed Unity, Blender or a
        local terminal. These are inert architecture references, not executable adapters or
        installer commands.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {nexusCompanionPlans.map((p) => (
          <Button
            key={p.id}
            variant="signal"
            aria-pressed={plan === p.id}
            onClick={() => {
              setPlan(p.id);
              setConsent(false);
            }}
          >
            {p.name}
          </Button>
        ))}
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <p className="font-mono text-xs text-gold-light">{selected.language.toUpperCase()}</p>
          <pre className="mt-4 overflow-auto border border-border bg-card p-5 font-mono text-xs leading-7 text-muted-foreground">
            {selected.text}
          </pre>
          <a
            className="mt-4 block text-xs text-gold-light underline"
            href={selected.source}
            target="_blank"
            rel="noreferrer"
          >
            Official command-line documentation
          </a>
        </div>
        <div className="border-l border-border pl-6">
          <h3 className="text-lg">Permission & safety boundary</h3>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{selected.scope}</p>
          <p className="mt-4 text-xs leading-relaxed text-warning">
            Required: signed companion, device-bound identity, exact typed allowlist, temporary
            owner scopes, independent tests, preflight and proven rollback where supported. Never
            unrestricted shell.
          </p>
          <label className="mt-6 flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I understand this is a non-executable reference, not device authorization.
          </label>
          <Button
            variant="signal"
            className="mt-5 h-auto min-h-10 whitespace-normal"
            disabled={!consent}
            onClick={() => {
              const blob = new Blob(
                [
                  JSON.stringify(
                    {
                      mode: "REFERENCE_ONLY",
                      executionAllowed: false,
                      adapter: selected.id,
                      scope: selected.scope,
                      reference: selected.text,
                      source: selected.source,
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              );
              const u = URL.createObjectURL(blob),
                a = document.createElement("a");
              a.href = u;
              a.download = `nexus-${selected.id}-reference.json`;
              a.click();
              URL.revokeObjectURL(u);
            }}
          >
            <FileDown size={16} />
            Download inert plan
          </Button>
        </div>
      </div>
      <p className="mt-10 flex items-start gap-3 border-t border-border pt-6 text-sm text-warning">
        <LockKeyhole className="shrink-0" size={18} />
        Native execution, GitHub changes and real deployment remain blocked pending foundational
        security, independent evidence and owner authorization.
      </p>
    </section>
  );
}
