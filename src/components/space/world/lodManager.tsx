// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
/**
 * LOD + streaming manager.
 *
 * Holds the live camera altitude, resolves it into overlapping detail bands and
 * publishes a per-frame detail budget that every world module reads. Modules
 * declare what they show per band; anything whose band weight falls to zero is
 * unmounted, so memory stays flat as the camera descends.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
} from "react";
import { useFrame } from "@react-three/fiber";
import {
  BANDS,
  bandWeights,
  descentProgress,
  dominantBand,
  type Band,
} from "./altitude";
import { TIERS, type QualityTier, type TierConfig } from "./qualityTiers";
import { useFrameBudget } from "./frameBudget";

export interface LodValue {
  /** altitude above the surface, world units (read per frame, not reactive) */
  altitudeRef: MutableRefObject<number>;
  /** reactive-but-throttled altitude, for mount/unmount decisions */
  altitude: number;
  weights: Record<Band, number>;
  band: Band;
  /** 0 deep space .. 1 street */
  progress: number;
  tier: QualityTier;
  cfg: TierConfig;
  /** tier detail x frame-budget scale */
  detail: number;
  frameMs: number;
  /** scale a module's own base count by the current budget */
  count: (base: number) => number;
  /** true when this band is close enough to be worth keeping resident */
  resident: (band: Band) => boolean;
}

const LodContext = createContext<LodValue | null>(null);

export const useLod = () => {
  const ctx = useContext(LodContext);
  if (!ctx) throw new Error("useLod must be used inside <LodProvider>");
  return ctx;
};

interface Props {
  tier: QualityTier;
  altitudeRef: MutableRefObject<number>;
  animate: boolean;
  children: ReactNode;
}

export const LodProvider = ({ tier, altitudeRef, animate, children }: Props) => {
  const budget = useFrameBudget(tier, animate);
  const [altitude, setAltitude] = useState(altitudeRef.current);
  const lastPush = useRef(altitudeRef.current);

  useFrame(() => {
    const a = altitudeRef.current;
    // push a React update only when the altitude moved enough to change LOD
    const ratio = a / Math.max(0.0001, lastPush.current);
    if (ratio > 1.12 || ratio < 0.89) {
      lastPush.current = a;
      setAltitude(a);
    }
  });

  const cfg = TIERS[budget.tier];
  const detail = cfg.detail * budget.scale;

  const weights = useMemo(() => bandWeights(altitude), [altitude]);
  const band = useMemo(() => dominantBand(altitude), [altitude]);
  const progress = useMemo(() => descentProgress(altitude), [altitude]);

  const count = useCallback(
    (base: number) => Math.max(1, Math.round(base * detail)),
    [detail],
  );

  const resident = useCallback(
    (b: Band) => {
      if (weights[b] > 0.01) return true;
      // keep the neighbouring bands warm up to the tier's cross-fade depth
      const i = BANDS.indexOf(b);
      const dom = BANDS.indexOf(band);
      return Math.abs(i - dom) < cfg.residentBands;
    },
    [weights, band, cfg.residentBands],
  );

  const value = useMemo<LodValue>(
    () => ({
      altitudeRef,
      altitude,
      weights,
      band,
      progress,
      tier: budget.tier,
      cfg,
      detail,
      frameMs: budget.ms,
      count,
      resident,
    }),
    [altitudeRef, altitude, weights, band, progress, budget.tier, budget.ms, cfg, detail, count, resident],
  );

  return <LodContext.Provider value={value}>{children}</LodContext.Provider>;
};
