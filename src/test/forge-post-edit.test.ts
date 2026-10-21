import { describe, it, expect } from "vitest";
import { WaveFile } from "wavefile";
import { forgeDigest } from "@/lib/forge";
import { verifyPostEdit } from "@/lib/forge-post-edit";
import {
  channelEvidence,
  platformHandoff,
  releaseSchema,
  initialRelease,
} from "@/lib/forge-universe";
const project = "11111111-1111-4111-8111-111111111111";
async function fixture(sample = 1000) {
  const w = new WaveFile();
  w.fromScratch(1, 8000, "16", new Int16Array(800).fill(sample));
  const bytes = w.toBuffer();
  const asset = {
    id: project,
    owner_id: project,
    project_id: project,
    source_id: project,
    role: "enhanced",
    byte_size: bytes.length,
    sha256: await forgeDigest(bytes),
  };
  return { asset, bytes };
}
describe("Post-edit byte evidence", () => {
  it("checked output records exact byte length, rate and duration", async () => {
    const { asset, bytes } = await fixture();
    expect(await verifyPostEdit(asset, bytes, project)).toMatchObject({
      bytes: 1644,
      rate: 8000,
      seconds: 0.1,
      channels: 1,
      sha256: asset.sha256,
    });
  });
  it("digest mismatch never produces a release prompt", async () => {
    const { asset, bytes } = await fixture();
    await expect(
      verifyPostEdit({ ...asset, sha256: "a".repeat(64) }, bytes, project),
    ).rejects.toThrow(/digest/);
  });
  it("sample clipping blocks the release prompt", async () => {
    const { asset, bytes } = await fixture(32767);
    await expect(verifyPostEdit(asset, bytes, project)).rejects.toThrow(/clipping/);
  });
  it("wrong project is not an eligible handoff", async () => {
    const { asset, bytes } = await fixture();
    await expect(
      verifyPostEdit(asset, bytes, "22222222-2222-4222-8222-222222222222"),
    ).rejects.toThrow(/project/);
  });
  it("an original cannot claim completed enhancement", async () => {
    const { asset, bytes } = await fixture();
    await expect(verifyPostEdit({ ...asset, role: "original" }, bytes, project)).rejects.toThrow();
  });
  it("partial upload size mismatch blocks handoff", async () => {
    const { asset, bytes } = await fixture();
    await expect(
      verifyPostEdit({ ...asset, byte_size: bytes.length + 1 }, bytes, project),
    ).rejects.toThrow(/byte size/);
  });
});
describe("Official platform boundaries", () => {
  it.each([
    ["youtube", "AUTH REQUIRED / WAV UNSUPPORTED"],
    ["filmhub", "PACKAGE PLAN ONLY / TITLE QC REQUIRED"],
    ["vevo", "DISTRIBUTOR REVIEW REQUIRED"],
    ["vydia", "DISTRIBUTOR ASSISTED / API UNVERIFIED"],
  ] as const)("%s preserves its specific eligibility boundary", (channel, status) => {
    expect(platformHandoff(channel)?.status).toBe(status);
  });
  it.each(["youtube", "filmhub", "vevo", "vydia"] as const)(
    "%s metadata never implies delivery",
    (channel) => {
      expect(releaseSchema.safeParse({ ...initialRelease, channel }).success).toBe(true);
      expect(channelEvidence(channel)).toMatchObject({
        connection: "NOT CONNECTED",
        directUpload: false,
        scheduling: false,
        autopublish: false,
        receipt: null,
      });
      expect(platformHandoff(channel)).toMatchObject({
        mediaIncluded: false,
        completeDeliveryPackage: false,
        connectedAccount: null,
        humanSignoffRequired: true,
        rightsVerified: false,
      });
    },
  );
});
