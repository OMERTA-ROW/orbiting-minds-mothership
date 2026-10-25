import { legalSources } from "@/data/omni-legal-sources";
import { type FormSelection } from "@/lib/omni-legal-forms";

export const LEGAL_FORMS_LIBRARY_NAME = "Legal Forms";
export const FEDERAL_COURT = "United States District Court, Central District of California";
export type LibrarySelection = FormSelection & { courtLevel: "state" | "federal" };
export type ManualDocumentKind = "blank-unverified" | "synthetic-completed";
export type ProceduralReference = { id: string; title: string; url: string; version: string; checkedAt: string; note: string };

const federalReferences: ProceduralReference[] = [
  { id: "cacd-local-rules", title: "Central District of California · Local Civil Rules", url: "https://www.cacd.uscourts.gov/court-procedures/local-rules", version: "Chapter I last amended June 1, 2026 (official page)", checkedAt: "2026-10-25", note: "Court-specific reference. Later amendments, standing orders and applicability need review." },
  { id: "cacd-civil-forms", title: "Central District of California · Civil Forms", url: "https://www.cacd.uscourts.gov/court-procedures/forms/civil%20forms", version: "Per-form revisions on official index; some entries replaced", checkedAt: "2026-10-25", note: "Official-site handoff only. Individual PDF intake and current/applicable forms not verified; no complete coverage." },
  { id: "national-civil-forms", title: "U.S. Courts · National Civil Forms", url: "https://www.uscourts.gov/forms-rules/forms/civil-forms", version: "Per-form revisions; no single catalog version", checkedAt: "2026-10-25", note: "National discovery index, not a replacement for selected court local forms. PDF intake pending." },
  ...legalSources.filter((s) => s.id === "frcp-5.2" || s.id === "local-rules").map((s) => ({ id: s.id, title: s.id === "frcp-5.2" ? "Federal Rules of Civil Procedure · includes Rule 5.2" : s.title, url: s.url, version: s.effectiveNote, checkedAt: s.retrievedAt, note: "Dated official reference only; no legal applicability or deadline determination." })),
];

export function librarySelectionMissing(selection: LibrarySelection) {
  return [!selection.state && "State", !selection.county && "County / organizational context", !selection.court && "Exact court", !selection.filingType && "Case / filing type"].filter((v): v is string => Boolean(v));
}

export function legalLibrarySegments(selection: LibrarySelection) {
  return [LEGAL_FORMS_LIBRARY_NAME, selection.state === "CA" ? "California" : selection.state ? "Other state · unverified" : "State not selected", selection.county || "County not selected", selection.court || "Court not selected", ({ "small-claims-claim": "Small claims · plaintiff claim", "declaration-review": "General declaration · review", affidavit: "Affidavit · unverified", "federal-civil": "Federal civil · review", other: "Other filing · unverified" } as Record<string, string>)[selection.filingType] ?? "Filing type not selected"];
}

export function selectedProceduralReferences(selection: LibrarySelection) {
  if (librarySelectionMissing(selection).length) return [];
  if (selection.courtLevel === "federal" && selection.state === "CA" && selection.court === FEDERAL_COURT && selection.filingType === "federal-civil") return federalReferences;
  if (selection.courtLevel === "state" && selection.state === "CA" && ["Los Angeles", "San Francisco"].includes(selection.county) && selection.court === `Superior Court of California, County of ${selection.county}` && selection.filingType === "small-claims-claim") return [{ id: "ca-small-claims-guidance", title: "California Courts · Small claims starting forms", url: "https://selfhelp.courts.ca.gov/small-claims/start-case/forms/fill-out-forms", version: "Official guidance page; no published single version", checkedAt: "2026-10-25", note: "Statewide guidance; local court packet, eligibility and venue not verified." }];
  return [];
}

export function referenceCheckState(checkedAt: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return "dated-snapshot" as const;
  return checkedAt === today ? "checked-on-date" as const : "recheck-required" as const;
}

/** Confirmation binds to the whole chosen jurisdiction, never a location hint. */
export function manualClassification(selection: LibrarySelection, confirmedSelection: string, kind: ManualDocumentKind, syntheticCaseId: string) {
  if (librarySelectionMissing(selection).length || confirmedSelection !== JSON.stringify(selection)) throw new Error("Confirm the actual state, county, court and filing type for this document.");
  if (!["blank-unverified", "synthetic-completed"].includes(kind)) throw new Error("Real private completed uploads remain blocked.");
  if (kind === "synthetic-completed" && !/^SYNTHETIC-[A-Za-z0-9-]{1,60}$/.test(syntheticCaseId)) throw new Error("Use a fictional SYNTHETIC- case ID; real case intake is unavailable.");
  return { selection: { courtLevel: selection.courtLevel, state: selection.state, county: selection.county, court: selection.court, filingType: selection.filingType }, segments: legalLibrarySegments(selection), kind, caseId: kind === "synthetic-completed" ? syntheticCaseId : null, scope: "session-only-unverified" as const, sharedBlankLibrary: false as const, locationDeterminesCourt: false as const };
}