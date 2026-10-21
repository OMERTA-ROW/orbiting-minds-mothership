import { z } from "zod";
import { inspectWav, audioMetrics } from "./quantum";
import { forgeDigest } from "./forge";

const reference = z.object({
  id: z.string().uuid(), owner_id: z.string().uuid(), project_id: z.string().uuid(),
  role: z.literal("enhanced"), source_id: z.string().uuid(),
  byte_size: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type PostEditOutput = {
  assetId: string; projectId: string; sha256: string; bytes: number;
  seconds: number; channels: number; rate: number;
  qa: "DOWNLOADED WAV / FORMAT, SAMPLE CLIPPING AND DIGEST CHECKED";
};
export type PostEditChoice = "now" | "schedule" | "draft";
export type PostEditHandoff = { output: PostEditOutput; choice: PostEditChoice };

// Byte-level bounded QA only; a saved row or a producer's report is not sufficient.
export async function verifyPostEdit(asset: unknown, bytes: Uint8Array, projectId: string): Promise<PostEditOutput> {
  const a = reference.parse(asset);
  if (a.project_id !== projectId || a.byte_size !== bytes.length) throw new Error("Saved output project or byte size mismatch.");
  const info = inspectWav(bytes);
  if (await forgeDigest(bytes) !== a.sha256) throw new Error("Saved output digest does not match downloaded bytes.");
  const pcm = new Int16Array(info.dataSize / 2), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < pcm.length; i++) pcm[i] = view.getInt16(info.dataAt + i * 2, true);
  if (audioMetrics(pcm).clippedSamples > 0) throw new Error("Sample clipping check failed; no release prompt.");
  return { assetId: a.id, projectId, sha256: a.sha256, bytes: bytes.length, seconds: info.seconds, channels: info.channels, rate: info.rate, qa: "DOWNLOADED WAV / FORMAT, SAMPLE CLIPPING AND DIGEST CHECKED" };
}