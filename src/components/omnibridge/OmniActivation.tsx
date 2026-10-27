import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, ShieldCheck, Terminal, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/evo";
import { useAccount } from "@/hooks/use-account";
import { readOmniActivation } from "@/lib/omni-activation.functions";
import type { OmniReadiness } from "@/lib/omni-activation";

export function OmniActivation() {
  const { user, ready } = useAccount();
  const check = useServerFn(readOmniActivation);
  const [result, setResult] = useState<OmniReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <section aria-label="Omni connection status" className="my-7 border-y border-gold/30 py-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="eyebrow">Private channel / activation checkpoints</p><h2 className="mt-3 text-2xl">OMNI connection</h2></div>
      <DemoBadge label={result?.state === "Ready for reviewed request" ? "READY · INFERENCE NOT VERIFIED" : "BLOCKED · ACTIVATION CHECKPOINTS"} />
    </div>
    <div className="mt-5 grid gap-6 md:grid-cols-3">
      <div><h3 className="flex items-center gap-2 text-sm"><ShieldCheck size={16} className="text-gold" />Private AI conversation</h3>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">{result ? `${result.state} · ${result.model}` : user ? "Connection not checked for this account." : "Blocked · sign in with a verified, founder-approved account."}</p>
        {result && <><ul className="mt-3 space-y-2 text-xs leading-6 text-warning">{result.blockers.map(b => <li key={b}>{b}</li>)}</ul><p className="mt-3 text-[10px] text-muted-foreground">Checked {new Date(result.checkedAt).toLocaleString()}. A check sends no prompt and spends no model credits.</p></>}
      </div>
      <div><h3 className="text-sm">Owner accounts & agents</h3><p className="mt-3 text-xs leading-6 text-muted-foreground">{result?.ownerAccounts ?? "Owner membership not checked. Invitations do not grant model or device permissions."}</p><p className="mt-3 text-xs leading-6 text-warning">Demo · agent declarations and Oracle/Guardian roles. No independent agent, tool runner or command execution.</p></div>
      <div><h3 className="flex items-center gap-2 text-sm"><Terminal size={16} className="text-gold" />Desktop / Honeycomb bridge</h3><p className="mt-3 text-xs leading-6 text-warning">Blocked · no authenticated companion adapter in this app.</p><p className="mt-3 text-xs leading-6 text-muted-foreground">Browser access cannot confirm installation or CLI login. Offline source commands stay separate; pairing, OS-secure credentials and scoped device approval are required.</p></div>
    </div>
    <div className="mt-5 flex flex-wrap gap-2">
      {user ? <Button variant="signal" size="sm" disabled={busy || !ready} onClick={async () => {
        if (busy) return;
        setBusy(true); setError(""); setResult(null);
        try { setResult(await check()); } catch { setError("Private connection check failed. Sign in again or retry; nothing was activated."); }
        finally { setBusy(false); }
      }}><RefreshCw size={14} />{busy ? "Checking…" : "Check private connection"}</Button> : <Button asChild variant="signal" size="sm"><Link to="/auth">Sign in for private OMNI<ArrowUpRight size={14} /></Link></Button>}
      <Button asChild variant="cosmic" size="sm"><Link to="/beta-omni">Open private OMNI<ArrowUpRight size={14} /></Link></Button>
      <Button asChild variant="ghost" size="sm"><Link to="/members">Members & invitations</Link></Button>
      <Button asChild variant="ghost" size="sm"><Link to="/platform">Offline CLI source</Link></Button>
    </div>
    {error && <p role="status" className="mt-4 text-xs leading-6 text-warning">{error}</p>}
    <p className="mt-4 text-[10px] leading-6 text-muted-foreground">Every model request still requires selected private context, consent and fresh server permission checks. No automatic commands, schema changes or activation of external services.</p>
  </section>;
}