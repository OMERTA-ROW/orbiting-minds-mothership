import { useState } from "react";
import { ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormNotice } from "@/components/genesis/GenesisShell";
import type { AccountabilityInput } from "@/lib/accountability";
import { compareAccountabilityArtifacts } from "@/lib/accountability-artifacts";
export function AccountabilityCompare({ input: v }: { input: AccountabilityInput }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [result, setResult] =
    useState<Awaited<ReturnType<typeof compareAccountabilityArtifacts>>>();
  return (
    <section className="mt-9 min-w-0 border-t border-border pt-7">
      <h2 className="text-2xl">Baseline vs observed artifact / Code Conflict Detective</h2>
      <p className="mt-4 whitespace-pre-line break-words text-sm leading-loose text-muted-foreground">
        {v.hashBasis}
      </p>
      <dl className="mt-5 grid gap-5 md:grid-cols-2">
        {[
          { label: "Declared approved-baseline hash", hash: v.baselineHash },
          { label: "Declared executed/observed hash", hash: v.observedHash },
        ].map((x) => (
          <div className="min-w-0" key={x.label}>
            <dt className="text-xs text-gold-light">{x.label}</dt>
            <dd className="mt-3 break-all font-mono text-xs text-muted-foreground">
              {x.hash || "UNAVAILABLE"}
            </dd>
          </div>
        ))}
      </dl>
      {v.baselineHash && v.observedHash && (
        <p className="mt-5 text-sm text-warning">
          Supplied metadata:{" "}
          {v.baselineHash === v.observedHash
            ? "hash strings match"
            : "HASH MISMATCH / MODIFIED UNVERIFIED"}{" "}
          · neither proves which software ran.
        </p>
      )}
      <p className="mt-5 text-xs leading-loose text-warning">
        Approved status, execution provenance and signatures: NOT VERIFIED. Comparisons apply only
        to supplied UTF-8 samples; nothing is executed.
      </p>
      {v.baselineText && v.observedText ? (
        <>
          <details className="mt-5">
            <summary className="cursor-pointer text-sm text-gold-light">
              Inspect supplied sample texts
            </summary>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              {[v.baselineText, v.observedText].map((text, i) => (
                <pre
                  aria-label={i ? "Observed sample text" : "Baseline sample text"}
                  key={i}
                  tabIndex={0}
                  className="max-h-64 overflow-auto border border-border p-4 font-mono text-xs leading-loose"
                >
                  {text}
                </pre>
              ))}
            </div>
          </details>
          <Button
            className="mt-5"
            variant="signal"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setResult(await compareAccountabilityArtifacts(v));
                setMessage(
                  "Calculated sample hashes locally; execution, signature and root cause remain unverified.",
                );
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "Comparison unavailable.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <ScanSearch size={16} />
            Compare supplied samples
          </Button>
        </>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">
          Sample text unavailable. No diff or calculated execution hash can be obtained from this
          browser.
        </p>
      )}
      <FormNotice message={message} />
      {result && (
        <div className="mt-6 min-w-0 border-l-2 border-warning pl-5">
          <p role="status" className="font-mono text-sm text-warning">
            {result.status}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Baseline matches declared hash:{" "}
            {result.baselineMatches === null ? "not supplied" : String(result.baselineMatches)} ·
            observed sample matches declared hash:{" "}
            {result.observedMatches === null ? "not supplied" : String(result.observedMatches)}
          </p>
          <p className="mt-4 break-all font-mono text-xs text-muted-foreground">
            Calculated observed sample SHA-256: {result.comparison.copyDigest}
          </p>
          <ul className="mt-5 space-y-3 text-sm text-warning">
            {result.comparison.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
            {result.syntax?.issues.map((w, i) => (
              <li key={i}>Syntax: {w}</li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            {result.syntax
              ? `${result.syntax.parser} · no semantic/security or independent runtime tests`
              : "Language unavailable; syntax not checked"}
          </p>
          <pre
            aria-label="Incident baseline versus observed diff"
            tabIndex={0}
            className="mt-6 max-h-96 overflow-auto border-y border-border py-4 font-mono text-xs leading-loose"
          >
            {result.comparison.diff.map((part, i) => (
              <span
                className={`block ${part.added ? "text-success" : part.removed ? "text-destructive" : "text-muted-foreground"}`}
                key={i}
              >
                {part.added ? "+ " : part.removed ? "− " : "  "}
                {part.value}
              </span>
            ))}
          </pre>
        </div>
      )}
    </section>
  );
}
