import { useEffect, useRef, type CSSProperties, type MutableRefObject } from "react";
import earthTexture from "@/assets/omni-earth-texture.jpg";
import earthTextureSmall from "@/assets/omni-earth-texture-small.jpg";
import { ORB_STATE_TEXT, type OrbState } from "@/lib/omni-voice";
import "./OmniOrb.css";

interface OmniOrbProps {
  state: OrbState;
  agentName: string;
  muted: boolean;
  /** 0..1 loudness or word-timing pulse written by the voice hooks. */
  level: MutableRefObject<number>;
}

/**
 * The single central OMNI orb: an Earth-like planet turning very slowly on a
 * tilted axis, with a purple/blue atmosphere that reacts to voice. Rotation
 * is a GPU transform; the waveform canvas only draws while listening or
 * speaking, pauses off-screen and respects reduced motion.
 */
export function OmniOrb({ state, agentName, muted, level }: OmniOrbProps) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = state === "listening" || state === "speaking";

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      el.dataset.visible = entry?.isIntersecting ? "true" : "false";
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = root.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    if (!active) {
      el.style.setProperty("--orb-level", "0");
      return;
    }
    const ctx = cv.getContext?.("2d");
    if (!ctx) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const small = window.matchMedia?.("(max-width: 640px), (pointer: coarse)").matches ?? false;
    const dpr = small ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const size = cv.clientWidth || 320;
    cv.width = size * dpr;
    cv.height = size * dpr;
    const styles = getComputedStyle(el);
    const colorA = styles.getPropertyValue("--orb-blue").trim() || "#5b8cff";
    const colorB = styles.getPropertyValue("--orb-violet").trim() || "#9b6bff";
    const bars = small ? 36 : 72;
    let frame = 0;
    let last = 0;
    let phase = 0;
    const draw = (t: number) => {
      frame = requestAnimationFrame(draw);
      if (small && t - last < 33) return; // ~30 fps on phones
      last = t;
      if (el.dataset.visible === "false") return;
      const lv = Math.max(0, Math.min(1, level.current));
      level.current = lv * 0.94;
      el.style.setProperty("--orb-level", lv.toFixed(3));
      phase += reduced ? 0 : 0.035;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const c = size / 2;
      const inner = size * 0.36;
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, colorA);
      grad.addColorStop(1, colorB);
      ctx.strokeStyle = grad;
      ctx.lineCap = "round";
      ctx.lineWidth = small ? 2 : 2.5;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      for (let i = 0; i < bars; i++) {
        const a = (i / bars) * Math.PI * 2;
        const wave = reduced
          ? 0.5
          : 0.5 + 0.5 * Math.sin(a * 3 + phase) * Math.sin(a * 5 - phase * 0.7);
        const len = 3 + (4 + lv * size * 0.09) * (0.35 + 0.65 * wave);
        ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
        ctx.lineTo(c + Math.cos(a) * (inner + len), c + Math.sin(a) * (inner + len));
      }
      ctx.stroke();
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, cv.width, cv.height);
      el.style.setProperty("--orb-level", "0");
    };
  }, [active, level]);

  const textures = {
    "--orb-texture": `url(${earthTexture})`,
    "--orb-texture-small": `url(${earthTextureSmall})`,
  } as CSSProperties;

  return (
    <div className="omni-orb-wrap">
      <div
        ref={root}
        className="omni-orb"
        data-state={state}
        data-muted={muted ? "true" : "false"}
        style={textures}
        role="img"
        aria-label={`${agentName} voice orb: ${ORB_STATE_TEXT[state]}${muted ? ", voice replies muted" : ""}`}
      >
        <div className="omni-orb__aura" aria-hidden />
        <canvas ref={canvas} className="omni-orb__wave" aria-hidden />
        <div className="omni-orb__globe" aria-hidden>
          <div className="omni-orb__tilt">
            <div className="omni-orb__surface" />
          </div>
          <div className="omni-orb__shade" />
        </div>
      </div>
      <p className="omni-orb__name" data-testid="orb-agent-name">
        {agentName}
      </p>
      <p className="omni-orb__status" aria-live="polite" data-testid="orb-status">
        {ORB_STATE_TEXT[state]}
        {muted ? " · voice replies muted" : ""}
      </p>
    </div>
  );
}
