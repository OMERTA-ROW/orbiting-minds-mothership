// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
/**
 * Frame budget monitor.
 *
 * Measures real frame time and returns a 0..1 detail scale plus an effective
 * quality tier. If frames get expensive the scale steps down (and the tier can
 * drop a rung); once the scene is comfortable again it recovers slowly so the
 * user never sees it oscillate.
 */

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { stepTier, type QualityTier } from "./qualityTiers";

const TARGET_MS = 1000 / 55;
const CEILING_MS = 1000 / 32;

export interface BudgetState {
  /** exponential moving average of frame time, ms */
  ms: number;
  /** 0.25 .. 1 multiplier applied on top of the tier's detail value */
  scale: number;
  /** tier after automatic degradation */
  tier: QualityTier;
}

export const useFrameBudget = (tier: QualityTier, enabled: boolean): BudgetState => {
  const [state, setState] = useState<BudgetState>({ ms: 16, scale: 1, tier });
  const ema = useRef(16);
  const scale = useRef(1);
  const effective = useRef<QualityTier>(tier);
  const cooldown = useRef(0);
  const lastPush = useRef(0);

  useEffect(() => {
    effective.current = tier;
    scale.current = 1;
    setState({ ms: ema.current, scale: 1, tier });
  }, [tier]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const ms = Math.min(delta * 1000, 200);
    ema.current += (ms - ema.current) * 0.06;
    cooldown.current -= delta;

    if (cooldown.current > 0) return;

    let changed = false;
    if (ema.current > CEILING_MS) {
      const next = Math.max(0.25, scale.current - 0.15);
      if (next !== scale.current) {
        scale.current = next;
        changed = true;
      } else {
        const down = stepTier(effective.current, -1);
        if (down !== effective.current) {
          effective.current = down;
          scale.current = 1;
          changed = true;
        }
      }
      cooldown.current = 1.5;
    } else if (ema.current < TARGET_MS * 0.72) {
      if (scale.current < 1) {
        scale.current = Math.min(1, scale.current + 0.08);
        changed = true;
      } else if (effective.current !== tier) {
        effective.current = stepTier(effective.current, 1);
        changed = true;
      }
      cooldown.current = 3;
    }

    const now = performance.now();
    if (changed || now - lastPush.current > 1000) {
      lastPush.current = now;
      setState({ ms: ema.current, scale: scale.current, tier: effective.current });
    }
  });

  return state;
};
