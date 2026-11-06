import { useRef, useState } from "react";
import { FlaskConical, Headphones, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { compareMediaMetrics, syntheticToneMetrics } from "@/lib/entertainment";
import toneA from "@/assets/entertainment-tone-a.wav?url";
import toneB from "@/assets/entertainment-tone-b.wav?url";
export function CreativeSamples() {
  const [take, setTake] = useState<"a" | "b">("a"),
    [playing, setPlaying] = useState(false),
    [notice, setNotice] = useState("");
  const player = useRef<HTMLAudioElement>(null);
  const [metrics, setMetrics] = useState<ReturnType<typeof compareMediaMetrics> | null>(null);
  const m = syntheticToneMetrics(take === "a" ? 0.1 : 0.07);
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <section className="min-w-0 border-t border-gold/30 pt-6">
        <p className="eyebrow flex items-center gap-2">
          <Headphones size={15} />
          Music / sound audition
        </p>
        <h2 className="mt-4 text-2xl">A quiet signal. A clear comparison.</h2>
        <p className="mt-4 text-xs leading-6 text-muted-foreground">
          DEMO · original 440 Hz sine tones, 2 seconds each. No microphone, music catalog, session,
          plug-in or user media access. Not a mastering or LUFS test.
        </p>
        <div
          className="mt-6 flex flex-wrap items-center gap-3"
          role="group"
          aria-label="Synthetic A/B take"
        >
          {(["a", "b"] as const).map((v) => (
            <Button
              key={v}
              variant={take === v ? "signal" : "ghost"}
              aria-pressed={take === v}
              onClick={() => {
                player.current?.pause();
                setPlaying(false);
                setTake(v);
              }}
            >
              Take {v.toUpperCase()} · {v === "a" ? "0.10" : "0.07"} gain
            </Button>
          ))}
          <Button
            variant="cosmic"
            size="icon"
            title={playing ? "Pause synthetic tone" : "Play synthetic tone"}
            aria-label={playing ? "Pause synthetic tone" : "Play synthetic tone"}
            onClick={async () => {
              const p = player.current;
              if (!p) return;
              if (playing) {
                p.pause();
                setPlaying(false);
                return;
              }
              try {
                p.currentTime = 0;
                p.volume = 0.3;
                await p.play();
                setPlaying(true);
                setNotice("");
              } catch {
                setNotice("Audio playback unavailable; no device access requested.");
              }
            }}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </Button>
        </div>
        <audio
          ref={player}
          src={take === "a" ? toneA : toneB}
          preload="none"
          onEnded={() => setPlaying(false)}
        />
        <dl className="mt-6 grid grid-cols-3 gap-4 border-y border-border py-5 text-xs">
          <div>
            <dt className="text-muted-foreground">Theoretical peak</dt>
            <dd className="mt-2 font-mono text-gold-light">{m.peakDbfs.toFixed(2)} dBFS</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Steady sine RMS</dt>
            <dd className="mt-2 font-mono text-gold-light">{m.rmsDbfs.toFixed(2)} dBFS</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sample rate</dt>
            <dd className="mt-2 font-mono text-gold-light">48 kHz</dd>
          </div>
        </dl>
        <p className="mt-4 text-[11px] leading-6 text-muted-foreground">
          Values describe ideal synthesis before edge fades and playback attenuation; not
          measurements of uploaded audio.
        </p>
        {notice && (
          <p role="status" className="mt-4 text-xs text-warning">
            {notice}
          </p>
        )}
      </section>
      <section className="min-w-0 border-t border-gold/30 pt-6">
        <p className="eyebrow flex items-center gap-2">
          <FlaskConical size={15} />
          Media Code Crucible
        </p>
        <h2 className="mt-4 text-2xl">Sample metrics, not proof.</h2>
        <p className="mt-4 text-xs leading-6 text-muted-foreground">
          Numeric DEMO comparison only. No media decoding, audio analysis, render, arbitrary code or
          independent validation.
        </p>
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              setMetrics(
                compareMediaMetrics({
                  duration: Number(f.get("duration")),
                  fps: Number(f.get("fps")),
                  candidateFrames: Number(f.get("frames")),
                  peakDbfs: Number(f.get("peak")),
                }),
              );
            } catch {
              setNotice("Use numeric sample values within the displayed limits.");
            }
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                name: "duration",
                label: "Duration (seconds)",
                value: 30,
                min: 1,
                max: 120,
                step: 1,
              },
              { name: "fps", label: "Frames / second", value: 24, min: 1, max: 120, step: 1 },
              {
                name: "frames",
                label: "Candidate frame count",
                value: 719,
                min: 0,
                max: 14400,
                step: 1,
              },
              {
                name: "peak",
                label: "Declared peak (dBFS)",
                value: -1,
                min: -120,
                max: 6,
                step: 0.1,
              },
            ].map((v) => (
              <label key={v.name} className="text-[11px] text-muted-foreground">
                {v.label}
                <input
                  name={v.name}
                  aria-label={v.label}
                  type="number"
                  min={v.min}
                  max={v.max}
                  step={v.step}
                  required
                  defaultValue={v.value}
                  className="exchange-select mt-2 w-full"
                />
              </label>
            ))}
          </div>
          <Button type="submit" variant="signal" className="mt-5">
            <FlaskConical size={14} />
            Compare sample metrics
          </Button>
        </form>
        {metrics && (
          <div role="status" className="mt-5 border-l border-warning pl-4 text-xs leading-6">
            <p className="text-warning">DEMO ARITHMETIC · NOT INDEPENDENT EVIDENCE</p>
            <p>
              Expected {metrics.expectedFrames} frames · delta {metrics.frameDelta} ·{" "}
              {metrics.framesMatch ? "numeric match" : "numeric mismatch"}
            </p>
            <p>
              Declared peak:{" "}
              {metrics.clippingRisk ? "possible clipping" : "below digital full scale"} · media not
              decoded
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
