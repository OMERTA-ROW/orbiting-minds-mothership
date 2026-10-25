import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Download, FileText, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BLANK_FORM_MAX_BYTES, inspectManualLegalPdf, officialCourtDirectory, officialFormDirectory, resolveBlankFormCatalog, type FormSelection } from "@/lib/omni-legal-forms";
import { retrieveOfficialBlankForm } from "@/lib/omni-legal-forms.functions";

type Retrieved = Awaited<ReturnType<typeof retrieveOfficialBlankForm>>;
type Intake = { id: string; result: Retrieved | null; loading: boolean };

export function OmniLegalForms() {
  const [selection, setSelection] = useState<FormSelection>({ state: "", county: "", court: "", filingType: "" });
  const [intake, setIntake] = useState<Intake[]>([]);
  const [retry, setRetry] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [manual, setManual] = useState<{ metadata: Awaited<ReturnType<typeof inspectManualLegalPdf>>; original: Uint8Array } | null>(null);
  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  const manualRevision = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const fetchForm = useServerFn(retrieveOfficialBlankForm);
  const fetchRef = useRef(fetchForm);
  fetchRef.current = fetchForm;
  const catalog = resolveBlankFormCatalog(selection);

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
  }, [selection.state, selection.county, selection.court, selection.filingType, retry]);

  function choose(patch: Partial<FormSelection>) {
    revision.current++; setIntake([]); setSelection((old) => ({ ...old, ...patch }));
  }
  function download(bytes: Uint8Array, name: string) {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function manualIntake(file: File | undefined) {
    if (!file) return;
    const token = ++manualRevision.current;
    setNotice("");
    try {
      if (file.size > BLANK_FORM_MAX_BYTES) throw new Error("PDF must be at most 4 MiB.");
      const original = new Uint8Array(await file.arrayBuffer());
      const metadata = await inspectManualLegalPdf(file.name, original, confirmed);
      if (manualRevision.current !== token) return;
      setManual({ metadata, original }); setNotice("Unverified manual PDF retained in this session only. No upload, parsing, official-form claim or completion.");
    } catch (error) { if (manualRevision.current === token) setNotice(error instanceof Error ? error.message : "Manual PDF intake failed."); }
    finally { if (fileInput.current) fileInput.current.value = ""; }
  }

  return <section aria-label="Official blank forms" className="border-b border-border py-7">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-3 text-2xl"><FileText className="size-5 text-gold" />Official blank forms</h2><p className="mt-3 max-w-3xl text-xs leading-6 text-muted-foreground">California Judicial Council · limited verified catalog · public blank PDFs only. Local additions and court filing connections pending.</p></div><Button variant="ghost" size="sm" disabled={catalog.status !== "available" || intake.some((r) => r.loading)} onClick={() => setRetry((n) => n + 1)}><RefreshCw />Retry retrieval</Button></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs text-muted-foreground">Catalog state<select aria-label="Catalog state" className="exchange-select mt-2 w-full" value={selection.state} onChange={(e) => choose({ state: e.target.value, county: "", court: "" })}><option value="">Select state</option><option value="CA">California</option><option value="other">Other state · catalog unavailable</option></select></label>
      <label className="text-xs text-muted-foreground">Catalog county<select aria-label="Catalog county" disabled={!selection.state} className="exchange-select mt-2 w-full" value={selection.county} onChange={(e) => choose({ county: e.target.value, court: "" })}><option value="">Select county</option>{selection.state === "CA" && <><option value="Los Angeles">Los Angeles</option><option value="San Francisco">San Francisco</option></>}<option value="other">Other county · unavailable</option></select></label>
      <label className="text-xs text-muted-foreground">Catalog court<select aria-label="Catalog court" disabled={!selection.county} className="exchange-select mt-2 w-full" value={selection.court} onChange={(e) => choose({ court: e.target.value })}><option value="">Select court</option>{selection.state === "CA" && selection.county !== "other" && selection.county && <option value={`Superior Court of California, County of ${selection.county}`}>Superior Court · {selection.county}</option>}<option value="other">Other court · unavailable</option></select></label>
      <label className="text-xs text-muted-foreground">Filing / case type<select aria-label="Filing or case type" className="exchange-select mt-2 w-full" value={selection.filingType} onChange={(e) => choose({ filingType: e.target.value })}><option value="">Select filing type</option><option value="small-claims-claim">Small claims · plaintiff claim</option><option value="declaration-review">General declaration · review only</option><option value="affidavit">Affidavit · no verified catalog</option><option value="other">Other filing · unavailable</option></select></label>
    </div>
    <p role="status" className="mt-4 text-xs leading-6 text-warning">{catalog.note}</p>
    <ul aria-label="Form intake missing information" className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">{catalog.missing.map((m) => <li key={m}>— {m}</li>)}</ul>
    {catalog.forms.map((form) => {
      const row = intake.find((r) => r.id === form.id);
      const pdf = row?.result?.pdf;
      return <article key={form.id} className="mt-5 min-w-0 border-t border-border pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-sm text-gold-light">{form.id} · {form.title}</h3><p className="mt-2 text-[11px] leading-5 text-muted-foreground">Revision {form.revisionDate} · catalog verified {form.verifiedAt} · {form.kind}</p></div>{pdf && <Button size="sm" variant="signal" onClick={() => download(Uint8Array.from(atob(pdf.base64), (c) => c.charCodeAt(0)), `${form.id}-official-blank.pdf`)}><Download />Download {form.id}</Button>}</div>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">{form.note}</p>
        <div className="mt-3 flex flex-wrap gap-4"><a className="inline-flex items-center gap-1 break-all text-xs text-gold underline" href={form.sourceUrl} target="_blank" rel="noreferrer">Official catalog source<ArrowUpRight className="size-3 shrink-0" /></a><a className="break-all text-xs text-gold underline" href={form.pdfUrl} target="_blank" rel="noreferrer">Official PDF URL<ArrowUpRight className="ml-1 inline size-3" /></a></div>
        <p role="status" className="mt-3 break-words text-[11px] leading-6 text-warning">{pdf ? `RETRIEVED · ${pdf.bytes} bytes · ${pdf.retrievedAt}` : row?.loading ? "Retrieving official blank PDF…" : row?.result?.error ?? "Retrieval pending"}</p>
        {pdf && <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">SHA-256 {pdf.sha256} · unchanged verified source version · not registration or court receipt</p>}
      </article>;
    })}
    <div className="mt-5 flex flex-wrap gap-5"><a href={officialFormDirectory} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gold underline">Official California forms<ArrowUpRight className="size-3" /></a><a href={officialCourtDirectory} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gold underline">Official court directory<ArrowUpRight className="size-3" /></a></div>
    <section className="mt-7 border-t border-border pt-5"><h3 className="text-lg">Manual PDF · separate, unverified</h3><p className="mt-3 text-xs leading-6 text-warning">Blank or synthetic PDF only, 4 MiB maximum. Real private case uploads remain blocked. No Desktop write, cloud upload, embedded-PDF rendering, completed affidavit or signature generation.</p><label className="mt-4 flex items-start gap-3 text-xs leading-5"><input type="checkbox" className="mt-1 accent-gold" aria-label="Blank or synthetic manual PDF confirmation" checked={confirmed} onChange={(e) => { manualRevision.current++; setConfirmed(e.target.checked); if (!e.target.checked) setManual(null); }} />I confirm this PDF is blank or fictional, with no real case records.</label>
      <input ref={fileInput} type="file" accept=".pdf,application/pdf" aria-label="Manual blank or synthetic PDF" className="hidden" onChange={(e) => void manualIntake(e.target.files?.[0])} />
      <div className="mt-4 flex flex-wrap gap-3"><Button variant="ghost" disabled={!confirmed} onClick={() => fileInput.current?.click()}><Upload />Choose manual PDF</Button>{manual && <><Button variant="ghost" onClick={() => download(manual.original, manual.metadata.name)}><Download />Preserved original</Button><Button variant="ghost" onClick={() => { manualRevision.current++; setManual(null); setNotice("Manual session copy removed. Original file unchanged."); }}>Remove session copy</Button></>}</div>
      {manual && <p className="mt-4 break-all text-[11px] leading-6 text-muted-foreground">{manual.metadata.name} · {manual.metadata.bytes} bytes · MANUAL / UNVERIFIED · received {manual.metadata.receivedAt}<br />SHA-256 {manual.metadata.sha256}</p>}
      {notice && <p role="status" className="mt-3 text-xs leading-6 text-warning">{notice}</p>}
    </section>
  </section>;
}