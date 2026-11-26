// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
/**
 * Quality tiers for the multiverse background.
 *
 * A tier is the single knob every world module reads to decide how much it may
 * spend: instance counts, texture resolution, shadow/effect usage and pixel
 * ratio. Tiers are picked automatically from a device probe and can be
 * overridden by the user in the background popover.
 */

export type QualityTier = "ultra" | "high" | "balanced" | "battery";

export interface TierConfig {
  /** upper bound on renderer pixel ratio */
  dpr: number;
  /** longest side for procedurally generated textures */
  texture: number;
  /** anisotropy cap for streamed surface maps */
  anisotropy: number;
  /** total instanced objects the streaming manager may keep resident */
  instanceBudget: number;
  /** post-processing allowed at all */
  effects: boolean;
  /** how many detail bands may stay resident at once (cross-fade depth) */
  residentBands: number;
  /** multiplier applied to every module's own detail counts */
  detail: number;
}

export const TIERS: Record<QualityTier, TierConfig> = {
  ultra: {
    dpr: 2,
    texture: 2048,
    anisotropy: 8,
    instanceBudget: 60000,
    effects: true,
    residentBands: 3,
    detail: 1,
  },
  high: {
    dpr: 1.5,
    texture: 1024,
    anisotropy: 4,
    instanceBudget: 30000,
    effects: true,
    residentBands: 2,
    detail: 0.7,
  },
  balanced: {
    dpr: 1.25,
    texture: 512,
    anisotropy: 2,
    instanceBudget: 12000,
    effects: false,
    residentBands: 2,
    detail: 0.42,
  },
  battery: {
    dpr: 1,
    texture: 256,
    anisotropy: 1,
    instanceBudget: 4000,
    effects: false,
    residentBands: 1,
    detail: 0.22,
  },
};

export const TIER_ORDER: QualityTier[] = ["battery", "balanced", "high", "ultra"];

/** One step down / up the ladder, clamped at the ends. */
export const stepTier = (tier: QualityTier, dir: -1 | 1): QualityTier => {
  const i = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.min(TIER_ORDER.length - 1, Math.max(0, i + dir))];
};

/** Rough capability probe — errs on the safe side for phones. */
export const detectTier = (): QualityTier => {
  if (typeof window === "undefined") return "battery";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = window.matchMedia("(max-width: 900px)").matches;

  if (coarse && small) return cores >= 8 && mem >= 6 ? "balanced" : "battery";
  if (cores >= 12 && mem >= 8) return "ultra";
  if (cores >= 8 && mem >= 8) return "high";
  if (cores >= 4 && mem >= 4) return "balanced";
  return "battery";
};
