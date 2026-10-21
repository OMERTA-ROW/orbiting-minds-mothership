import { describe, it, expect } from "vitest";
import * as wavefile from "wavefile";
import {
  defaultRadioSettings,
  initialWebContent,
  radioSettings,
  radioInput,
  webInput,
  forgeReviewInput,
  webDiff,
} from "@/lib/forge";
import { editRadioWav } from "@/lib/forge-radio";
import { renderForgeWeb, checkForgeWeb } from "@/lib/forge-web";
import { inspectWav } from "@/lib/quantum";
const { WaveFile } = wavefile;
const id = "11111111-1111-4111-8111-111111111111",
  consent = { rights: true, privacy: true };
const audio = (stereo = false) => {
  const w = new WaveFile();
  w.fromScratch(stereo ? 2 : 1, 8000, "16", new Int16Array(stereo ? 16000 : 8000).fill(1000));
  return w.toBuffer();
};
describe("Forge consent and truthful scope", () => {
  it("requires rights permission for radio", () =>
    expect(
      radioInput.safeParse({
        id,
        settings: defaultRadioSettings,
        consent: { ...consent, rights: false },
        approve: true,
      }).success,
    ).toBe(false));
  it("requires private permission for web", () =>
    expect(
      webInput.safeParse({
        projectId: id,
        content: initialWebContent,
        consent: { ...consent, privacy: false },
      }).success,
    ).toBe(false));
  it("requires explicit radio process approval", () =>
    expect(
      radioInput.safeParse({ id, settings: defaultRadioSettings, consent, approve: false }).success,
    ).toBe(false));
  it("requires manually reviewed cue", () =>
    expect(
      radioSettings.safeParse({
        ...defaultRadioSettings,
        cues: [{ start: 0.1, end: 0.2, action: "silence", reviewed: false }],
      }).success,
    ).toBe(false));
  it("cannot fabricate instrumental stems", () =>
    expect(
      radioSettings.safeParse({ ...defaultRadioSettings, label: "Instrumental source" }).success,
    ).toBe(false));
  it("permits instrumental only as a declared existing source", () =>
    expect(
      radioSettings.safeParse({
        ...defaultRadioSettings,
        label: "Instrumental source",
        instrumentalSource: true,
      }).success,
    ).toBe(true));
  it("explicit source cannot contain cleaning cues", () =>
    expect(
      radioSettings.safeParse({
        ...defaultRadioSettings,
        label: "Explicit source",
        cues: [{ start: 0.1, end: 0.2, action: "cut", reviewed: true }],
      }).success,
    ).toBe(false));
  it("export review requires explicit approval", () =>
    expect(forgeReviewInput.safeParse({ id, consent, approve: false }).success).toBe(false));
  it("rejects excluded project instructions in web content", () =>
    expect(
      webInput.safeParse({
        projectId: id,
        content: { ...initialWebContent, about: "Connect CyberLink Social to this site" },
        consent,
      }).success,
    ).toBe(false));
});
describe("Actual radio edit output", () => {
  it("preserves original bytes", () => {
    const source = audio(),
      before = source.slice();
    editRadioWav(source, defaultRadioSettings);
    expect(source).toEqual(before);
  });
  it("silences exact reviewed frames without changing duration", () => {
    const r = editRadioWav(audio(), {
      ...defaultRadioSettings,
      fadeMs: 0,
      cues: [{ start: 0.1, end: 0.2, action: "silence", reviewed: true }],
    });
    const samples = new WaveFile(r.bytes).getSamples(true);
    expect(samples[799]).toBe(1000);
    expect(samples[800]).toBe(0);
    expect(samples[1599]).toBe(0);
    expect(samples[1600]).toBe(1000);
    expect(r.report.frames).toBe(8000);
  });
  it("generates actual tone in the reviewed interval", () => {
    const r = editRadioWav(audio(), {
      ...defaultRadioSettings,
      fadeMs: 0,
      cues: [{ start: 0.1, end: 0.2, action: "tone", reviewed: true }],
    });
    const samples = new WaveFile(r.bytes).getSamples(true);
    expect(samples[802]).toBe(3276);
    expect(samples[1600]).toBe(1000);
  });
  it("cut shortens exactly the selected frames", () => {
    const r = editRadioWav(audio(), {
      ...defaultRadioSettings,
      fadeMs: 0,
      cues: [{ start: 0.1, end: 0.2, action: "cut", reviewed: true }],
    });
    expect(r.report.frames).toBe(7200);
    expect(r.report.seconds).toBe(0.9);
  });
  it("cut uses a real 10ms overlap crossfade", () => {
    const r = editRadioWav(audio(), {
      ...defaultRadioSettings,
      cues: [{ start: 0.1, end: 0.2, action: "cut", reviewed: true }],
    });
    expect(r.report.frames).toBe(7120);
    expect(new WaveFile(r.bytes).getSamples(true)[799]).toBe(1000);
  });
  it("folds stereo to real mono", () => {
    const r = editRadioWav(audio(true), { ...defaultRadioSettings, channels: "mono" });
    expect(inspectWav(r.bytes)).toMatchObject({ channels: 1, frames: 8000, seconds: 1 });
  });
  it("rejects overlapping cues", () =>
    expect(() =>
      editRadioWav(audio(), {
        ...defaultRadioSettings,
        cues: [
          { start: 0.1, end: 0.4, action: "cut", reviewed: true },
          { start: 0.3, end: 0.5, action: "silence", reviewed: true },
        ],
      }),
    ).toThrow("non-overlapping"));
  it("rejects out of range cues", () =>
    expect(() =>
      editRadioWav(audio(), {
        ...defaultRadioSettings,
        cues: [{ start: 1, end: 2, action: "cut", reviewed: true }],
      }),
    ).toThrow("bounds"));
  it("rejects removing all audio", () =>
    expect(() =>
      editRadioWav(audio(), {
        ...defaultRadioSettings,
        cues: [{ start: 0, end: 1, action: "cut", reviewed: true }],
      }),
    ).toThrow("entire"));
  it("enforces declared station duration", () =>
    expect(() => editRadioWav(audio(), { ...defaultRadioSettings, maxSeconds: 0.5 })).toThrow(
      "duration",
    ));
  it("enforces declared station sample peak", () => {
    const w = new WaveFile();
    w.fromScratch(1, 8000, "16", [30000]);
    expect(() =>
      editRadioWav(w.toBuffer(), { ...defaultRadioSettings, maxSamplePeakDb: -6 }),
    ).toThrow("peak");
  });
  it("never invents LUFS true peak profanity scan or FFmpeg", () =>
    expect(editRadioWav(audio(), defaultRadioSettings).report).toMatchObject({
      lufs: null,
      truePeak: null,
      stemsGenerated: false,
      ffmpegExecuted: false,
      broadcastCompliance: "NOT VERIFIED",
      profanityDetection: "NOT RUN / MANUAL CUES",
    }));
});
describe("Safe real web draft", () => {
  it("returns a complete editable static document", () =>
    expect(checkForgeWeb(initialWebContent)).toMatchObject({
      singleH1: true,
      externalRequests: 0,
      scripts: 0,
      deployment: "NOT RUN",
    }));
  it("escapes injected code as content instead of executing it", () => {
    const html = renderForgeWeb({ ...initialWebContent, brand: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("never embeds private storage links or files", () => {
    const html = renderForgeWeb({ ...initialWebContent, audioAssetId: id });
    expect(html).not.toContain(id);
    expect(checkForgeWeb(initialWebContent).linkedAudioIncluded).toBe(false);
  });
  it("records concrete field diff for a new version", () =>
    expect(webDiff(initialWebContent, { ...initialWebContent, brand: "My original band" })).toEqual(
      [{ field: "brand", before: "Your original project", after: "My original band" }],
    ));
  it("does not accept raw executable fields", () =>
    expect(
      webInput.safeParse({
        projectId: id,
        content: { ...initialWebContent, javascript: "alert(1)" },
        consent,
      }).success,
    ).toBe(false));
});
