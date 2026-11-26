// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
/**
 * Temporary debug instrumentation for the asteroid field.
 *
 * Off by default. Turn it on with `?asteroidDebug=1` in the URL, or by setting
 * localStorage `cyberlink:asteroidDebug` to `1`. It draws the avoidance radius
 * around every rock the autopilot can see and prints live clearance numbers so
 * near-collisions and steering jitter are visible rather than guessed at.
 */

export interface AsteroidDebugStats {
  /** Rocks published for avoidance this frame. */
  tracked: number;
  /** Total rocks alive in the pooled field. */
  alive: number;
  /** Rocks recycled to the far side of the box this frame / since launch. */
  recycled: number;
  recycledTotal: number;
  /** Rocks currently bending the heading. */
  rocksPushing: number;
  /** Combined steering weight (0 = flying straight). */
  strength: number;
  /** Surface gap to the closest tracked rock. */
  nearestClearance: number;
  /** Smallest gap seen since launch — the near-collision watermark. */
  minClearance: number;
  /** Ship speed and distance from the world centre. */
  speed: number;
  radius: number;
  destinationKind: string;
  legsCompleted: number;
  device: string;
  count: number;
}

export const asteroidDebugStats: AsteroidDebugStats = {
  tracked: 0,
  alive: 0,
  recycled: 0,
  recycledTotal: 0,
  rocksPushing: 0,
  strength: 0,
  nearestClearance: Infinity,
  minClearance: Infinity,
  speed: 0,
  radius: 0,
  destinationKind: "deep_space",
  legsCompleted: 0,
  device: "desktop",
  count: 0,
};

export const isAsteroidDebug = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("asteroidDebug") === "1") return true;
    return window.localStorage.getItem("cyberlink:asteroidDebug") === "1";
  } catch {
    return false;
  }
};
