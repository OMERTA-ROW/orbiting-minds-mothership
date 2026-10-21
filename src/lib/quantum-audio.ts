import wavefile from "wavefile";
import { audioMetrics, inspectWav, enhanceInput } from "./quantum";
const { WaveFile } = wavefile;

export function enhanceWav(bytes: Uint8Array, gainDb: number) {
  enhanceInput.shape.gainDb.parse(gainDb);
  const info = inspectWav(bytes);
  // Create a metadata-free canonical input, avoiding proprietary/PII chunks.
  const pcm = new Int16Array(info.dataSize / 2), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < pcm.length; i++) pcm[i] = view.getInt16(info.dataAt + i * 2, true);
  const gain = 10 ** (gainDb / 20), transformed = new Int16Array(pcm.length);
  let wouldClip = false;
  for (let i = 0; i < pcm.length; i++) { const value = Math.round((pcm[i] ?? 0) * gain); if (value < -32768 || value > 32767) wouldClip = true; transformed[i] = Math.min(32767, Math.max(-32768, value)); }
  if (wouldClip) throw new Error("This gain would clip. Reduce it; no enhanced version was created.");
  const wav = new WaveFile(); wav.fromScratch(info.channels, info.rate, "16", transformed);
  const output = wav.toBuffer(); const after = inspectWav(output);
  if (after.frames !== info.frames || after.rate !== info.rate || after.channels !== info.channels) throw new Error("Output format check failed.");
  return { bytes: output, report: { method: "PCM gain v1 / wavefile", gainDb, rate: info.rate, channels: info.channels, seconds: info.seconds, before: audioMetrics(pcm), after: audioMetrics(transformed), framesPreserved: true, metadataStripped: true, professionalMastering: false, truePeakOrLufs: false } };
}