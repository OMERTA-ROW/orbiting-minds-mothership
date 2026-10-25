import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { strFromU8, unzipSync } from "fflate";
import { effectiveSources, legalSources } from "@/data/omni-legal-sources";
import { appendLegalAudit, initialRequirementLinks, missingInformation, preparationState, redactLegalText, requestFilingTransition, reviewRequirement, sampleLegalDraft, sourceChecklist } from "@/lib/omni-legal";
import { prepareLegalPacket } from "@/lib/omni-legal-export";

describe("Omni Legal preparation boundary", () => {
  it("requires exact jurisdiction/court information and privacy review", () => {
    const draft = sampleLegalDraft();
    expect(preparationState(draft)).toBe("draft");
    expect(missingInformation(draft)).toContain("Exact court");
    expect(missingInformation(draft)).toContain("Human privacy review");
    expect(preparationState({ ...draft, court: "Fictional federal district", caseNumber: "SYNTHETIC-001", privacyReviewed: true })).toBe("ready-for-review");
  });
  it("does not apply federal rules to state or local courts", () => {
    for (const jurisdiction of ["state", "local"] as const) {
      const draft = { ...sampleLegalDraft(), jurisdiction };
      expect(sourceChecklist(draft).map((c) => c.sourceId)).toEqual([null, null, null, null, null, null]);
      expect(missingInformation(draft)).toContain("State/local region");
    }
  });
  it.each(["submitted", "accepted", "rejected"] as const)("cannot fabricate %s from preparation", (requested) => {
    expect(requestFilingTransition("ready-for-review", requested)).toMatchObject({ state: "ready-for-review", allowed: false });
  });
  it("redacts supported identifiers without changing originals", () => {
    const original = "Synthetic SSN 123-45-6789; born 2000-01-02; account: 123456789; token=fixture";
    expect(redactLegalText(original)).toEqual({ text: "Synthetic SSN [REDACTED]; born [REDACTED]; [REDACTED]; [REDACTED]", count: 4 });
    expect(original).toContain("123-45-6789");
    expect(redactLegalText("Fictional Minor Full Name").count).toBe(0); // Documented incomplete detection, not privacy certification.
  });
  it("keeps deadlines and responsible signature unresolved even when basic fields exist", () => {
    const checks = sourceChecklist({ ...sampleLegalDraft(), court: "Fictional court", caseNumber: "SYNTHETIC-1", privacyReviewed: true });
    expect(checks.find((c) => c.id === "deadlines")).toMatchObject({ satisfied: false, sourceId: null });
    expect(checks.find((c) => c.id === "signature")).toMatchObject({ satisfied: false, sourceId: "frcp-11" });
    expect(checks.find((c) => c.id === "local")?.satisfied).toBe(false);
  });
  it("separates proposals from enacted statutes/effective rules", () => {
    const source = legalSources[0];
    if (!source) throw new Error("Missing source fixture");
    expect(effectiveSources([source, { ...source, id: "proposal", status: "proposal" }]).map((s) => s.id)).toEqual([source.id]);
  });
  it("flags unresolved software applicability and unverified effective date", () => {
    const link = initialRequirementLinks()[0];
    if (!link) throw new Error("Missing traceability fixture");
    const review = reviewRequirement(link, "state");
    expect(review.problems).toContain("Federal rule applicability to state/local software is unresolved");
    expect(review.problems).toContain("Rule-specific effective date needs verification");
    expect(review.problems).toContain("Applicability not reviewed by a responsible human");
    expect(reviewRequirement({ ...link, sourceId: "unknown", codePath: "", testPath: "" }, "federal").problems).toContain("Unknown official source");
  });
  it("audit stores bounded fixed metadata, never synthetic contents/credentials", () => {
    const draft = { ...sampleLegalDraft(), body: "token=private-fixture; synthetic case detail" };
    let events = appendLegalAudit([], "draft-edited", draft, "2026-10-25T18:00:00Z");
    expect(events[0]).toEqual({ sequence: 1, at: "2026-10-25T18:00:00Z", action: "draft-edited", jurisdiction: "federal", state: "draft" });
    for (let i = 0; i < 110; i++) events = appendLegalAudit(events, "draft-edited", draft);
    expect(events).toHaveLength(100);
    expect(JSON.stringify(events)).not.toContain("private-fixture");
  });
  it("exports an actual PDF and byte-identical synthetic originals/exhibits with missing flags", async () => {
    const draft = sampleLegalDraft();
    const body = draft.body;
    const packet = await prepareLegalPacket(draft, initialRequirementLinks(), []);
    const pdf = await PDFDocument.load(packet.pdf);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(4);
    const files = unzipSync(packet.zip);
    expect(strFromU8(files["Legal/Originals/synthetic-draft.txt"] ?? new Uint8Array())).toBe(body);
    expect(strFromU8(files["Legal/Originals/exhibit-A.txt"] ?? new Uint8Array())).toBe(draft.exhibits[0]?.original);
    const review = JSON.parse(strFromU8(files["Legal/Review/checklist.json"] ?? new Uint8Array()));
    expect(review).toMatchObject({ state: "draft", deadlines: "UNVERIFIED", transmission: "UNAVAILABLE" });
    expect(review.missing).toContain("Exact court");
    expect(review.sources.find((s: { id: string }) => s.id === "frcp-5.2").retrievedAt).toBe("2026-10-25");
    expect(draft.body).toBe(body);
  });
  it("state/local export does not invent applicable sources", async () => {
    const packet = await prepareLegalPacket({ ...sampleLegalDraft(), jurisdiction: "local" }, [], []);
    const files = unzipSync(packet.zip);
    const review = JSON.parse(strFromU8(files["Legal/Review/checklist.json"] ?? new Uint8Array()));
    expect(review.sources).toEqual([]);
  });
  it("rejects oversized synthetic packets without producing exports", async () => {
    await expect(prepareLegalPacket({ ...sampleLegalDraft(), body: "x".repeat(20001) }, [], [])).rejects.toThrow("limits");
  });
});