// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import MiningVessel from "./MiningVessel";
import { shipTelemetry } from "./shipTelemetry";
import { ShipAutopilot } from "./shipAutopilot";
import { asteroidRegistry } from "./asteroidRegistry";
import { asteroidDebugStats, isAsteroidDebug } from "./asteroidDebug";
import { ShipPose } from "./shipPose";

/** Hull scale in the solar view; the chase camera keeps clearance from it. */
export const SOLAR_SHIP_SCALE = 7.5;

/**
 * Solar-system view: the vessel explores the system on its own.
 * There is no fixed route — an autopilot picks fresh destinations, avoids the
 * star and the planets, banks through its turns and stays inside the world.
 */
const VesselFlight = ({ animate, full }: { animate: boolean; full: boolean }) => {
  const group = useRef<THREE.Group>(null);
  const projected = useRef(new THREE.Vector3());
  const lastPublished = useRef(0);

  const pilot = useMemo(() => new ShipAutopilot(), []);
  const pose = useMemo(() => new ShipPose(), []);
  const debug = useRef(isAsteroidDebug());

  // a view switch invalidates the shared pose until this scene writes one
  useEffect(() => () => { shipTelemetry.ready = false; }, []);

  useFrame((state, delta) => {
    if (!group.current) return;
    const dt = Math.min(delta, 0.05);
    if (animate) pilot.step(dt, state.clock.elapsedTime);

    // simulation and pose first, so the chase camera never reads a stale or
    // origin-relative frame (that caused the startup position/velocity spike)
    pose.update({
      position: pilot.state.position,
      forward: pilot.state.forward,
      roll: pilot.state.roll,
      dt,
      animate,
    });

    const pos = pose.position;
    group.current.position.copy(pos);
    group.current.quaternion.copy(pose.quaternion);

    shipTelemetry.position.copy(pos);
    shipTelemetry.quaternion.copy(pose.quaternion);
    shipTelemetry.velocity.copy(pose.velocity);
    shipTelemetry.throttle = pilot.state.throttle;
    shipTelemetry.scale = SOLAR_SHIP_SCALE;
    shipTelemetry.ready = true;

    // debug telemetry (cheap plain-number copies; overlay reads it at 10Hz)
    const av = pilot.state.avoidance;
    asteroidDebugStats.tracked = asteroidRegistry.count;
    asteroidDebugStats.alive = asteroidRegistry.alive;
    asteroidDebugStats.recycled = asteroidRegistry.recycled;
    asteroidDebugStats.recycledTotal = asteroidRegistry.recycledTotal;
    asteroidDebugStats.rocksPushing = av.rocks;
    asteroidDebugStats.strength = av.strength;
    asteroidDebugStats.nearestClearance = av.nearestClearance;
    asteroidDebugStats.minClearance = av.minClearance;
    asteroidDebugStats.speed = pilot.state.velocity.length();
    asteroidDebugStats.radius = pos.length();
    asteroidDebugStats.destinationKind = pilot.state.destination.kind;
    asteroidDebugStats.legsCompleted = pilot.state.legsCompleted;

    // debug-only: expose the rendered pose so a preview run can measure the
    // frame-to-frame orientation change and camera clearance directly
    if (debug.current) {
      (window as unknown as Record<string, unknown>).__shipPose = {
        q: pose.quaternion.toArray(),
        pos: pos.toArray(),
        nose: new THREE.Vector3(0, 0, 1).applyQuaternion(pose.quaternion).toArray(),
        forward: pilot.state.forward.toArray(),
        camDistance: state.camera.position.distanceTo(pos),
        speed: pilot.state.velocity.length(),
      };
    }

    if (state.clock.elapsedTime - lastPublished.current > 0.08) {
      lastPublished.current = state.clock.elapsedTime;
      projected.current.copy(pos).project(state.camera);
      const visible = projected.current.z > -1 && projected.current.z < 1
        && Math.abs(projected.current.x) < 1.08
        && Math.abs(projected.current.y) < 1.08;
      window.dispatchEvent(new CustomEvent("cyberlink:ship-position", {
        detail: {
          x: (projected.current.x * 0.5 + 0.5) * window.innerWidth,
          y: (-projected.current.y * 0.5 + 0.5) * window.innerHeight,
          visible,
        },
      }));
    }
  });


  return (
    <group ref={group}>
      <MiningVessel animate={animate} throttle={0.62} beam={0} crew={full} scale={SOLAR_SHIP_SCALE} />
    </group>
  );
};

export default VesselFlight;
