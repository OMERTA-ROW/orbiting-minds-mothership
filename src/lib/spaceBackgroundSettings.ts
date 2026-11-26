// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useSyncExternalStore } from "react";
import { detectTier, type QualityTier } from "@/components/space/world/qualityTiers";

export type SpaceBgMode = "full" | "lite" | "off";
/** solar = realistic solar system (default), mining = alien world, descent = Earth approach */
export type SpaceBgView = "solar" | "mining" | "descent";
/** camera vantage point inside the solar view */
export type SpaceBgCamera = "galaxy" | "chase" | "orbit";
/** auto = pick from a device probe, otherwise an explicit tier */
export type SpaceBgQuality = "auto" | QualityTier;

export interface SpaceBgSettings {
  /** full = 3D solar system, lite = cheap starfield, off = static gradient only */
  mode: SpaceBgMode;
  /** which scene the background renders */
  view: SpaceBgView;
  /** where the camera sits inside the solar view */
  camera: SpaceBgCamera;
  /** detail/performance tier for the world scenes */
  quality: SpaceBgQuality;
  /** 0 = background at full brightness, 1 = fully dimmed to flat colour */
  dim: number;
}

const STORAGE_KEY = "cyberlink.space-bg";

const VIEWS = ["solar", "mining", "descent"] as const;
const CAMERAS = ["galaxy", "chase", "orbit"] as const;
const QUALITIES = ["auto", "ultra", "high", "balanced", "battery"] as const;

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Rough capability probe for phones / integrated GPUs / low-memory devices. */
export const isLowPowerDevice = () => {
  if (typeof window === "undefined") return true;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const smallScreen = window.matchMedia("(max-width: 900px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const fewCores = (nav.hardwareConcurrency ?? 8) <= 4;
  const lowMem = (nav.deviceMemory ?? 8) <= 4;
  return (smallScreen && coarse) || fewCores || lowMem;
};

/** Resolve the stored preference into a concrete tier. */
export const resolveQuality = (q: SpaceBgQuality): QualityTier =>
  q === "auto" ? detectTier() : q;

const defaults = (): SpaceBgSettings => ({
  mode: prefersReducedMotion() ? "off" : isLowPowerDevice() ? "lite" : "full",
  view: "solar",
  camera: "galaxy",
  quality: "auto",
  dim: 0.12,
});

let state: SpaceBgSettings = (() => {
  if (typeof window === "undefined")
    return { mode: "off", view: "solar", camera: "galaxy", quality: "auto", dim: 0.35 } as SpaceBgSettings;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<SpaceBgSettings>;
    const base = defaults();
    return {
      mode: (["full", "lite", "off"] as const).includes(parsed.mode as SpaceBgMode)
        ? (parsed.mode as SpaceBgMode)
        : base.mode,
      view: VIEWS.includes(parsed.view as SpaceBgView) ? (parsed.view as SpaceBgView) : "solar",
      camera: CAMERAS.includes(parsed.camera as SpaceBgCamera)
        ? (parsed.camera as SpaceBgCamera)
        : "galaxy",
      quality: QUALITIES.includes(parsed.quality as SpaceBgQuality)
        ? (parsed.quality as SpaceBgQuality)
        : "auto",
      dim: typeof parsed.dim === "number" ? Math.min(1, Math.max(0, parsed.dim)) : base.dim,
    };
  } catch {
    return defaults();
  }
})();


const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const setSpaceBgSettings = (patch: Partial<SpaceBgSettings>) => {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable */
  }
  emit();
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

const getSnapshot = () => state;

export const useSpaceBgSettings = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
