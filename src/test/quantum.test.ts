import { describe, expect, it } from "vitest";
import { WaveFile } from "wavefile";
import { enhanceWav } from "@/lib/quantum-audio";
import { inspectWav, assertStudioAccess, studioPlan, studioPath, assetInput, enhanceInput, MAX_MEDIA_ASSETS, MAX_MEDIA_BYTES } from "@/lib/quantum";

const projectId = "11111111-1111-4111-8111-111111111111";
const consent = { rights: true, privacy: true };
function wav(samples: number[] | Int16Array = [1000, -1000, 2000, -2000], rate = 8000, channels = 1) { const file = new WaveFile(); file.fromScratch(channels, rate, "16", samples); return file.toBuffer(); }
describe("Quantum media gates", () => {
  it("requires rights consent", () => expect(assetInput.safeParse({ projectId, bytes: 44, consent: { ...consent, rights: false } }).success).toBe(false));
  it("requires privacy/file consent", () => expect(assetInput.safeParse({ projectId, bytes: 44, consent: { ...consent, privacy: false } }).success).toBe(false));
  it("requires human enhancement approval", () => expect(enhanceInput.safeParse({ id: projectId, gainDb: 0, consent, approve: false }).success).toBe(false));
  it("denies unapproved media accounts", () => expect(() => assertStudioAccess({ studio_approved: false, paused: false })).toThrow("approval"));
  it("blocks processing while paused", () => expect(() => assertStudioAccess({ studio_approved: true, paused: true })).toThrow("paused"));
  it("allows approved unpaused media account", () => expect(() => assertStudioAccess({ studio_approved: true, paused: false })).not.toThrow());
  it("rejects unsafe object paths", () => expect(() => studioPath("../another-owner", projectId)).toThrow());
  it("requires a bounded owned-project reference", () => expect(assetInput.safeParse({ projectId: "external", bytes: 44, consent }).success).toBe(false));
  it("rejects oversized asset reservations", () => expect(assetInput.safeParse({ projectId, bytes: MAX_MEDIA_BYTES + 1, consent }).success).toBe(false));
  it("retains explicit eight asset bound", () => expect(MAX_MEDIA_ASSETS).toBe(8));
  it("keeps every creative publication blocked", () => { for (const kind of ["music", "film", "cartoon", "book", "adaptation"]) expect(studioPlan({ kind, projectId, goal: "Improve my licensed original work", consent }).publication).toBe("BLOCKED"); });
  it("never executes film/animation/book proposals", () => { for (const kind of ["film", "cartoon", "book", "adaptation"]) expect(studioPlan({ kind, projectId, goal: "Improve my licensed original work", consent }).steps.every(s => s.status === "PROPOSED / NOT EXECUTABLE")).toBe(true); });
  it("rejects CyberLink Social plan requests", () => expect(() => studioPlan({ kind: "film", projectId, goal: "Connect CyberLink Social to my workflow", consent })).toThrow());
});
describe("Real bounded WAV enhancement", () => {
  it("preserves original bytes without destructive edits", () => { const source = wav(), before = source.slice(); enhanceWav(source, -6); expect(source).toEqual(before); });
  it("applies the requested decibel gain with concrete samples", () => { const output = enhanceWav(wav(), -6); const samples = new WaveFile(output.bytes).getSamples(true); expect(Array.from(samples)).toEqual([501, -501, 1002, -1002]); expect(output.report.after.peak).toBe(1002 / 32768); });
  it("preserves stereo duration, sample rate and frames", () => { const before = wav([1000, 2000, -1000, -2000], 48000, 2), result = enhanceWav(before, -3); expect(inspectWav(result.bytes)).toMatchObject({ channels: 2, rate: 48000, frames: 2, seconds: 2 / 48000 }); });
  it("rejects clipping instead of saving damage", () => expect(() => enhanceWav(wav([30000, -30000]), 12)).toThrow("clip"));
  it("rejects clips over 30 seconds", () => expect(() => inspectWav(wav(new Int16Array(8000 * 30 + 1)))).toThrow("30 seconds"));
  it("accepts exactly 30 seconds", () => expect(inspectWav(wav(new Int16Array(8000 * 30))).seconds).toBe(30));
  it("rejects spoofed non-audio content", () => expect(() => inspectWav(new TextEncoder().encode("<script>malicious file disguised as WAV with enough length</script>"))).toThrow());
  it("rejects truncated chunk lengths before allocations", () => { const file = wav(); new DataView(file.buffer, file.byteOffset).setUint32(40, 0xffffffff, true); expect(() => inspectWav(file)).toThrow("Truncated"); });
  it("rejects unbounded sample rates", () => expect(() => inspectWav(wav([1000, -1000], 96000))).toThrow("8–48"));
  it("rejects compressed or float audio", () => { const file = new WaveFile(); file.fromScratch(1, 8000, "32f", [0.1, 0.2]); expect(() => inspectWav(file.toBuffer())).toThrow(); });
  it("rejects gain outside reviewed bounds", () => expect(() => enhanceWav(wav(), 13)).toThrow());
  it("does not fabricate true peak or mastering results", () => expect(enhanceWav(wav(), 0).report).toMatchObject({ truePeakOrLufs: false, professionalMastering: false }));
});