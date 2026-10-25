import { useRef, useState, type ChangeEvent } from "react";
import { Upload, X, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { maxGuardianEvidenceBytes, validateGuardianEvidence, type GuardianEvidenceEvent } from "@/lib/guardian-evidence";

export function DevelopmentEvidence() {
  const [events, setEvents] = useState<GuardianEvidenceEvent[]>([]);
  const [head, setHead] = useState("");
  const [issue, setIssue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const clear = () => { generation.current++; setEvents([]); setLoaded(false); setIssue(""); setBusy(false); if (input.current) input.current.value = ""; };
  const load = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const version = ++generation.current;
    setBusy(true); setEvents([]); setLoaded(false); setIssue("");
    try {
      if (file.size > maxGuardianEvidenceBytes) throw new Error("Evidence exceeds 2 MiB.");
      const checked = await validateGuardianEvidence(await file.text(), head.trim());
      if (version !== generation.current) return;
      setEvents(checked); setLoaded(true);
    } catch (error) {
      if (version !== generation.current) return;
      setIssue(error instanceof Error && !error.message.startsWith("[") ? error.message : "Evidence format is invalid. Preserve the original file.");
    } finally { if (version === generation.current) setBusy(false); }
  };
  return <section aria-labelledby="development-evidence-title">
    <p className="font-mono text-xs text-gold-light">OFFLINE DEVELOPMENT EVIDENCE · NO LIVE GUARDIAN CONNECTION</p>
    <h2 id="development-evidence-title" className="mt-4 text-2xl">Local defense evidence</h2>
    <p className="mt-4 max-w-3xl text-sm leading-loose text-muted-foreground">Selected-project checks and fixed-task denials are enforced by the local companion, outside any model. Linux cancellation targets the task’s process group; detached processes can escape. Files and network are not isolated.</p>
    <p className="mt-4 max-w-3xl text-sm leading-loose text-warning">Ghost security is quiet defense with owner-visible evidence, never stealth or retaliation. Pattern warnings are advisory and can miss attacks or flag benign discussion. No connected authentication-failure sensor, hosted capabilities or durable rate limiter.</p>
    <div className="mt-6 border-y border-border py-6">
      <p className="text-sm text-muted-foreground">Local export: <code className="break-all text-gold-light">evolution guardian audit --project &lt;absolute-directory&gt; --json</code></p>
      <label className="mt-5 block max-w-2xl text-xs">Independently saved chain head · optional<input aria-label="Independently saved chain head" value={head} maxLength={64} onChange={e => { clear(); setHead(e.target.value); }} className="exchange-select mt-2 w-full font-mono" /></label>
      <input ref={input} type="file" accept=".json,application/json" aria-label="Local Guardian evidence file" className="hidden" onChange={load} />
      <div className="mt-5 flex flex-wrap gap-3"><Button variant="signal" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} />{busy ? "Checking evidence…" : "Open local evidence"}</Button><Button variant="ghost" disabled={!loaded && !issue && !busy} onClick={clear}><X size={16} />Clear evidence</Button></div>
      <p className="mt-4 text-xs leading-loose text-muted-foreground">File stays in this page’s memory; no upload or saved browser record. Internal hash consistency is not identity, a signature or immutable audit. A same-user writer can rewrite the chain; an independently retained head is needed to detect replacement or truncation.</p>
    </div>
    {issue && <p role="alert" className="mt-5 break-words text-sm text-warning">{issue}</p>}
    {!loaded && !issue && <p className="mt-6 text-sm text-muted-foreground">No imported security evidence. No detections claimed.</p>}
    {loaded && <div className="mt-6"><p role="status" className="text-sm text-gold-light">Internal fingerprints consistent{head.trim() ? " · matches saved head" : " · external anchor not supplied"}.</p>{!events.length && <p className="mt-4 text-sm text-muted-foreground">Empty evidence export; no activity recorded.</p>}<ol className="mt-6 divide-y divide-border">{events.map(e => <li key={e.sequence} className="py-5"><div className="flex flex-wrap items-center gap-3 font-mono text-xs"><span className="text-warning">{e.severity.toUpperCase()}</span><span className="text-gold-light">{e.rule}</span><span>{e.action}</span></div><p className="mt-3 break-words text-sm text-muted-foreground">{e.evidence}</p><p className="mt-3 break-all font-mono text-[10px] text-muted-foreground">{e.at} · {e.project} · #{e.sequence}</p><p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">SHA-256 {e.sha256}</p></li>)}</ol></div>}
    <div className="mt-8 border-t border-border pt-6"><h3 className="text-xl">Owner recovery & remaining stages</h3><p className="mt-4 max-w-3xl text-sm leading-loose text-muted-foreground">Keep original evidence and its head before reviewing interrupted writes or a changed project profile. Explicitly reselect only the known-good local project after review; this does not restore code versions. No automatic deletion or unrelated-account lockout.</p><Button variant="outline" disabled className="mt-5 h-auto min-h-11 whitespace-normal"><LockKeyhole size={16} />Hosted revoke / restore · adapter unavailable</Button><p className="mt-4 text-xs leading-loose text-muted-foreground">Still required: authenticated event ingestion and owner-only audit, expiring/revocable server capabilities, confirmed durable rate-limit policy, isolated jobs and native cancellation, externally anchored evidence and reviewed signed-version restoration. Parrot Security OS is not installed or integrated.</p></div>
  </section>;
}