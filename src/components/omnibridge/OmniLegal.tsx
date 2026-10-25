import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Download, FileText, FolderOpen, Scale, Shield, Terminal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DemoBadge } from "@/components/evo";
import { legalSources } from "@/data/omni-legal-sources";
import { appendLegalAudit, initialRequirementLinks, missingInformation, preparationState, redactLegalText, reviewRequirement, sampleLegalDraft, sourceChecklist, transmissionGate, type Jurisdiction, type LegalAuditEvent, type LegalDraft, type RequirementLink } from "@/lib/omni-legal";

export function OmniLegal() {
  const [draft, setDraft] = useState(sampleLegalDraft);
  const [links, setLinks] = useState(initialRequirementLinks);
  const [audit, setAudit] = useState<LegalAuditEvent[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [packet, setPacket] = useState<{ pdf: Uint8Array; zip: Uint8Array; redactions: number } | null>(null);
  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  const state = preparationState(draft);
  const checklist = sourceChecklist(draft);
  const redaction = redactLegalText(draft.body);

  function edit(patch: Partial<LegalDraft>) {
    revision.current++;
    const next = { ...draft, ...patch };
    setDraft(next); setPacket(null); setNotice("");
    setAudit((events) => appendLegalAudit(events, "draft-edited", next));
  }
  function editLink(index: number, patch: Partial<RequirementLink>) {
    revision.current++;
    setLinks((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));
    setPacket(null);
  }
  function reset() {
    revision.current++;
    const next = sampleLegalDraft();
    setDraft(next); setLinks(initialRequirementLinks()); setPacket(null); setConfirmed(false);
    setAudit([]); setNotice("Synthetic session reset. No case files stored or uploaded.");
  }
  async function prepare() {
    if (!confirmed || busy) return;
    const startedRevision = revision.current;
    setBusy(true); setNotice("");
    try {
      const events = appendLegalAudit(audit, "packet-prepared", draft);
      const { prepareLegalPacket } = await import("@/lib/omni-legal-export");
      const prepared = await prepareLegalPacket(draft, links, events);
      if (revision.current !== startedRevision) return;
      setPacket(prepared); setAudit(events);
      setNotice("Synthetic PDF and exhibit packet prepared. Missing fields and unresolved reviews remain listed; nothing submitted.");
    } catch { setNotice("Packet could not be prepared. No transmission occurred."); }
    finally { setBusy(false); }
  }
  function download(kind: "pdf" | "zip") {
    if (!packet) return;
    const bytes = new Uint8Array(packet[kind]);
    const url = URL.createObjectURL(new Blob([bytes], { type: kind === "pdf" ? "application/pdf" : "application/zip" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `omni-legal-synthetic.${kind}`; anchor.click(); URL.revokeObjectURL(url);
    setAudit((events) => appendLegalAudit(events, "exported", draft));
  }

  return <main className="mx-auto max-w-[1300px] px-4 pb-20 pt-8 md:px-8">
    <header className="border-b border-gold/30 pb-7">
      <div className="flex flex-wrap items-center gap-3"><span className="eyebrow">OMNI / legal side</span><DemoBadge label="SYNTHETIC · SESSION ONLY" /></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-5"><h1 className="flex items-center gap-4 text-4xl"><Scale className="text-gold" size={32} />Omni Legal</h1><Button asChild variant="ghost" size="sm"><Link to="/omni-rights">Rights workspace<ArrowUpRight /></Link></Button></div>
      <p className="mt-4 max-w-3xl text-xs leading-6 text-warning">Preparation only, not legal advice or automatic compliance. Synthetic documents only; do not enter real case details. No filings, payments, service, signatures or connected court accounts.</p>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] text-muted-foreground"><span>CASE ACCESS: REAL RECORDS BLOCKED</span><span>DEADLINES: UNVERIFIED</span><span>COURTS: NOT CONNECTED</span></div>
    </header>

    <section className="my-6 grid gap-5 border-b border-border pb-6 sm:grid-cols-3">
      <label className="text-xs text-muted-foreground">Jurisdiction<select aria-label="Jurisdiction" className="exchange-select mt-2 w-full" value={draft.jurisdiction} onChange={(e) => edit({ jurisdiction: e.target.value as Jurisdiction, privacyReviewed: false })}><option value="federal">Federal · US civil district court</option><option value="state">State · preparation only</option><option value="local">Local · preparation only</option></select></label>
      <label className="text-xs text-muted-foreground">State / local region<input aria-label="State or local region" maxLength={120} value={draft.region} onChange={(e) => edit({ region: e.target.value })} className="exchange-select mt-2 w-full" placeholder="Not selected" /></label>
      <label className="text-xs text-muted-foreground">Exact court<input aria-label="Exact court" maxLength={160} value={draft.court} onChange={(e) => edit({ court: e.target.value })} className="exchange-select mt-2 w-full" placeholder="Required — fictional selection" /></label>
    </section>

    <Tabs defaultValue="draft">
      <TabsList aria-label="Legal views" className="mb-6 h-auto w-full flex-wrap justify-start gap-1 rounded-sm border border-border bg-background p-1">
        <TabsTrigger value="draft"><FileText className="mr-2 size-4" />Draft & exhibits</TabsTrigger><TabsTrigger value="research">Sources & checklist</TabsTrigger><TabsTrigger value="code">Software review</TabsTrigger><TabsTrigger value="audit"><Shield className="mr-2 size-4" />Access & audit</TabsTrigger><TabsTrigger value="terminal"><Terminal className="mr-2 size-4" />Terminal</TabsTrigger>
      </TabsList>

      <TabsContent value="draft">
        <div className="grid gap-8 lg:grid-cols-2">
          <section className="min-w-0"><h2 className="text-2xl">Draft preparation</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
            {([{ key: "documentTitle", label: "Document title" }, { key: "caseNumber", label: "Case / file number" }, { key: "partyA", label: "Fictional first party" }, { key: "partyB", label: "Fictional second party" }] as const).map((f) => <label key={f.key} className="text-xs text-muted-foreground">{f.label}<input aria-label={f.label} className="exchange-select mt-2 w-full" value={draft[f.key]} maxLength={160} onChange={(e) => edit({ [f.key]: e.target.value })} /></label>)}
          </div><label className="mt-5 block text-xs text-muted-foreground">Synthetic draft text<textarea aria-label="Synthetic draft text" className="exchange-select mt-2 min-h-52 w-full resize-y font-mono text-xs leading-6" maxLength={20000} value={draft.body} onChange={(e) => edit({ body: e.target.value, privacyReviewed: false })} /></label>
            <label className="mt-4 flex items-start gap-3 text-xs leading-5"><input type="checkbox" className="mt-1 accent-gold" checked={draft.privacyReviewed} onChange={(e) => edit({ privacyReviewed: e.target.checked })} />I reviewed the synthetic draft, caption and exhibits for privacy. This is not court clearance.</label>
            <h3 className="mt-7 flex items-center gap-2 text-lg"><FolderOpen className="size-4 text-gold" />Exhibits / preserved originals</h3>
            {draft.exhibits.map((e) => <details key={e.id} className="mt-3 border-b border-border pb-3 text-xs"><summary className="cursor-pointer text-gold-light">Exhibit {e.id} · {e.title}</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">{e.original}</pre></details>)}
          </section>
          <section className="min-w-0 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl">Review copy</h2><DemoBadge label={state === "draft" ? "DRAFT" : "READY FOR REVIEW · NOT FILING"} /></div>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">Redacted derivative · {redaction.count} pattern matches. Incomplete detection; names, minors, exceptions and court orders need human review.</p>
            <pre className="mt-4 min-h-40 whitespace-pre-wrap break-words border-y border-border py-5 font-mono text-xs leading-6">{redaction.text}</pre>
            <h3 className="mt-5 text-sm text-warning">Missing information</h3><ul className="mt-2 space-y-1 text-xs leading-6 text-muted-foreground">{missingInformation(draft).map((m) => <li key={m}>— {m}</li>)}{missingInformation(draft).length === 0 && <li>Basic fields present. Local rules, signatures, deadlines and legal sufficiency remain unresolved.</li>}</ul>
            <label className="mt-5 flex items-start gap-3 text-xs leading-5"><input type="checkbox" checked={confirmed} onChange={(e) => { revision.current++; setConfirmed(e.target.checked); if (!e.target.checked) setPacket(null); }} className="mt-1 accent-gold" />These are fictional documents only. The ZIP includes unchanged, unredacted synthetic originals.</label>
            <div className="mt-5 flex flex-wrap gap-3"><Button variant="signal" disabled={!confirmed || busy} onClick={() => void prepare()}><FileText />{busy ? "Preparing…" : "Prepare synthetic packet"}</Button>{packet && <><Button variant="ghost" onClick={() => download("pdf")}><Download />PDF</Button><Button variant="ghost" onClick={() => download("zip")}><Download />Exhibit ZIP</Button></>}</div>
            <p className="mt-4 text-[11px] leading-6 text-muted-foreground">Export only · basic letter-size PDF, not court-validated or PDF/A. Non-ASCII glyphs become “?”. Originals stay byte-identical in the ZIP. Any edit invalidates the prepared packet.</p>
          </section>
        </div>
      </TabsContent>

      <TabsContent value="research"><h2 className="text-2xl">Procedure & official sources</h2><p className="mt-3 text-xs leading-6 text-warning">Dated official snapshots, not a live research service. {draft.jurisdiction === "federal" ? "Federal civil rules only; verify selected court, applicability and source freshness." : "State/local sources and procedures are not configured. Federal checklist rules are not applied."}</p>
        <ul className="mt-5 divide-y divide-border">{checklist.map((c) => { const source = legalSources.find((s) => s.id === c.sourceId); return <li key={c.id} className="flex gap-4 py-5">{c.satisfied ? <Check className="mt-1 size-4 shrink-0 text-gold" /> : <X className="mt-1 size-4 shrink-0 text-warning" />}<div><h3 className="text-sm">{c.label}</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">{c.note}</p>{source ? <a href={source.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 text-xs text-gold underline">{source.title}<ArrowUpRight className="size-3" /></a> : <p className="mt-2 text-xs text-warning">No verified applicable source</p>}</div></li>; })}</ul>
        {draft.jurisdiction === "federal" && <section className="mt-8 border-t border-border pt-6"><h3 className="text-xl">Source register</h3>{legalSources.map((s) => <article key={s.id} className="mt-5 border-b border-border pb-5"><a href={s.url} target="_blank" rel="noreferrer" className="text-sm text-gold underline">{s.title}</a><p className="mt-2 text-[11px] text-muted-foreground">{s.jurisdiction} · {s.status} · retrieved {s.retrievedAt}</p><p className="mt-2 text-xs leading-6 text-warning">Effective date: {s.effectiveDate ?? "rule-specific date UNVERIFIED"}. {s.effectiveNote}</p><p className="mt-2 text-xs leading-6 text-muted-foreground">{s.summary}</p></article>)}<p className="mt-5 text-xs text-warning">No substantive federal statute applicability determined. Proposals are not effective law. Broader laws, court sources and live refresh remain pending.</p></section>}
      </TabsContent>

      <TabsContent value="code"><h2 className="text-2xl">Software legal-requirements review</h2><p className="mt-3 max-w-3xl text-xs leading-6 text-warning">Reference links connect procedural requirements to code and tests. They do not prove applicability, execution or automatic legal compliance. These are this workspace’s actual source/test references, not generated compliance certificates.</p>
        {links.map((link, index) => { const review = reviewRequirement(link, draft.jurisdiction); return <section key={link.sourceId} className="mt-6 border-b border-border pb-6"><a href={review.source?.url} target="_blank" rel="noreferrer" className="text-sm text-gold underline">{review.source?.title}</a><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-xs text-muted-foreground">Code reference<input className="exchange-select mt-2 w-full" aria-label={`Code reference ${index + 1}`} maxLength={240} value={link.codePath} onChange={(e) => editLink(index, { codePath: e.target.value })} /></label><label className="text-xs text-muted-foreground">Regression test reference<input className="exchange-select mt-2 w-full" aria-label={`Test reference ${index + 1}`} maxLength={240} value={link.testPath} onChange={(e) => editLink(index, { testPath: e.target.value })} /></label></div><label className="mt-4 block text-xs text-muted-foreground">Unresolved question<textarea className="exchange-select mt-2 min-h-24 w-full" aria-label={`Unresolved question ${index + 1}`} value={link.question} maxLength={1500} onChange={(e) => editLink(index, { question: e.target.value })} /></label><label className="mt-3 flex items-center gap-3 text-xs"><input className="accent-gold" type="checkbox" checked={link.applicability === "reviewed"} onChange={(e) => editLink(index, { applicability: e.target.checked ? "reviewed" : "unresolved" })} />Applicability reviewed (self-declared; no certification)</label><ul className="mt-4 space-y-2 text-xs text-warning">{review.problems.map((p) => <li key={p}>— {p}</li>)}</ul><p className="mt-3 text-xs text-muted-foreground">{review.claim}</p></section>; })}
      </TabsContent>

      <TabsContent value="audit"><h2 className="text-2xl">Case protection & evidence</h2><p className="mt-3 max-w-3xl text-xs leading-6 text-warning">Real case intake is unavailable. Drafts are in this page’s memory only, not saved to browser storage or uploaded. There is no authenticated case vault, multiuser access, trusted audit or restart recovery. Use synthetic data only.</p><p className="mt-4 text-xs leading-6 text-muted-foreground">Session activity stores fixed action/time/jurisdiction/state only. Same-user edits/reset can change it; it is neither immutable nor legal evidence. No terminal logs receive draft or exhibit contents.</p><div className="mt-5 flex flex-wrap gap-3"><Button variant="ghost" onClick={reset}>Reset synthetic session</Button><Button asChild variant="signal"><Link to="/guardian"><Shield />Guardian evidence<ArrowUpRight /></Link></Button></div><ul className="mt-6 divide-y divide-border font-mono text-[11px]">{audit.length === 0 && <li className="py-4 text-muted-foreground">No recorded session actions</li>}{audit.slice().reverse().map((e) => <li key={e.sequence} className="break-words py-3">{e.at} · {e.action} · {e.jurisdiction} · {e.state}</li>)}</ul></TabsContent>

      <TabsContent value="terminal"><h2 className="text-2xl">Omni Legal / offline terminal</h2><p className="mt-3 text-xs leading-6 text-muted-foreground">Offline companion source reference. No browser-to-device connection or shared case state. Commands return only bounded preparation metadata, never case contents.</p><pre className="mt-5 overflow-x-auto border-y border-border py-5 font-mono text-xs leading-7">{`evolution omni legal status --project <dir> --json\nevolution omni legal checklist --project <dir> --jurisdiction federal --json\n# omni alias: omni legal status --project <dir> --json`}</pre><p className="mt-4 text-xs leading-6 text-warning">Federal, state and local selections are supported as labels; state/local research adapters remain unavailable. No CLI drafting/upload/filing service or model connection.</p><Button asChild variant="signal" className="mt-5"><Link to="/platform">Companion & workspace<ArrowUpRight /></Link></Button></TabsContent>
    </Tabs>

    {notice && <p role="status" className="mt-6 border-l border-gold py-3 pl-4 text-xs leading-6 text-gold-light">{notice}</p>}
    <section className="mt-10 border-t border-gold/30 pt-6"><h2 className="text-xl">E-filing / {transmissionGate.status}</h2><p className="mt-3 max-w-3xl text-xs leading-6 text-warning">{transmissionGate.reason}</p><ol className="mt-4 flex flex-wrap gap-4 font-mono text-[10px] text-muted-foreground"><li>01 DRAFT</li><li>02 READY FOR REVIEW</li><li>03 SUBMITTED · authentic provider receipt required</li><li>04 ACCEPTED / REJECTED · court evidence required</li></ol><Button disabled variant="signal" className="mt-5">Court transmission unavailable</Button></section>
  </main>;
}