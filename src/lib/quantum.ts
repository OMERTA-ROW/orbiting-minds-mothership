import { z } from "zod";
import { assertNonSensitive } from "./beta";

export const STUDIO_BUCKET = "quantum-studio";
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
export const MAX_MEDIA_SECONDS = 30;
export const MAX_MEDIA_ASSETS = 8;
export const mediaConsent = z.object({ rights: z.literal(true), privacy: z.literal(true) }).strict();
export const assetInput = z.object({ projectId: z.string().uuid(), bytes: z.number().int().min(44).max(MAX_MEDIA_BYTES), consent: mediaConsent }).strict();
export const enhanceInput = z.object({ id: z.string().uuid(), gainDb: z.number().finite().min(-24).max(12), consent: mediaConsent, approve: z.literal(true) }).strict();
export const assetIdInput = z.object({ id: z.string().uuid() }).strict();
export const studioKinds = ["music", "film", "cartoon", "book", "adaptation"] as const;
export type StudioKind = typeof studioKinds[number];
export const studioScopes = {
  music: { name: "Music & sound", operations: ["Source inspection", "Level adjustment / A/B", "Restoration · EQ · stems", "Mastering / loudness review"] },
  film: { name: "Film & post", operations: ["Permitted footage / codec review", "Denoise · stabilization · color", "Captions / sync review", "Export / artifact inspection"] },
  cartoon: { name: "Original cartoons", operations: ["Original model / story bible", "Storyboard / scene continuity", "Authorized voices / animation", "Child privacy / editorial review"] },
  book: { name: "Books & publishing", operations: ["Authorized manuscript / editing", "Consistency / proofing", "Layout / accessibility", "PDF / EPUB export review"] },
  adaptation: { name: "Book to screen", operations: ["Adaptation rights / source attribution", "Screenplay / storyboard", "Voice · likeness · music consent", "Continuity / human editorial review"] },
} satisfies Record<StudioKind, { name: string; operations: string[] }>;
export const studioPlanInput = z.object({ kind: z.enum(studioKinds), projectId: z.string().uuid(), goal: z.string().trim().min(10).max(1000).superRefine((text, ctx) => { try { assertNonSensitive(text); } catch (e) { ctx.addIssue({ code: "custom", message: e instanceof Error ? e.message : "Remove sensitive content" }); } }), consent: mediaConsent }).strict();
export function studioPlan(input: unknown) {
  const v = studioPlanInput.parse(input);
  return { mode: "LOCAL TEMPLATE / NO MODEL", projectId: v.projectId, goal: v.goal, kind: v.kind, publication: "BLOCKED", steps: studioScopes[v.kind].operations.map((title, i) => ({ id: i + 1, title, status: v.kind === "music" && i === 1 ? "AVAILABLE: bounded WAV gain only" : "PROPOSED / NOT EXECUTABLE", scope: "Only individually authorized files; never whole folders", cost: "Provider unconnected / rate unconfigured", approval: "Human review required" })) };
}
export function studioPath(ownerId: string, assetId: string) {
  z.string().uuid().parse(ownerId); z.string().uuid().parse(assetId);
  return `${ownerId}/${assetId}/audio.wav`;
}
export function assertStudioAccess(access: { studio_approved: boolean; paused: boolean } | null) {
  if (!access?.studio_approved) throw new Error("Private media beta awaits owner approval. No file processing started.");
  if (access.paused) throw new Error("Account processing is paused. Originals remain available.");
}

// Bounded little-endian PCM only. Inspect chunk lengths before any library allocation.
export function inspectWav(bytes: Uint8Array) {
  if (bytes.byteLength < 44 || bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("Use a WAV file up to 4 MiB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (text(0) !== "RIFF" || text(8) !== "WAVE" || view.getUint32(4, true) + 8 !== bytes.length) throw new Error("Invalid WAV container or length.");
  let at = 12, rate = 0, channels = 0, dataSize = 0, dataAt = 0, fmtSeen = false, dataSeen = false;
  while (at + 8 <= bytes.length) {
    const id = text(at), length = view.getUint32(at + 4, true), start = at + 8;
    if (start + length > bytes.length) throw new Error("Truncated WAV chunk.");
    if (id === "fmt ") {
      if (fmtSeen || length !== 16) throw new Error("Use standard 16-bit PCM WAV, not compressed or extended formats.");
      fmtSeen = true; channels = view.getUint16(start + 2, true); rate = view.getUint32(start + 4, true);
      if (view.getUint16(start, true) !== 1 || view.getUint16(start + 14, true) !== 16 || ![1, 2].includes(channels) || rate < 8000 || rate > 48000 || view.getUint16(start + 12, true) !== channels * 2 || view.getUint32(start + 8, true) !== rate * channels * 2) throw new Error("Use 16-bit PCM, mono/stereo, 8–48 kHz WAV.");
    } else if (id === "data") {
      if (dataSeen) throw new Error("Duplicate audio chunk.");
      dataSeen = true; dataSize = length; dataAt = start;
    } else if (!["LIST", "JUNK", "bext", "iXML"].includes(id)) throw new Error("Unsupported WAV chunk.");
    at = start + length + (length % 2);
  }
  if (at !== bytes.length || !fmtSeen || !dataSeen || dataSize === 0 || dataSize % (channels * 2) !== 0) throw new Error("Invalid audio data alignment.");
  const frames = dataSize / (channels * 2), seconds = frames / rate;
  if (seconds > MAX_MEDIA_SECONDS) throw new Error("Use clips of 30 seconds or less.");
  return { rate, channels, frames, seconds, dataAt, dataSize };
}
export type AudioMetrics = { peak: number; rms: number; clippedSamples: number; samples: number };
export function audioMetrics(samples: ArrayLike<number>): AudioMetrics {
  let peak = 0, squares = 0, clippedSamples = 0;
  for (let i = 0; i < samples.length; i++) { const v = samples[i] ?? 0; if (!Number.isFinite(v)) throw new Error("Non-finite sample."); peak = Math.max(peak, Math.abs(v)); squares += v * v; if (v >= 32767 || v <= -32768) clippedSamples++; }
  return { peak: peak / 32768, rms: Math.sqrt(squares / Math.max(1, samples.length)) / 32768, clippedSamples, samples: samples.length };
}