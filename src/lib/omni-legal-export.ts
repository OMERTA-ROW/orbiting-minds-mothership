import { PDFDocument, StandardFonts } from "pdf-lib";
import { zipSync, strToU8 } from "fflate";
import { legalSources } from "@/data/omni-legal-sources";
import { missingInformation, preparationState, redactLegalText, sourceChecklist, type LegalAuditEvent, type LegalDraft, type RequirementLink } from "@/lib/omni-legal";

/** Browser-safe bounded PDF generation; no document parser, network or server files. */
export async function prepareLegalPacket(draft: LegalDraft, links: RequirementLink[], audit: LegalAuditEvent[]) {
  if (draft.body.length > 20000 || draft.exhibits.length > 8 || draft.exhibits.some((e) => e.original.length > 20000)) throw new Error("Synthetic packet exceeds preparation limits.");
  const ids = new Set<string>();
  for (const exhibit of draft.exhibits) {
    if (!/^[A-Z]{1,2}$/.test(exhibit.id) || ids.has(exhibit.id)) throw new Error("Invalid or duplicate exhibit identifier.");
    ids.add(exhibit.id);
  }
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const ascii = (text: string) => text.replace(/[^\x20-\x7e\n]/g, "?");
  let totalRows = 0;
  function addText(text: string) {
    const rows = ascii(text).split("\n").flatMap((line) => line.match(/.{1,86}/g) ?? [""]);
    totalRows += rows.length;
    if (totalRows > 1200) throw new Error("Synthetic packet exceeds line/page limits.");
    let page = pdf.addPage([612, 792]);
    let y = 730;
    for (const row of rows) {
      if (y < 60) { page = pdf.addPage([612, 792]); y = 730; }
      page.drawText(row, { x: 48, y, size: 10, font }); y -= 15;
    }
  }
  const redactedBody = redactLegalText(draft.body);
  const safe = (text: string) => redactLegalText(text).text;
  addText(`OMNI LEGAL - SYNTHETIC / NOT FOR FILING\n${preparationState(draft).toUpperCase()} - HUMAN REVIEW REQUIRED\n\n${safe(draft.court || "[EXACT COURT MISSING]")}\nJurisdiction: ${draft.jurisdiction} ${safe(draft.region)}\nCase/file: ${safe(draft.caseNumber || "[MISSING / NEW CASE HANDLING UNREVIEWED]")}\n${safe(draft.partyA)} v. ${safe(draft.partyB)}\n${safe(draft.documentTitle)}\n\n${redactedBody.text}\n\nNOT SIGNED. No transmission, service or legal certification.\nMissing: ${missingInformation(draft).join("; ") || "No basic fields missing; local rules and legal review still unresolved."}`);
  for (const exhibit of draft.exhibits) addText(`OMNI LEGAL - SYNTHETIC / NOT FOR FILING\nEXHIBIT ${exhibit.id}: ${safe(exhibit.title)}\nRedacted preparation copy - original preserved separately\n\n${safe(exhibit.original)}`);
  addText(`PREPARATION CHECKLIST - NOT LEGAL ADVICE\nDeadlines UNVERIFIED. Court integration UNAVAILABLE.\n\n${sourceChecklist(draft).map((c) => `${c.satisfied ? "BASIC FIELD PRESENT" : "UNRESOLVED"}: ${c.label}\n${c.note}\nSource: ${c.sourceId ?? "No verified applicable source"}`).join("\n\n")}\n\nOFFICIAL SOURCE SNAPSHOTS - NOT LIVE RESEARCH\n${(draft.jurisdiction === "federal" ? legalSources : []).map((s) => `${s.title}\n${s.url}\nJurisdiction: ${s.jurisdiction}\nRetrieved: ${s.retrievedAt}; effective: ${s.effectiveDate ?? "UNVERIFIED"}\n${s.effectiveNote}\nStatus: ${s.status}`).join("\n\n")}\n\n${draft.jurisdiction !== "federal" ? "State/local official sources unavailable. Federal rules not applied." : "Verify freshness and local rules before any real use."}`);
  const pdfBytes = await pdf.save();
  const entries: Record<string, Uint8Array> = {
    "Legal/Drafts/synthetic-packet.pdf": pdfBytes,
    "Legal/Originals/synthetic-draft.txt": strToU8(draft.body),
    "Legal/Review/checklist.json": strToU8(JSON.stringify({ state: preparationState(draft), missing: missingInformation(draft), checklist: sourceChecklist(draft), sources: draft.jurisdiction === "federal" ? legalSources : [], deadlines: "UNVERIFIED", transmission: "UNAVAILABLE" }, null, 2)),
    "Legal/Review/software-requirements.json": strToU8(JSON.stringify({ links, disclaimer: "Human-entered references, not legal compliance or executed-test evidence." }, null, 2)),
    "Legal/Audit/session-metadata.json": strToU8(JSON.stringify(audit, null, 2)),
    "README.txt": strToU8("SYNTHETIC ONLY. NOT FOR FILING. Original synthetic texts are unredacted in Originals. PDF is a redacted derivative. Pattern redaction is incomplete; human review is required. No signatures, service, court receipt, deadline verification or private case security. Source links are dated snapshots, not live research. Non-ASCII text is replaced by ? in this basic PDF. No PDF/A or court format validation.\n"),
  };
  for (const exhibit of draft.exhibits) entries[`Legal/Originals/exhibit-${exhibit.id}.txt`] = strToU8(exhibit.original);
  return { pdf: pdfBytes, zip: zipSync(entries), redactions: redactedBody.count };
}