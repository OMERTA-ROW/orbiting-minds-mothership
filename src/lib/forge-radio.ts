import { WaveFile } from "wavefile";
import { audioMetrics, inspectWav } from "./quantum";
import { radioSettings, type RadioSettings } from "./forge";

export function editRadioWav(bytes: Uint8Array, input: RadioSettings) {
  const settings = radioSettings.parse(input),
    info = inspectWav(bytes),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const source = new Int16Array(info.dataSize / 2);
  for (let i = 0; i < source.length; i++) source[i] = view.getInt16(info.dataAt + i * 2, true);
  const cues = [...settings.cues]
    .sort((a, b) => a.start - b.start)
    .map((c) => ({
      ...c,
      first: Math.round(c.start * info.rate),
      last: Math.round(c.end * info.rate),
    }));
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (
      !c ||
      c.last > info.frames ||
      c.first >= c.last ||
      (i > 0 && c.first < (cues[i - 1]?.last ?? 0))
    )
      throw new Error("Cues must be non-overlapping, in bounds and at least one frame long.");
    if (c.action === "cut" && c.first === 0 && c.last === info.frames)
      throw new Error("A cut cannot remove the entire recording.");
  }
  const changed = source.slice(),
    fadeFrames = Math.round((settings.fadeMs * info.rate) / 1000);
  for (const c of cues.filter((v) => v.action !== "cut")) {
    const fade = Math.min(fadeFrames, Math.floor((c.last - c.first) / 2));
    for (let f = c.first; f < c.last; f++) {
      const blend = fade === 0 ? 1 : Math.min(1, (f - c.first) / fade, (c.last - 1 - f) / fade);
      const tone =
        c.action === "tone" ? Math.round(3276 * Math.sin((2 * Math.PI * 1000 * f) / info.rate)) : 0;
      for (let ch = 0; ch < info.channels; ch++) {
        const i = f * info.channels + ch;
        changed[i] = Math.round((changed[i] ?? 0) * (1 - blend) + tone * blend);
      }
    }
  }
  let output: number[] = [],
    cursor = 0;
  for (const c of cues.filter((v) => v.action === "cut")) {
    for (let f = cursor; f < c.first; f++)
      for (let ch = 0; ch < info.channels; ch++) output.push(changed[f * info.channels + ch] ?? 0);
    const nextCut = cues.filter((v) => v.action === "cut").find((v) => v.first >= c.last),
      nextBoundary = nextCut?.first ?? info.frames;
    const cross = Math.min(
      fadeFrames,
      Math.floor(output.length / info.channels),
      nextBoundary - c.last,
    );
    for (let f = 0; f < cross; f++) {
      const mix = (f + 1) / (cross + 1);
      for (let ch = 0; ch < info.channels; ch++) {
        const i = output.length - cross * info.channels + f * info.channels + ch;
        output[i] = Math.round(
          (output[i] ?? 0) * (1 - mix) + (changed[(c.last + f) * info.channels + ch] ?? 0) * mix,
        );
      }
    }
    cursor = c.last + cross;
  }
  for (let f = cursor; f < info.frames; f++)
    for (let ch = 0; ch < info.channels; ch++) output.push(changed[f * info.channels + ch] ?? 0);
  if (settings.channels === "mono" && info.channels === 2) {
    const mono: number[] = [];
    for (let i = 0; i < output.length; i += 2)
      mono.push(Math.round(((output[i] ?? 0) + (output[i + 1] ?? 0)) / 2));
    output = mono;
  }
  const channels = settings.channels === "mono" ? 1 : info.channels,
    pcm = Int16Array.from(output);
  if (!pcm.length) throw new Error("Edits removed all audio.");
  const metrics = audioMetrics(pcm),
    seconds = pcm.length / channels / info.rate;
  if (seconds > settings.maxSeconds)
    throw new Error("Output exceeds this station's declared duration limit. Review more cuts.");
  if (metrics.clippedSamples > 0 || metrics.peak > 10 ** (settings.maxSamplePeakDb / 20))
    throw new Error(
      "Output fails the declared sample-peak/clipping limit. Adjust the source first.",
    );
  const wav = new WaveFile();
  wav.fromScratch(channels, info.rate, "16", pcm);
  const out = wav.toBuffer();
  const measured = inspectWav(out);
  if (measured.frames !== pcm.length / channels || measured.rate !== info.rate)
    throw new Error("Radio output format check failed.");
  return {
    bytes: out,
    report: {
      method: "Bounded PCM radio v1 / wavefile",
      label: settings.label,
      sourceSeconds: info.seconds,
      seconds,
      rate: info.rate,
      channels,
      frames: measured.frames,
      before: audioMetrics(source),
      after: metrics,
      cues: settings.cues,
      fadeMs: settings.fadeMs,
      samplePeakLimitDb: settings.maxSamplePeakDb,
      metadataStripped: true,
      sourceUnchanged: true,
      profanityDetection: "NOT RUN / MANUAL CUES",
      stemsGenerated: false,
      lufs: null,
      truePeak: null,
      broadcastCompliance: "NOT VERIFIED",
      ffmpegExecuted: false,
    },
  };
}
