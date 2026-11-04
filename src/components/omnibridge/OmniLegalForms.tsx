import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Download, FileText, Folder, FolderOpen, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BLANK_FORM_MAX_BYTES, inspectManualLegalPdf, officialCourtDirectory, officialFormDirectory, resolveBlankFormCatalog } from "@/lib/omni-legal-forms";
import { FEDERAL_COURT, LEGAL_FORMS_LIBRARY_NAME, legalLibrarySegments, librarySelectionMissing, manualClassification, referenceCheckState, selectedProceduralReferences, type LibrarySelection, type ManualDocumentKind } from "@/lib/omni-legal-library";
import { retrieveOfficialBlankForm } from "@/lib/omni-legal-forms.functions";

type Retrieved = Awaited<ReturnType<typeof retrieveOfficialBlankForm>>;
type Intake = { id: string; result: Retrieved | null; loading: boolean };

export function OmniLegalForms() {
  const [selection, setSelection] = useState<LibrarySelection>({ courtLevel: "state", state: "", county: "", court: "", filingType: "" });
  const [intake, setIntake] = useState<Intake[]>([]);
  const [retry, setRetry] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedSelection, setConfirmedSelection] = useState("");
  const [documentKind, setDocumentKind] = useState<ManualDocumentKind>("blank-unverified");
  const [caseId, setCaseId] = useState("SYNTHETIC-EXAMPLE");
  const [today, setToday] = useState("");
  const [manual, setManual] = useState<{ metadata: Awaited<ReturnType<typeof inspectManualLegalPdf>>; original: Uint8Array; classification: ReturnType<typeof manualClassification> } | null>(null);
  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  const manualRevision = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const fetchForm = useServerFn(retrieveOfficialBlankForm);
  const fetchRef = useRef(fetchForm);
  fetchRef.current = fetchForm;
  const catalog = resolveBlankFormCatalog(selection);
  const segments = legalLibrarySegments(selection);
  const references = selectedProceduralReferences(selection);
  const jurisdictionConfirmed = confirmedSelection === JSON.stringify(selection);
  const federalSelected = selection.courtLevel === "federal";

  useEffect(() => { setToday(new Date().toISOString().slice(0, 10)); }, []);
  useEffect(() => () => { manualRevision.current++; }, []);

  useEffect(() => {
    const token = ++revision.current;
    const next = resolveBlankFormCatalog(selection);
    setIntake(next.forms.map((f) => ({ id: f.id, result: null, loading: true })));
    if (next.status !== "available") return;
    let active = true;
    void (async () => {
      for (const form of next.forms) {
        if (!active || revision.current !== token) break;
        let result: Retrieved;
        try { result = await fetchRef.current({ data: { id: form.id } }); }
        catch { result = { status: "unavailable", id: form.id, error: "Official source request failed. Use official-site handoff.", pdf: null }; }
        if (!active || revision.current !== token) break;
        setIntake((rows) => rows.map((row) => row.id === form.id ? { id: form.id, result, loading: false } : row));
      }
    })();
    return () => { active = false; };
  }, [selection.courtLevel, selection.state, selection.county, selection.court, selection.filingType, retry]);

  function choose(patch: Partial<LibrarySelection>) {
    revision.current++; manualRevision.current++; setConfirmedSelection(""); setNotice("");
    setIntake([]); setSelection((old) => ({ ...old, ...patch }));
  }
  function download(bytes: Uint8Array, name: string) {
    try {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("PDF download prepared. No court submission or Desktop sync.");
    } catch { setNotice("PDF download failed. The session copy is preserved; retry the download."); }
  }
  async function manualIntake(file: File | undefined) {
    if (!file) return;
    const token = ++manualRevision.current;
    setNotice("");
    try {
      const classification = manualClassification(selection, confirmedSelection, documentKind, caseId);
      if (file.size > BLANK_FORM_MAX_BYTES) throw new Error("PDF must be at most 4 MiB.");
      const original = new Uint8Array(await file.arrayBuffer());
      const metadata = await inspectManualLegalPdf(file.name, original, confirmed);
      if (manualRevision.current !== token) return;
      setManual({ metadata, original, classification }); setNotice("Document classified under the confirmed jurisdiction in this session only. Not added to the official blank library; no upload or Desktop write.");
    } catch (error) { if (manualRevision.current === token) setNotice(error instanceof Error ? error.message : "Manual PDF intake failed."); }
    finally { if (fileInput.current) fileInput.current.value = ""; }
  }

  return <section aria-label="Legal Forms web library" className="border-b border-border py-7">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-3 text-2xl"><FolderOpen className="size-5 text-gold" />{LEGAL_FORMS_LIBRARY_NAME}</h2><p className="mt-3 max-w-3xl text-xs leading-6 text-muted-foreground">Web library · official blank forms and procedural references · limited verified coverage.</p><p className="mt-2 max-w-3xl text-xs leading-6 text-warning">No “Legal Forms” folder created on your device. Desktop creation/sync requires an installed supported companion and explicit filesystem authorization; connection unavailable.</p></div><Button variant="ghost" size="sm" disabled={catalog.status !== "available" || intake.some((r) => r.loading)} onClick={() => setRetry((n) => n + 1)}><RefreshCw />Retry retrieval</Button></div>
    <label className="mt-5 block max-w-sm text-xs text-muted-foreground">Court system<select aria-label="Library court system" className="exchange-select mt-2 w-full" value={selection.courtLevel} onChange={(e) => choose({ courtLevel: e.target.value as LibrarySelection["courtLevel"], court: "", filingType: "" })}><option value="state">State / county court</option><option value="federal">Federal court</option></select></label>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs text-muted-foreground">Catalog state<select aria-label="Catalog state" className="exchange-select mt-2 w-full" value={selection.state} onChange={(e) => choose({ state: e.target.value, county: "", court: "" })}><option value="">Select state</option><option value="CA">California</option><option value="other">Other state · catalog unavailable</option></select></label>
      <label className="text-xs text-muted-foreground">Catalog county<select aria-label="Catalog county" disabled={!selection.state} className="exchange-select mt-2 w-full" value={selection.county} onChange={(e) => choose({ county: e.target.value, court: "" })}><option value="">Select county</option>{selection.state === "CA" && <><option value="Los Angeles">Los Angeles</option><option value="San Francisco">San Francisco</option></>}<option value="other">Other county · unavailable</option></select></label>
      <label className="text-xs text-muted-foreground">Catalog court<select aria-label="Catalog court" disabled={!selection.county} className="exchange-select mt-2 w-full" value={selection.court} onChange={(e) => choose({ court: e.target.value })}><option value="">Select exact court</option>{selection.state === "CA" && (federalSelected ? <option value={FEDERAL_COURT}>US District Court · Central California</option> : selection.county !== "other" && selection.county && <option value={`Superior Court of California, County of ${selection.county}`}>Superior Court · {selection.county}</option>)}<option value="other">Other court · unavailable</option></select></label>
      <label className="text-xs text-muted-foreground">Filing / case type<select aria-label="Filing or case type" className="exchange-select mt-2 w-full" value={selection.filingType} onChange={(e) => choose({ filingType: e.target.value })}><option value="">Select filing type</option>{federalSelected ? <option value="federal-civil">Federal civil · review</option> : <><option value="small-claims-claim">Small claims · plaintiff claim</option><option value="declaration-review">General declaration · review only</option></>}<option value="affidavit">Affidavit · no verified catalog</option><option value="other">Other filing · unavailable</option></select></label>
    </div>
    <p className="mt-4 text-xs leading-6 text-warning">Actual case jurisdiction is your selection, not GPS, IP, residence or upload origin. Cases may be elsewhere. No location collected; optional location suggestions are not enabled. Federal county folders are organizational context, not a venue determination.</p>
    <nav aria-label="Legal Forms folder hierarchy" className="mt-4 border-y border-border py-3"><ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[11px] leading-5 text-gold-light">{segments.map((segment, i) => <li key={i} className="flex min-w-0 items-center gap-2 break-words"><Folder className="size-3 shrink-0 text-gold" />{segment}{i < segments.length - 1 && <span className="text-muted-foreground">›</span>}</li>)}</ol></nav>
    <p role="status" className="mt-4 text-xs leading-6 text-warning">{catalog.note}</p>
    <ul aria-label="Form intake missing information" className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">{catalog.missing.map((m) => <li key={m}>— {m}</li>)}</ul>
    <h3 className="mt-6 flex items-center gap-2 text-lg"><FileText className="size-4 text-gold" />Official blank forms / affidavits</h3>
    {catalog.forms.map((form) => {
      const row = intake.find((r) => r.id === form.id);
      const pdf = row?.result?.pdf;
      return <article key={form.id} className="mt-5 min-w-0 border-t border-border pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-sm text-gold-light">{form.id} · {form.title}</h3><p className="mt-2 text-[11px] leading-5 text-muted-foreground">Revision {form.revisionDate} · catalog checked {form.verifiedAt} · {form.kind} · {referenceCheckState(form.verifiedAt, today) === "recheck-required" ? "DATED COVERAGE · RECHECK REQUIRED" : "dated verified snapshot; not complete coverage"}</p></div>{pdf && <Button size="sm" variant="signal" onClick={() => download(Uint8Array.from(atob(pdf.base64), (c) => c.charCodeAt(0)), `${form.id}-official-blank.pdf`)}><Download />Download {form.id}</Button>}</div>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">{form.note}</p>
        <div className="mt-3 flex flex-wrap gap-4"><a className="inline-flex items-center gap-1 break-all text-xs text-gold underline" href={form.sourceUrl} target="_blank" rel="noreferrer">Official catalog source<ArrowUpRight className="size-3 shrink-0" /></a><a className="break-all text-xs text-gold underline" href={form.pdfUrl} target="_blank" rel="noreferrer">Official PDF URL<ArrowUpRight className="ml-1 inline size-3" /></a></div>
        <p role="status" className="mt-3 break-words text-[11px] leading-6 text-warning">{pdf ? `RETRIEVED · ${pdf.bytes} bytes · ${pdf.retrievedAt}` : row?.loading ? "Retrieving official blank PDF…" : row?.result?.error ?? "Retrieval pending"}</p>
        {pdf && <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">SHA-256 {pdf.sha256} · unchanged verified source version · not registration or court receipt</p>}
      </article>;
    })}
    <div className="mt-5 flex flex-wrap gap-5">{!federalSelected && <><a href={officialFormDirectory} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gold underline">Official California forms<ArrowUpRight className="size-3" /></a><a href={officialCourtDirectory} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gold underline">Official court directory<ArrowUpRight className="size-3" /></a></>}{federalSelected && <a href="https://www.uscourts.gov/about-federal-courts/court-role-and-structure/court-website-links" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gold underline">Official federal court directory<ArrowUpRight className="size-3" /></a>}</div>
    <section aria-label="Selected court procedural references" className="mt-7 border-t border-border pt-5"><h3 className="text-lg">Procedural references</h3>{references.length === 0 && <p className="mt-3 text-xs leading-6 text-warning">No verified procedural references for this selection. Local coverage pending; federal rules are not applied to state cases.</p>}{references.map((reference) => <article key={reference.id} className="mt-4 border-b border-border pb-4"><a href={reference.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-gold underline">{reference.title}<ArrowUpRight className="size-3 shrink-0" /></a><p className="mt-2 text-[11px] leading-5 text-muted-foreground">{reference.version} · checked {reference.checkedAt} · {referenceCheckState(reference.checkedAt, today) === "recheck-required" ? "DATED SNAPSHOT · RECHECK REQUIRED" : "DATED OFFICIAL SNAPSHOT"}</p><p className="mt-2 text-xs leading-6 text-warning">{reference.note}</p></article>)}</section>
    <section className="mt-7 border-t border-border pt-5"><h3 className="text-lg">Manual PDF · separate, unverified</h3><p className="mt-3 text-xs leading-6 text-warning">Blank or synthetic PDF only, 4 MiB maximum. Real private case uploads remain blocked. No Desktop write, cloud upload, embedded-PDF rendering, completed affidavit or signature generation.</p><label className="mt-4 flex items-start gap-3 text-xs leading-5"><input type="checkbox" className="mt-1 accent-gold" aria-label="Blank or synthetic manual PDF confirmation" checked={confirmed} onChange={(e) => { manualRevision.current++; setConfirmed(e.target.checked); if (!e.target.checked) setManual(null); }} />I confirm this PDF is blank or fictional, with no real case records.</label>
      <input ref={fileInput} type="file" accept=".pdf,application/pdf" aria-label="Manual blank or synthetic PDF" className="hidden" onChange={(e) => void manualIntake(e.target.files?.[0])} />
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs text-muted-foreground">Document classification<select aria-label="Manual document classification" className="exchange-select mt-2 w-full" value={documentKind} onChange={(e) => { manualRevision.current++; setDocumentKind(e.target.value as ManualDocumentKind); }}><option value="blank-unverified">Blank form · unverified manual copy</option><option value="synthetic-completed">Fictional completed document · session only</option></select></label>{documentKind === "synthetic-completed" && <label className="text-xs text-muted-foreground">Fictional case ID<input aria-label="Fictional manual case ID" maxLength={70} className="exchange-select mt-2 w-full" value={caseId} onChange={(e) => { manualRevision.current++; setCaseId(e.target.value); }} /></label>}</div>
      <label className="mt-4 flex items-start gap-3 text-xs leading-5"><input aria-label="Confirm actual document jurisdiction" type="checkbox" className="mt-1 accent-gold" disabled={librarySelectionMissing(selection).length > 0} checked={jurisdictionConfirmed} onChange={(e) => { manualRevision.current++; setConfirmedSelection(e.target.checked ? JSON.stringify(selection) : ""); }} />I confirm the state, county, exact court and filing type above apply to this document, regardless of my location.</label>
      <p className="mt-3 text-xs leading-6 text-warning">Real private completed uploads: unavailable until user/case-scoped access is implemented. Manual copies never enter the shared official blank-form library.</p>
      <div className="mt-4 flex flex-wrap gap-3"><Button variant="ghost" disabled={!confirmed || !jurisdictionConfirmed} onClick={() => fileInput.current?.click()}><Upload />Choose manual PDF</Button>{manual && <><Button variant="ghost" onClick={() => download(manual.original, manual.metadata.name)}><Download />Preserved original</Button><Button variant="ghost" onClick={() => { manualRevision.current++; setManual(null); setNotice("Manual session copy removed. Original file unchanged."); }}>Remove session copy</Button></>}</div>
      {manual && <div className="mt-4 text-[11px] leading-6 text-muted-foreground"><p className="break-all">{manual.metadata.name} · {manual.metadata.bytes} bytes · MANUAL / UNVERIFIED · received {manual.metadata.receivedAt}<br />SHA-256 {manual.metadata.sha256}</p><p aria-label="Manual document classified folder" className="mt-2 break-words">Confirmed classification: {manual.classification.segments.join(" › ")} › {manual.classification.kind === "synthetic-completed" ? `Separate fictional case ${manual.classification.caseId}` : "Separate unverified manual copy"}</p><p className="text-warning">Session-only label, not private account access or an OS folder. Shared official library: NOT ADDED.</p></div>}
      {notice && <p role="status" className="mt-3 text-xs leading-6 text-warning">{notice}</p>}
    </section>
  </section>;
}