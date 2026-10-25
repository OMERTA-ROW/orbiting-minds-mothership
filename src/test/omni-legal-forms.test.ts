import { describe, expect, it, vi } from "vitest";
import { BLANK_FORM_MAX_BYTES, inspectManualLegalPdf, officialBlankForms, resolveBlankFormCatalog } from "@/lib/omni-legal-forms";
import { FORM_MAX_BYTES, fetchOfficialBlankPdf } from "@/lib/omni-legal-form-fetch.server";

const selected = { state: "CA", county: "Los Angeles", court: "Superior Court of California, County of Los Angeles", filingType: "small-claims-claim" };
const fixture = new TextEncoder().encode("%PDF-1.4\nfictional blank fixture\n%%EOF");
const url = "https://courts.ca.gov/fixture.pdf";
const response = (body: BodyInit = fixture) => new Response(body, { headers: { "content-type": "application/pdf" } });

describe("Omni Legal verified public blank form selection", () => {
  it("requires state county court and filing type before retrieval", () => {
    const result = resolveBlankFormCatalog({ state: "", county: "", court: "", filingType: "" });
    expect(result.missing).toEqual(["State", "County", "Court", "Filing / case type"]);
    expect(result.forms).toEqual([]);
  });
  it("selects the two verified statewide small claims blanks without manufacturing an affidavit", () => {
    const result = resolveBlankFormCatalog(selected);
    expect(result.status).toBe("available"); expect(result.forms.map((f) => f.id)).toEqual(["SC-100", "SC-100A"]);
    expect(result.forms[0]?.revisionDate).toBe("2026-01-01");
    expect(result.forms[1]?.revisionDate).toBe("2017-01-01");
    expect(result.missing).toContain("Local court additions / instructions not verified");
  });
  it("rejects mismatched county/court and unsupported states without falling back to federal or neighboring court forms", () => {
    expect(resolveBlankFormCatalog({ ...selected, court: "Superior Court of California, County of San Francisco" }).forms).toEqual([]);
    expect(resolveBlankFormCatalog({ ...selected, state: "NY" }).status).toBe("unavailable");
    expect(resolveBlankFormCatalog({ ...selected, county: "other", court: "other" }).forms).toEqual([]);
  });
  it("provides verified declaration only for separate review, not an affidavit or a guaranteed filing requirement", () => {
    expect(resolveBlankFormCatalog({ ...selected, filingType: "declaration-review" }).forms.map((f) => f.id)).toEqual(["MC-030"]);
    expect(resolveBlankFormCatalog({ ...selected, filingType: "affidavit" }).status).toBe("unavailable");
    expect(officialBlankForms.find((f) => f.id === "MC-030")?.revisionDate).toBe("2006-01-01");
  });
  it("bounds catalog provenance to verified HTTPS court hosts and concrete fingerprints", () => {
    expect(officialBlankForms).toHaveLength(3);
    for (const f of officialBlankForms) { expect(new URL(f.pdfUrl).host).toBe("courts.ca.gov"); expect(f.sha256).toMatch(/^[a-f0-9]{64}$/); expect(f.verifiedAt).toBe("2026-10-25"); }
  });
});

describe("bounded official PDF retrieval", () => {
  it("preserves bytes and computes fingerprint/retrieval date with no private-data request", async () => {
    const fetcher = vi.fn(async () => response()) as unknown as typeof fetch;
    const result = await fetchOfficialBlankPdf(url, [url], fetcher);
    expect(atob(result.base64)).toBe(new TextDecoder().decode(fixture)); expect(result.bytes).toBe(fixture.length);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/); expect(Number.isNaN(Date.parse(result.retrievedAt))).toBe(false);
    expect(fetcher).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: "manual", headers: { Accept: "application/pdf" } }));
  });
  it("refuses caller URLs outside catalog before network access", async () => {
    const fetcher = vi.fn();
    await expect(fetchOfficialBlankPdf("https://attacker.example/private", [url], fetcher)).rejects.toThrow("allowlisted");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not follow redirects or accept an HTML login/error page as a form", async () => {
    await expect(fetchOfficialBlankPdf(url, [url], async () => new Response(null, { status: 302, headers: { location: "https://attacker.example/" } }))).rejects.toThrow("HTTP 302");
    await expect(fetchOfficialBlankPdf(url, [url], async () => new Response("login", { headers: { "content-type": "text/html" } }))).rejects.toThrow("did not return a PDF");
    await expect(fetchOfficialBlankPdf(url, [url], async () => response("HTML"))).rejects.toThrow("signature");
  });
  it("enforces the 4 MiB declared and streamed limit even without content-length", async () => {
    expect(FORM_MAX_BYTES).toBe(4 * 1024 * 1024);
    await expect(fetchOfficialBlankPdf(url, [url], async () => new Response(fixture, { headers: { "content-type": "application/pdf", "content-length": String(FORM_MAX_BYTES + 1) } }))).rejects.toThrow("limit");
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(FORM_MAX_BYTES + 1)); c.close(); } });
    await expect(fetchOfficialBlankPdf(url, [url], async () => response(stream))).rejects.toThrow("limit");
  });
});

describe("manual synthetic PDF separate from official retrieval", () => {
  it("requires explicit blank/synthetic declaration and refuses invalid or unsafe inputs", async () => {
    await expect(inspectManualLegalPdf("case.pdf", fixture, false)).rejects.toThrow("Real case intake");
    await expect(inspectManualLegalPdf("../case.pdf", fixture, true)).rejects.toThrow("filename");
    await expect(inspectManualLegalPdf("case.pdf", new TextEncoder().encode("HTML"), true)).rejects.toThrow("signature");
    await expect(inspectManualLegalPdf("case.pdf", new Uint8Array(BLANK_FORM_MAX_BYTES + 1), true)).rejects.toThrow("4 MiB");
  });
  it("keeps bytes unchanged and labels manual provenance without affidavit completion", async () => {
    const original = fixture.slice();
    const metadata = await inspectManualLegalPdf("fictional.pdf", fixture, true);
    expect(fixture).toEqual(original); expect(metadata.provenance).toBe("manual-unverified"); expect(metadata.completedAffidavit).toBe(false);
    const fetched = await fetchOfficialBlankPdf(url, [url], async () => response());
    expect(metadata.sha256).toBe(fetched.sha256);
  });
});