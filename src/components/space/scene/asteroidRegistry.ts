// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import * as THREE from "three";

/**
 * Frame-updated list of the larger nearby asteroids.
 * AsteroidField writes it; the ship autopilot reads it so it can ease around
 * rocks in its path. Fixed-size pool — no allocation per frame.
 */
const MAX = 48;

export const asteroidRegistry = {
  centers: Array.from({ length: MAX }, () => new THREE.Vector3()),
  radii: new Float32Array(MAX),
  /** Rocks published for avoidance this frame. */
  count: 0,
  /** Total rocks alive in the pooled field. */
  alive: 0,
  /** Rocks recycled to the far side of the box this frame. */
  recycled: 0,
  /** Running total of recycles — used by the debug overlay. */
  recycledTotal: 0,
};
