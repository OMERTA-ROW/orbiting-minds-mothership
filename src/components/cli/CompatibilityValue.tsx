import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Download, Shield, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { compatibilityPolicy } from "@/data/evolution";

export function CompatibilityValue() {
  const [notice, setNotice] = useState("");
  function exportPolicy() {
    let url: string | undefined;
    try {
      url = URL.createObjectURL(
        new Blob([JSON.stringify(compatibilityPolicy, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "evolution-compatibility-policy.json";
      a.click();
      setNotice(
        "Policy exported. Roadmap terms only; no keys, user records, pricing or entitlements.",
      );
    } catch {
      setNotice("Export unavailable. No settings or records changed.");
    } finally {
      if (url) {
        const objectUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    }
  }
  return (
    <section aria-label="Compatibility-first access and value" className="min-w-0">
      <p className="eyebrow">Product principle / not a paid plan</p>
      <h2 className="mt-4 text-3xl">Keep what you already invested in.</h2>
      <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground">
        Evolution enhances your existing shells, IDEs and authorized tools. No replacement IDE,
        default tool bundle or required recurring subscription for basic access. Preview in the
        browser without downloading anything.
      </p>
      <div className="mt-8 grid gap-8 md:grid-cols-3">
        <section className="min-w-0 border-t border-gold/30 pt-5">
          <h3 className="text-xl">Basic / local</h3>
          <p className="mt-3 font-mono text-[10px] text-gold-light">
            NO REQUIRED RECURRING SUBSCRIPTION
          </p>
          <p className="mt-4 text-xs leading-7 text-muted-foreground">
            Offline source help, version and command-name doctor need no account or AI call. Public
            CLI distribution remains planned. Free/open-source local diagnostics and extension
            discovery are intended where financially feasible; a source license is not yet approved,
            and project diagnostics are not implemented.
          </p>
        </section>
        <section className="min-w-0 border-t border-gold/30 pt-5">
          <h3 className="text-xl">Your providers / opt-in</h3>
          <p className="mt-3 font-mono text-[10px] text-warning">THIRD-PARTY FEES MAY APPLY</p>
          <p className="mt-4 text-xs leading-7 text-muted-foreground">
            Existing consumer subscriptions do not include API access automatically. Provider terms,
            model support, token charges and budgets require confirmation. No guaranteed free AI
            calls. Actual usage/cost: unmeasured; no live usage meter or connected OMNI provider.
          </p>
        </section>
        <section className="min-w-0 border-t border-gold/30 pt-5">
          <h3 className="text-xl">Hosted / team</h3>
          <p className="mt-3 font-mono text-[10px] text-warning">
            OPTIONAL · PROPOSED · PRICING TBD
          </p>
          <p className="mt-4 text-xs leading-7 text-muted-foreground">
            Advanced paid hosted compute and team services may be offered later. They are not a
            prerequisite for basic local access. No offering, checkout, charge or recurring billing
            is enabled.
          </p>
        </section>
      </div>
      <div className="mt-9 grid gap-8 border-y border-border py-7 lg:grid-cols-2">
        <section className="min-w-0">
          <div className="flex items-start gap-3">
            <Shield size={18} className="mt-1 shrink-0 text-gold" />
            <h3 className="text-xl">Authorized. Exportable. Reversible.</h3>
          </div>
          <p className="mt-4 text-xs leading-7 text-muted-foreground">
            Bring-your-own API keys belong only in secure settings or a verified OS vault with
            scoped approval, never chat, command arguments or a plaintext browser form. Key intake
            and connectors remain disabled. JSON plans/manifests can be exported; imports and
            provider migrations are not yet supported.
          </p>
          <p className="mt-4 text-xs leading-7 text-muted-foreground">
            Keep original project files and provider tools independent. No automatic PATH, alias or
            toolchain edits. Source uninstall checks unchanged owned copies and consent; native
            platform/security review still precedes delivery. Prefer existing authorized
            installations and reusable artifacts; no carbon-neutral or energy-savings claim.
          </p>
        </section>
        <section className="min-w-0">
          <div className="flex items-start gap-3">
            <Terminal size={18} className="mt-1 shrink-0 text-gold" />
            <h3 className="text-xl">Evidence, not an agent-count promise.</h3>
          </div>
          <dl className="mt-4 space-y-4 text-xs leading-6">
            <div>
              <dt className="text-gold-light">Source checks / development sandbox</dt>
              <dd className="mt-1 text-muted-foreground">
                Linux/amd64 help, doctor, collision and install/uninstall paths checked. Six
                unsigned macOS/Linux/Windows source targets compiled; native macOS/Windows/arm64
                execution unverified. Not a signed installer or a verified user-project build.
              </dd>
            </div>
            <div>
              <dt className="text-gold-light">Time, cost and context-switching benefit</dt>
              <dd className="mt-1 text-muted-foreground">
                No measured user savings yet. Compare paired baseline/candidate observations, same
                task/version, method and limitations in the existing Impact Scorecard. Its declared
                samples remain DEMO, not independently verified savings or provider telemetry.
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild variant="signal">
          <Link to="/omnibridge">
            Discover reference capabilities
            <ArrowUpRight size={14} />
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/impact-scorecard">
            Compare value evidence · DEMO
            <ArrowUpRight size={14} />
          </Link>
        </Button>
        <Button variant="ghost" onClick={exportPolicy}>
          <Download size={14} />
          Export access policy
        </Button>
      </div>
      {notice && (
        <p
          role="status"
          className="mt-5 border-l border-gold pl-4 text-xs leading-7 text-gold-light"
        >
          {notice}
        </p>
      )}
      <p className="mt-6 text-xs leading-7 text-warning">
        Cyberace is an optional DEMO project example, compatibility unconfirmed. Secure owner
        accounts, authorized adapters, private key custody, native release evidence and owner
        approval still gate activation.
      </p>
    </section>
  );
}
