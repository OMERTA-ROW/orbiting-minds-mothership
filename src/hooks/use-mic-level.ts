import { useEffect, type MutableRefObject } from "react";

// While dictation is listening, measures microphone loudness locally so the
// orb can react to your voice. Audio never leaves the browser and is not
// stored. Skipped on touch devices, where a second microphone stream can
// interrupt the browser's dictation.

export function useMicLevel(active: boolean, level: MutableRefObject<number>) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    const media = navigator.mediaDevices;
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!media?.getUserMedia || !Ctx) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let frame = 0;
    void media
      .getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        ctx = new Ctx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += ((v - 128) / 128) ** 2;
          level.current = Math.max(
            level.current * 0.85,
            Math.min(1, Math.sqrt(sum / data.length) * 4),
          );
          frame = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => {
        // Permission declined or unavailable: the orb keeps its gentle pulse.
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => undefined);
      level.current = 0;
    };
  }, [active, level]);
}
