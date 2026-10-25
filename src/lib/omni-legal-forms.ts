export const BLANK_FORM_MAX_BYTES = 4 * 1024 * 1024;
export const officialFormDirectory = "https://courts.ca.gov/forms-rules/court-forms";
export const officialCourtDirectory = "https://courts.ca.gov/find-my-court";
export type FormSelection = { state: string; county: string; court: string; filingType: string };
export type OfficialBlankForm = { id: string; title: string; kind: "claim" | "attachment" | "declaration"; sourceUrl: string; pdfUrl: string; revisionDate: string; verifiedAt: string; sha256: string; note: string };
export const officialBlankForms: readonly OfficialBlankForm[] = [
  { id: "SC-100", title: "Plaintiff’s Claim and ORDER to Go to Small Claims Court", kind: "claim", sourceUrl: "https://selfhelp.courts.ca.gov/jcc-form/SC-100", pdfUrl: "https://courts.ca.gov/sites/default/files/courts/default/2024-11/sc100.pdf", revisionDate: "2026-01-01", verifiedAt: "2026-10-25", sha256: "ef3421b14ebf64dbf884566ff659b39776035ec5b6e6500be0af91e3cc15533c", note: "Statewide blank claim form. Venue, eligibility, local additions, fees and service remain for court/human review." },
  { id: "SC-100A", title: "Other Plaintiffs or Defendants", kind: "attachment", sourceUrl: "https://selfhelp.courts.ca.gov/jcc-form/SC-100A", pdfUrl: "https://courts.ca.gov/sites/default/files/courts/default/2024-11/sc100a.pdf", revisionDate: "2017-01-01", verifiedAt: "2026-10-25", sha256: "c7cd9667cfa0508f62a34d4bc5f18be32d1ed30ae3447b9130903968403e38b5", note: "Optional additional-party attachment only when needed; not an affidavit or automatically required." },
  { id: "MC-030", title: "Declaration", kind: "declaration", sourceUrl: "https://courts.ca.gov/forms-rules/court-forms", pdfUrl: "https://courts.ca.gov/sites/default/files/courts/default/2024-11/mc030.pdf", revisionDate: "2006-01-01", verifiedAt: "2026-10-25", sha256: "ed3f3ff115c7b6c5cfc6aa63939615f5dc1d7e44c31e4b7b5e7316a45ea2ff9a", note: "General declaration, not a notarized affidavit. Retrieve only for declaration review; do not assume it replaces a court-specific form." },
];

export function resolveBlankFormCatalog(selection: FormSelection) {
  const missing = [!selection.state && "State", !selection.county && "County", !selection.court && "Court", !selection.filingType && "Filing / case type"].filter((v): v is string => Boolean(v));
  if (missing.length) return { status: "selection-required" as const, forms: [] as OfficialBlankForm[], missing, note: "Select a catalog jurisdiction and filing type. No case details required." };
  const supported = selection.state === "CA" && ["Los Angeles", "San Francisco"].includes(selection.county) && selection.court === `Superior Court of California, County of ${selection.county}`;
  if (!supported || !["small-claims-claim", "declaration-review"].includes(selection.filingType)) return { status: "unavailable" as const, forms: [] as OfficialBlankForm[], missing: ["Verified official catalog for this exact selection", "Applicable local forms and instructions"], note: "Catalog unavailable. No automatic form retrieval or legal applicability determination; use an official-site handoff or a blank/synthetic manual PDF." };
  return { status: "available" as const, forms: officialBlankForms.filter((f) => selection.filingType === "small-claims-claim" ? f.id === "SC-100" || f.id === "SC-100A" : f.id === "MC-030"), missing: ["Local court additions / instructions not verified", "Venue, eligibility and form applicability require human review", "Case-specific fields, deadlines, signatures and any notarization remain unreviewed"], note: "Verified statewide Judicial Council blanks only. Selected county’s local catalog and filing integration remain pending; this is not a complete filing packet." };
}

export async function inspectManualLegalPdf(name: string, bytes: Uint8Array, syntheticConfirmed: boolean) {
  if (!syntheticConfirmed) throw new Error("Confirm blank or synthetic PDF only. Real case intake remains blocked.");
  if (!/\.pdf$/i.test(name) || name.length > 200 || /[\/\\\u0000-\u001f]/.test(name)) throw new Error("Select a plain PDF filename.");
  if (!bytes.length || bytes.length > BLANK_FORM_MAX_BYTES) throw new Error("PDF must be nonempty and at most 4 MiB.");
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("PDF signature missing.");
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { name, bytes: bytes.length, sha256, provenance: "manual-unverified" as const, receivedAt: new Date().toISOString(), completedAffidavit: false as const };
}