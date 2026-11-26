// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
/**
 * Per-device tuning for the asteroid field.
 *
 * Mobile / low-power devices get fewer rocks, lower geometry detail and a
 * tighter size range so the field stays cheap, while the desktop numbers are
 * exactly what the scene shipped with — the visual balance on desktop is
 * unchanged.
 *
 * Every value can be overridden at runtime (without a rebuild) through
 * localStorage key `cyberlink:asteroids` holding a partial JSON object, which
 * is how the debug overlay lets us sweep density while watching the autopilot.
 */

export interface AsteroidConfig {
  /** Total rocks alive in the pooled travelling box. */
  count: number;
  /** Icosahedron subdivision level for each rock shape (0..3). */
  detail: number;
  /** Flat shading reads as faceted rock and is cheaper. */
  flatShading: boolean;
  /** Per-rock base scale range, before the depth-band multiplier. */
  minScale: number;
  maxScale: number;
  /** Half-size of the pooled box that follows the camera. */
  field: number;
  /** Rocks below this final scale are never published for avoidance. */
  avoidanceMinScale: number;
}

const DESKTOP: AsteroidConfig = {
  count: 120,
  detail: 2,
  flatShading: false,
  minScale: 0.5,
  maxScale: 2.0,
  field: 520,
  avoidanceMinScale: 1.4,
};

const TABLET: AsteroidConfig = {
  count: 70,
  detail: 1,
  flatShading: true,
  minScale: 0.5,
  maxScale: 1.7,
  field: 460,
  avoidanceMinScale: 1.4,
};

const MOBILE: AsteroidConfig = {
  count: 34,
  detail: 1,
  flatShading: true,
  minScale: 0.45,
  maxScale: 1.4,
  field: 400,
  avoidanceMinScale: 1.2,
};

export type DeviceClass = "mobile" | "tablet" | "desktop";

/** Coarse device class from viewport width + pointer type. */
export const detectDeviceClass = (): DeviceClass => {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth || 1280;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  if (w < 768 || (coarse && w < 1024)) return "mobile";
  if (w < 1280) return "tablet";
  return "desktop";
};

const readOverride = (): Partial<AsteroidConfig> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem("cyberlink:asteroids");
    return raw ? (JSON.parse(raw) as Partial<AsteroidConfig>) : {};
  } catch {
    return {};
  }
};

/**
 * Resolve the field config.
 * `full` is the existing quality flag (false on low-power / reduced-motion),
 * and it can only ever step the device class down, never up.
 */
export const resolveAsteroidConfig = (full: boolean, device = detectDeviceClass()): AsteroidConfig => {
  const base = device === "mobile" ? MOBILE : device === "tablet" ? TABLET : DESKTOP;
  const tuned: AsteroidConfig = full ? base : { ...MOBILE, count: Math.min(MOBILE.count, base.count) };
  return { ...tuned, ...readOverride() };
};

export const ASTEROID_PRESETS = { DESKTOP, TABLET, MOBILE };
