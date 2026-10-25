import { describe, expect, it } from "vitest";
import { FEDERAL_COURT, LEGAL_FORMS_LIBRARY_NAME, legalLibrarySegments, manualClassification, referenceCheckState, selectedProceduralReferences, type LibrarySelection } from "@/lib/omni-legal-library";
import { resolveBlankFormCatalog } from "@/lib/omni-legal-forms";

const state: LibrarySelection = { courtLevel: "state", state: "CA", county: "Los Angeles", court: "Superior Court of California, County of Los Angeles", filingType: "small-claims-claim" };
const federal: LibrarySelection = { ...state, courtLevel: "federal", court: FEDERAL_COURT, filingType: "federal-civil" };

describe("Legal Forms confirmed-jurisdiction library", () => {
  it("uses the exact name and state > county > court > filing hierarchy", () => {
    expect(LEGAL_FORMS_LIBRARY_NAME).toBe("Legal Forms");
    expect(legalLibrarySegments(state)).toEqual(["Legal Forms", "California", "Los Angeles", state.court, "Small claims · plaintiff claim"]);
    expect(legalLibrarySegments(federal)).toEqual(["Legal Forms", "California", "Los Angeles", FEDERAL_COURT, "Federal civil · review"]);
  });
  it("requires actual upload jurisdiction confirmation rather than selected folders alone", () => {
    expect(() => manualClassification(state, "", "blank-unverified", "")).toThrow("Confirm the actual");
    expect(() => manualClassification({ ...state, court: "" }, JSON.stringify({ ...state, court: "" }), "blank-unverified", "")).toThrow("Confirm the actual");
  });
  it("invalidates confirmation when county court or filing type changes", () => {
    for (const changed of [{ ...state, county: "San Francisco" }, { ...state, court: FEDERAL_COURT }, { ...state, filingType: "affidavit" }]) expect(() => manualClassification(changed, JSON.stringify(state), "blank-unverified", "")).toThrow();
  });
  it("uses confirmed case jurisdiction even when origin/residence/location are elsewhere", () => {
    const outOfLocation = { ...state, residence: "New York", gps: [40, -74], uploadOrigin: "New York", ipLocation: "New York" };
    const record = manualClassification(outOfLocation, JSON.stringify(outOfLocation), "blank-unverified", "");
    expect(record.segments[1]).toBe("California"); expect(record.segments[2]).toBe("Los Angeles"); expect(record.locationDeterminesCourt).toBe(false);
    expect(record.selection).not.toHaveProperty("gps"); expect(record.selection).not.toHaveProperty("uploadOrigin");
  });
  it("never promotes manual blank or fictional completed copies into shared official blanks", () => {
    const blank = manualClassification(state, JSON.stringify(state), "blank-unverified", "");
    const completed = manualClassification(state, JSON.stringify(state), "synthetic-completed", "SYNTHETIC-TEST");
    expect(blank.sharedBlankLibrary).toBe(false); expect(completed.sharedBlankLibrary).toBe(false);
    expect(completed.scope).toBe("session-only-unverified"); expect(completed.caseId).toBe("SYNTHETIC-TEST");
    expect(() => manualClassification(state, JSON.stringify(state), "synthetic-completed", "REAL-123")).toThrow("fictional");
  });
  it("keeps relevant federal references separate from state court sources and PDF intake", () => {
    const references = selectedProceduralReferences(federal);
    expect(references.map((r) => r.id)).toContain("cacd-local-rules");
    expect(references.map((r) => r.id)).toContain("national-civil-forms");
    expect(references.find((r) => r.id === "cacd-local-rules")?.version).toBe("Chapter I last amended June 1, 2026 (official page)");
    expect(selectedProceduralReferences(state).map((r) => r.id)).toEqual(["ca-small-claims-guidance"]);
    expect(resolveBlankFormCatalog(federal).forms).toEqual([]);
  });
  it("does not choose a federal court from county or apply a neighboring court catalog", () => {
    expect(selectedProceduralReferences({ ...federal, court: "" })).toEqual([]);
    expect(selectedProceduralReferences({ ...federal, court: "Northern District of California" })).toEqual([]);
    expect(selectedProceduralReferences({ ...federal, filingType: "affidavit" })).toEqual([]);
    expect(selectedProceduralReferences({ ...state, court: "Other court" })).toEqual([]);
  });
  it("flags older or future-dated checks for review rather than silently treating all coverage as current", () => {
    expect(referenceCheckState("2026-10-25", "2026-10-25")).toBe("checked-on-date");
    expect(referenceCheckState("2026-10-25", "2026-10-26")).toBe("recheck-required");
    expect(referenceCheckState("2026-10-25", "2026-10-24")).toBe("recheck-required");
    expect(referenceCheckState("2026-10-25", "")).toBe("dated-snapshot");
  });
});