// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import * as THREE from "three";
import { BODIES, orbitPoint } from "./Planets";
import { TRAVEL_RADIUS } from "../worldScale";
import { asteroidRegistry } from "./asteroidRegistry";

/**
 * Lightweight local autopilot for the vessel.
 *
 * No fixed route and no repeating loop: the ship picks its own destinations,
 * remembers where it has recently been, steers with real acceleration and
 * banking, keeps clearance from the star and the planets, and turns itself
 * back inside the world instead of wrapping or teleporting.
 *
 * Pure simulation (no three.js scene access), so it can be unit tested.
 */

const STAR_RADIUS = 16;
const STAR_CLEARANCE = 130;
/** How far outside a planet's surface the ship insists on staying. */
const PLANET_CLEARANCE = 9;
/** Soft boundary: steering starts pulling inward here. */
export const SOFT_BOUNDARY = TRAVEL_RADIUS;
/** Hard boundary: the ship is never allowed past this. */
export const HARD_BOUNDARY = TRAVEL_RADIUS * 1.18;

const CRUISE_SPEED = 120;          // units / second at full cruise
const ACCEL = 26;                  // units / second^2
const BRAKE = 34;
const TURN_RATE = 0.55;            // radians / second of heading change
const ARRIVE_RADIUS = 90;
const SLOWDOWN_RADIUS = 420;
/** Give up on a destination that is taking too long — never circle forever. */
const MAX_LEG_SECONDS = 95;
const MEMORY = 6;
/** A new destination must be this far from every remembered one. */
const MEMORY_SPACING = TRAVEL_RADIUS * 0.55;

export type DestinationKind = "deep_space" | "point_of_interest";

export interface Destination {
  point: THREE.Vector3;
  kind: DestinationKind;
  /** Body name when investigating a celestial point of interest. */
  body?: string;
}

/** Small deterministic PRNG so tests can replay an exploration run. */
const makeRandom = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

export interface AutopilotState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  forward: THREE.Vector3;
  destination: Destination;
  /** Signed bank angle in radians, driven by lateral acceleration. */
  roll: number;
  throttle: number;
  legSeconds: number;
  visited: THREE.Vector3[];
  /** Destinations completed since start — used by tests and telemetry. */
  legsCompleted: number;
  /** True while the ship is loitering around a point of interest. */
  investigating: boolean;
  /** Debug/telemetry view of the asteroid avoidance behaviour. */
  avoidance: {
    /** Rocks currently pushing on the heading. */
    rocks: number;
    /** Combined steering weight applied this frame (0 = clear). */
    strength: number;
    /** Surface gap to the closest published rock, or Infinity. */
    nearestClearance: number;
    /** Smallest surface gap seen since launch. */
    minClearance: number;
  };
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const bodyPos = new THREE.Vector3();

/** World position of every obstacle at time `t`, radius included. */
export const obstaclesAt = (t: number): { center: THREE.Vector3; radius: number }[] => {
  const list = [{ center: new THREE.Vector3(0, 0, 0), radius: STAR_RADIUS + STAR_CLEARANCE }];
  for (const b of BODIES) {
    const c = orbitPoint(b, t, new THREE.Vector3());
    list.push({ center: c, radius: b.radius + PLANET_CLEARANCE });
  }
  return list;
};

export class ShipAutopilot {
  readonly state: AutopilotState;
  private rand: () => number;

  constructor(seed = 20260913, start?: THREE.Vector3) {
    this.rand = makeRandom(seed);
    const position = start ? start.clone() : new THREE.Vector3(-TRAVEL_RADIUS * 0.6, 120, TRAVEL_RADIUS * 0.45);
    this.state = {
      position,
      velocity: new THREE.Vector3(0, 0, -1).multiplyScalar(CRUISE_SPEED * 0.35),
      forward: new THREE.Vector3(0, 0, -1),
      destination: { point: new THREE.Vector3(), kind: "deep_space" },
      roll: 0,
      throttle: 0.4,
      legSeconds: 0,
      visited: [],
      legsCompleted: 0,
      investigating: false,
      avoidance: { rocks: 0, strength: 0, nearestClearance: Infinity, minClearance: Infinity },
    };
    this.state.destination = this.pickDestination(0);
  }

  /** Choose somewhere new: either open space or a body worth investigating. */
  pickDestination(t: number): Destination {
    const wantBody = this.rand() < 0.45;
    let best: Destination | null = null;
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < 14; attempt++) {
      let candidate: Destination;
      if (wantBody || attempt > 9) {
        const b = BODIES[Math.floor(this.rand() * BODIES.length) % BODIES.length];
        orbitPoint(b, t, bodyPos);
        const off = new THREE.Vector3(this.rand() - 0.5, (this.rand() - 0.5) * 0.5, this.rand() - 0.5)
          .normalize()
          .multiplyScalar(b.radius * 4 + 70);
        candidate = { point: bodyPos.clone().add(off), kind: "point_of_interest", body: b.name };
      } else {
        const r = TRAVEL_RADIUS * (0.35 + this.rand() * 0.62);
        const theta = this.rand() * Math.PI * 2;
        const phi = (this.rand() - 0.5) * 0.9;
        candidate = {
          point: new THREE.Vector3(
            Math.cos(theta) * Math.cos(phi) * r,
            Math.sin(phi) * r * 0.55,
            Math.sin(theta) * Math.cos(phi) * r,
          ),
          kind: "deep_space",
        };
      }

      if (candidate.point.length() > SOFT_BOUNDARY) candidate.point.setLength(SOFT_BOUNDARY * 0.95);

      // score: far from the ship and far from everywhere it has recently been
      let score = candidate.point.distanceTo(this.state.position) * 0.35;
      let tooClose = false;
      for (const v of this.state.visited) {
        const d = candidate.point.distanceTo(v);
        if (d < MEMORY_SPACING) tooClose = true;
        score += Math.min(d, MEMORY_SPACING * 2);
      }
      if (!tooClose && score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    const chosen =
      best ?? {
        point: new THREE.Vector3(
          (this.rand() - 0.5) * TRAVEL_RADIUS * 1.4,
          (this.rand() - 0.5) * TRAVEL_RADIUS * 0.5,
          (this.rand() - 0.5) * TRAVEL_RADIUS * 1.4,
        ),
        kind: "deep_space" as const,
      };

    this.state.visited.push(chosen.point.clone());
    if (this.state.visited.length > MEMORY) this.state.visited.shift();
    this.state.legSeconds = 0;
    this.state.investigating = false;
    return chosen;
  }

  /** Advance the simulation. `t` is scene time, used for orbiting obstacles. */
  step(dt: number, t: number) {
    const s = this.state;
    s.legSeconds += dt;

    const toTarget = tmpA.subVectors(s.destination.point, s.position);
    const distance = toTarget.length();

    if (distance < ARRIVE_RADIUS || s.legSeconds > MAX_LEG_SECONDS) {
      if (s.destination.kind === "point_of_interest" && !s.investigating && distance < ARRIVE_RADIUS) {
        // slide past the body once before moving on, rather than orbiting it
        s.investigating = true;
        s.destination = {
          ...s.destination,
          point: s.destination.point
            .clone()
            .add(tmpB.copy(s.velocity).setLength(260).add(new THREE.Vector3(0, 60, 0))),
        };
      } else {
        s.legsCompleted += 1;
        s.destination = this.pickDestination(t);
      }
      toTarget.subVectors(s.destination.point, s.position);
    }

    const desiredDir = toTarget.clone().normalize();

    // --- obstacle avoidance: steer around anything close to our path ---
    for (const o of obstaclesAt(t)) {
      const away = tmpB.subVectors(s.position, o.center);
      const d = away.length();
      const safe = o.radius + 45;
      if (d < safe * 2.4 && d > 0.001) {
        const weight = Math.min(3.2, (safe * 2.4) / Math.max(d - safe * 0.5, 1));
        desiredDir.addScaledVector(away.normalize(), weight);
      }
    }

    // --- asteroids: ease around rocks the field has placed nearby ---
    let rocksPushing = 0;
    let pushStrength = 0;
    let nearestClearance = Infinity;
    for (let i = 0; i < asteroidRegistry.count; i++) {
      const away = tmpB.subVectors(s.position, asteroidRegistry.centers[i]);
      const d = away.length();
      const radius = asteroidRegistry.radii[i];
      const safe = radius + 26;
      const clearance = d - radius;
      if (clearance < nearestClearance) nearestClearance = clearance;
      if (d < safe * 3 && d > 0.001) {
        // smooth falloff: no jitter when a rock drifts in and out of range
        const f = 1 - d / (safe * 3);
        const w = f * f * 1.6;
        rocksPushing++;
        pushStrength += w;
        desiredDir.addScaledVector(away.normalize(), w);
      }
    }
    s.avoidance.rocks = rocksPushing;
    s.avoidance.strength = pushStrength;
    s.avoidance.nearestClearance = nearestClearance;
    if (nearestClearance < s.avoidance.minClearance) s.avoidance.minClearance = nearestClearance;

    // --- boundary: gentle inward bias, never a hard stop or wrap ---
    const radial = s.position.length();
    if (radial > SOFT_BOUNDARY * 0.85) {
      const over = (radial - SOFT_BOUNDARY * 0.85) / (HARD_BOUNDARY - SOFT_BOUNDARY * 0.85);
      desiredDir.addScaledVector(tmpB.copy(s.position).normalize().negate(), Math.min(over, 1) * 3);
    }
    desiredDir.normalize();

    // --- heading: turn at a limited rate so movement is continuous ---
    const angle = s.forward.angleTo(desiredDir);
    if (angle > 1e-4) {
      const maxTurn = TURN_RATE * dt;
      const q = new THREE.Quaternion().setFromUnitVectors(s.forward.clone(), desiredDir);
      if (angle > maxTurn) {
        q.slerp(new THREE.Quaternion(), 1 - maxTurn / angle);
      }
      s.forward.applyQuaternion(q).normalize();
    }

    // --- speed: accelerate to cruise, ease off approaching a destination ---
    const targetSpeed =
      distance < SLOWDOWN_RADIUS
        ? THREE.MathUtils.lerp(CRUISE_SPEED * 0.28, CRUISE_SPEED, distance / SLOWDOWN_RADIUS)
        : CRUISE_SPEED;
    const speed = s.velocity.length();
    const nextSpeed =
      speed < targetSpeed
        ? Math.min(targetSpeed, speed + ACCEL * dt)
        : Math.max(targetSpeed, speed - BRAKE * dt);
    s.velocity.copy(s.forward).multiplyScalar(nextSpeed);
    s.throttle = THREE.MathUtils.clamp(nextSpeed / CRUISE_SPEED, 0.15, 1);

    s.position.addScaledVector(s.velocity, dt);

    // hard containment without teleporting: clamp position, bleed outward speed
    if (s.position.length() > HARD_BOUNDARY) {
      s.position.setLength(HARD_BOUNDARY);
      const inward = s.position.clone().normalize().negate();
      s.forward.lerp(inward, 0.08).normalize();
    }

    // --- banking: roll into the turn, level out on straight runs ---
    const lateral = angle > 1e-4 ? THREE.MathUtils.clamp(angle * 3.2, -1.2, 1.2) : 0;
    const sign = Math.sign(
      new THREE.Vector3().crossVectors(s.forward, desiredDir).dot(new THREE.Vector3(0, 1, 0)),
    );
    const targetRoll = -lateral * (sign || 0) * 0.55;
    s.roll += (targetRoll - s.roll) * Math.min(1, dt * 1.6);
  }
}
