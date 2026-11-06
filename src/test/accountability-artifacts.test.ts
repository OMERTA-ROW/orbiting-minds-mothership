import { describe, it, expect } from "vitest";
import { compareAccountabilityArtifacts } from "@/lib/accountability-artifacts";
import { artifactDigest } from "@/lib/trusted-release";
import { accountabilitySample as sample } from "./accountability-fixtures";
describe("Incident supplied artifact comparison", () => {
  it("computes known SHA-256 for supplied sample text without verifying execution", async () => {
    const v = { ...sample(), baselineText: "abc", observedText: "abc", codeId: "" };
    const r = await compareAccountabilityArtifacts(v);
    expect(r.comparison.copyDigest).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(r).toMatchObject({
      status: "HASH MATCH / UNSIGNED DEMO",
      signatureVerified: false,
      executionVerified: false,
      rootCauseVerified: false,
    });
  });
  it("marks a changed copy modified even if supplied digests match their samples", async () => {
    const v = sample();
    v.baselineHash = await artifactDigest(v.baselineText);
    v.observedHash = await artifactDigest(v.observedText);
    expect(await compareAccountabilityArtifacts(v)).toMatchObject({
      status: "MODIFIED / UNVERIFIED",
      baselineMatches: true,
      observedMatches: true,
    });
  });
  it("marks observed digest mismatch unverified even when the sample texts are identical", async () => {
    const v = { ...sample(), observedText: sample().baselineText, observedHash: "0".repeat(64) };
    expect(await compareAccountabilityArtifacts(v)).toMatchObject({
      status: "MODIFIED / UNVERIFIED",
      observedMatches: false,
    });
  });
  it("requires obtainable text for a diff, not invented execution artifacts", async () => {
    await expect(compareAccountabilityArtifacts({ ...sample(), observedText: "" })).rejects.toThrow(
      /sample texts/,
    );
  });
  it("flags extra commands and syntax errors without execution", async () => {
    const v = { ...sample(), observedText: 'const = ;\nfetch("https://example.com/sample");' };
    const r = await compareAccountabilityArtifacts(v);
    expect(r.comparison.warnings.some((w) => w.includes("extra command"))).toBe(true);
    expect(r.syntax?.issues.length).toBeGreaterThan(0);
    expect(r.signatureVerified).toBe(false);
  });
});
