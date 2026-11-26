// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { asteroidDebugStats, type AsteroidDebugStats } from "./asteroidDebug";

/**
 * DOM half of the temporary asteroid debug overlay: live clearance, avoidance
 * strength and recycle counters, sampled at 10Hz so it never costs a frame.
 */
const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "—");

const AsteroidDebugHud = () => {
  const [s, setS] = useState<AsteroidDebugStats>({ ...asteroidDebugStats });

  useEffect(() => {
    const id = setInterval(() => setS({ ...asteroidDebugStats }), 100);
    return () => clearInterval(id);
  }, []);

  if (typeof document === "undefined") return null;

  const easing = s.rocksPushing > 0;

  return createPortal(
    <div
      data-testid="asteroid-debug-hud"
      className="pointer-events-none fixed bottom-3 left-3 z-[9999] rounded-md border border-primary/40 bg-black/80 px-3 py-2 font-mono text-[11px] leading-tight text-primary shadow-[0_0_18px_hsl(var(--primary)/0.25)]"
    >
      <div className="mb-1 font-semibold tracking-wide">ASTEROID DEBUG</div>
      <div>device {s.device} · rocks {s.count} (alive {s.alive})</div>
      <div>tracked {s.tracked} · recycled {s.recycled}/frame, {s.recycledTotal} total</div>
      <div className={easing ? "text-amber-400" : undefined}>
        {easing ? `EASING around ${s.rocksPushing} rock(s) · w ${s.strength.toFixed(2)}` : "clear · no avoidance"}
      </div>
      <div>nearest clearance {fmt(s.nearestClearance)} · min ever {fmt(s.minClearance)}</div>
      <div>speed {fmt(s.speed)} · radius {fmt(s.radius)} · legs {s.legsCompleted} · {s.destinationKind}</div>
    </div>,
    document.body,
  );
};

export default AsteroidDebugHud;
