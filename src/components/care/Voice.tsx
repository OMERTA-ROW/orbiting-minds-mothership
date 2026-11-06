import { useState } from "react";
import { MicOff, MessageCircle, VolumeX, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useCare } from "@/hooks/use-care";
import { careVoices } from "@/data/evolution";
import { CareShell, Choice, Notice, useCareAction } from "./CareShell";
import type { CareStore } from "@/lib/care";
export function VoicePage() {
  const { store } = useCare();
  const { run, message } = useCareAction();
  const [held, setHeld] = useState(false);
  const [sample, setSample] = useState(false);
  const persona = careVoices.find((p) => p.id === store.voice.persona);
  const voice = (patch: Partial<CareStore["voice"]>) =>
    run({ type: "voice", voice: { ...store.voice, ...patch } });
  return (
    <CareShell
      title="Mothership Voice"
      subtitle="Original, calm and dependable. Never listening until you choose."
    >
      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <h2 className="text-2xl">Choose the Mothership’s persona</h2>
          <p className="mt-4 text-sm leading-loose text-muted-foreground">
            Original text personalities, not imitations of a person or existing voice. No model,
            speech recognition or synthesis is connected. Language, pace and style are preferences
            for a future voice—not generated translations.
          </p>
          {!store.modules.voice && (
            <Choice
              label="Enable Voice demo"
              checked={false}
              onChange={(checked) =>
                run({ type: "modules", modules: { ...store.modules, voice: checked } })
              }
            />
          )}
          <div className="mt-6 grid gap-5">
            {careVoices.map((p) => (
              <Button
                variant={store.voice.persona === p.id ? "signal" : "ghost"}
                key={p.id}
                aria-pressed={store.voice.persona === p.id}
                disabled={!store.modules.voice}
                className="h-auto justify-start whitespace-normal px-5 py-5 text-left"
                onClick={() => {
                  voice({ persona: p.id });
                  setSample(false);
                }}
              >
                <span className="min-w-0">
                  <span className="block font-display text-lg">{p.name}</span>
                  <span className="mt-3 block text-xs leading-loose text-muted-foreground">
                    {p.description}
                  </span>
                </span>
              </Button>
            ))}
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Speaking style
              <select
                disabled={!store.modules.voice}
                aria-label="Speaking style"
                className="exchange-select mt-2 block w-full"
                value={store.voice.style}
                onChange={(e) => voice({ style: e.target.value as CareStore["voice"]["style"] })}
              >
                {["Calm", "Concise", "Detailed"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Future speech language
              <select
                disabled={!store.modules.voice}
                aria-label="Future speech language"
                className="exchange-select mt-2 block w-full"
                value={store.voice.language}
                onChange={(e) =>
                  voice({ language: e.target.value as CareStore["voice"]["language"] })
                }
              >
                {["English", "Spanish", "French"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-7 block text-xs text-muted-foreground">
            Future speaking pace · {store.voice.speed}×
          </label>
          <Slider
            aria-label="Future speaking pace"
            disabled={!store.modules.voice}
            min={0.75}
            max={1.25}
            step={0.05}
            value={[store.voice.speed]}
            className="mt-5"
            onValueCommit={(value) => {
              const speed = value[0];
              if (speed !== undefined) voice({ speed });
            }}
          />
          <Notice message={message} />
          <section className="mt-10 border-t border-border pt-8">
            <h3 className="text-xl">Privacy is the starting point</h3>
            <Choice
              label="Push-to-talk concept · no microphone"
              note="Hold the sample control to see a text-only state. No audio ever recorded."
              checked={store.voice.ptt}
              disabled={!store.modules.voice}
              onChange={(checked) => {
                voice({ ptt: checked });
                setHeld(false);
              }}
            />
            <Choice
              label="Local / offline speech preference"
              checked={true}
              disabled
              onChange={() => {}}
              note="Future implementation only; no speech engine installed"
            />
            <Choice
              label="Retain audio"
              checked={false}
              disabled
              onChange={() => {}}
              note="OFF · no recordings exist"
            />
            <Choice
              label="Retain transcripts"
              checked={false}
              disabled
              onChange={() => {}}
              note="OFF · sample text only, no live transcription"
            />
            <p className="mt-5 text-xs leading-loose text-muted-foreground">
              Future cloud speech needs separate provider, privacy, fee and regional-accessibility
              consent. Microphone off by default; no continuous listening. Privileged actions
              require visible specific confirmation, not voice-only authority.
            </p>
            <Button disabled variant="outline" className="mt-5 h-auto min-h-11 whitespace-normal">
              <LockKeyhole size={16} />
              Cloud speech / audio access · unconfigured
            </Button>
          </section>
        </section>
        <aside className="min-w-0 border-t border-border pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div className="flex items-center gap-3">
            <MicOff size={24} className="text-gold" />
            <h2 className="text-xl">Microphone OFF</h2>
          </div>
          <div
            className="mt-8 flex aspect-[3/1] items-center justify-center gap-2 border-y border-border text-gold/60"
            aria-hidden
          >
            {[18, 28, 40, 26, 52, 36, 62, 36, 52, 26, 40, 28, 18].map((height, index) => (
              <svg key={index} width="6" height="70" viewBox="0 0 6 70">
                <rect x="1" y={(70 - height) / 2} width="4" height={height} fill="currentColor" />
              </svg>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Decorative waveform · not live audio</p>
          <h3 className="mt-8 text-lg">{persona?.name}</h3>
          <Button
            variant="signal"
            className="mt-5 h-auto min-h-11 whitespace-normal"
            disabled={!store.modules.voice}
            onClick={() => setSample(true)}
          >
            <MessageCircle size={16} />
            Preview original sample text
          </Button>
          {sample && (
            <blockquote
              role="status"
              className="mt-5 border-l border-gold/40 pl-5 text-sm leading-loose text-gold-light"
            >
              {persona?.line}
              <span className="mt-3 block text-xs text-muted-foreground">
                English editorial sample · not speech or translation
              </span>
            </blockquote>
          )}
          <Button
            variant="outline"
            className="mt-8 h-16 w-full whitespace-normal"
            disabled={!store.modules.voice || !store.voice.ptt}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setHeld(true);
            }}
            onPointerUp={() => setHeld(false)}
            onPointerCancel={() => setHeld(false)}
            onBlur={() => setHeld(false)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                setHeld(true);
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") setHeld(false);
            }}
          >
            <MicOff size={16} />
            Hold for PTT demo
          </Button>
          <p role="status" className="mt-4 text-xs leading-loose text-gold-light">
            {held && store.modules.voice && store.voice.ptt
              ? "PTT DEMO HELD · MICROPHONE STILL OFF"
              : "Not listening · no recording"}
          </p>
          <Button
            variant="ghost"
            className="mt-5"
            disabled={!store.modules.voice}
            onClick={() => {
              voice({ ptt: false });
              setHeld(false);
            }}
          >
            <VolumeX size={16} />
            Mute demo
          </Button>
          <p className="mt-6 text-xs leading-loose text-muted-foreground">
            CARE notices, update approvals and Pilot actions could be read aloud by a future
            consented engine. None is spoken here.
          </p>
        </aside>
      </div>
    </CareShell>
  );
}
