// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
/**
 * Continuous camera depth: one value shared by every world module.
 *
 * Altitude is measured in world units above the planet surface. Bands overlap
 * so content cross-fades instead of popping; `bandWeights` returns a 0..1
 * weight per band that always sums to roughly 1.
 */

export type Band = "deep" | "orbit" | "atmosphere" | "rooftop" | "street";

export const BANDS: Band[] = ["deep", "orbit", "atmosphere", "rooftop", "street"];

/** Planet radius used by the descent scene (world units). */
export const PLANET_RADIUS = 100;

/**
 * Band centres on a log10(altitude) axis. Log space keeps the descent feeling
 * even from thousands of units down to a couple of metres.
 */
const CENTRES: Record<Band, number> = {
  deep: 3.4, // ~2500 u
  orbit: 2.5, // ~320 u
  atmosphere: 1.6, // ~40 u
  rooftop: 0.6, // ~4 u
  street: -0.6, // ~0.25 u
};

/** Half-width of each band's influence in log units. */
const WIDTH = 1.05;

export const MAX_ALTITUDE = 4000;
export const MIN_ALTITUDE = 0.12;

export const logAlt = (altitude: number) =>
  Math.log10(Math.max(MIN_ALTITUDE, altitude));

/** Smooth, normalised influence of every band at a given altitude. */
export const bandWeights = (altitude: number): Record<Band, number> => {
  const l = logAlt(altitude);
  const raw = {} as Record<Band, number>;
  let sum = 0;
  for (const b of BANDS) {
    const d = Math.abs(l - CENTRES[b]) / WIDTH;
    const w = d >= 1 ? 0 : Math.pow(1 - d * d, 2); // smooth falloff
    raw[b] = w;
    sum += w;
  }
  if (sum <= 0) {
    // outside every centre — clamp to the nearest end band
    const end: Band = l > CENTRES.deep ? "deep" : "street";
    for (const b of BANDS) raw[b] = b === end ? 1 : 0;
    return raw;
  }
  for (const b of BANDS) raw[b] /= sum;
  return raw;
};

/** The band with the strongest weight — used for budgeting and streaming. */
export const dominantBand = (altitude: number): Band => {
  const w = bandWeights(altitude);
  return BANDS.reduce((best, b) => (w[b] > w[best] ? b : best), BANDS[0]);
};

/** 0 at deep space, 1 at street level — handy for fog, exposure, sky tint. */
export const descentProgress = (altitude: number) => {
  const l = logAlt(altitude);
  const hi = Math.log10(MAX_ALTITUDE);
  const lo = Math.log10(MIN_ALTITUDE);
  return Math.min(1, Math.max(0, (hi - l) / (hi - lo)));
};
