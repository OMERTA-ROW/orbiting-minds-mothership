// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MINING_SHIP_SCALE, shipTelemetry } from "./shipTelemetry";

/**
 * Cinematic chase camera for the alien-world view. It trails the vessel from
 * behind and above, easing into position, banking with the ship and drifting
 * to a wider framing while the ship is stationary and mining.
 */
const OFFSETS: Record<string, THREE.Vector3> = {
  travel: new THREE.Vector3(0, 6, -26),
  approach: new THREE.Vector3(9, 7, -24),
  landing: new THREE.Vector3(12, 8, -20),
  docked: new THREE.Vector3(16, 7, -18),
  mining: new THREE.Vector3(18, 10, -18),
  conquest: new THREE.Vector3(-16, 12, -22),
  combat: new THREE.Vector3(14, 9, -26),
  departure: new THREE.Vector3(-8, 8, -28),
};

/** Offsets were framed against the mining hull; keep that clearance in proportion. */
export const clearanceFactor = (scale: number) =>
  THREE.MathUtils.clamp((scale || MINING_SHIP_SCALE) / MINING_SHIP_SCALE, 1, 6);

const ShipChaseCamera = ({ animate }: { animate: boolean }) => {
  const { camera } = useThree();
  const desired = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  const shake = useRef(new THREE.Vector3());
  const ready = useRef(false);

  useFrame((state, delta) => {
    // wait for a real ship pose; framing the group at the origin first caused
    // a startup position/velocity spike and a long fly-in
    if (!shipTelemetry.ready) {
      ready.current = false; // re-snap after a view switch
      return;
    }
    const dt = Math.min(delta, 0.05);
    const off = OFFSETS[shipTelemetry.phase] ?? OFFSETS.travel;
    const factor = clearanceFactor(shipTelemetry.scale);

    desired.current
      .copy(off)
      .multiplyScalar(factor)
      .applyQuaternion(shipTelemetry.quaternion)
      .add(shipTelemetry.position);

    // light engine shake, scaled by throttle, never enough to feel jittery
    const t = state.clock.elapsedTime;
    const amp = animate ? shipTelemetry.throttle * 0.09 * factor : 0;
    shake.current.set(Math.sin(t * 21.3) * amp, Math.sin(t * 17.1) * amp, Math.sin(t * 13.7) * amp);
    desired.current.add(shake.current);

    target.current.copy(shipTelemetry.position).addScaledVector(shipTelemetry.velocity, 4);

    if (!ready.current) {
      // snap on the first frame / after a mode switch instead of flying in
      camera.position.copy(desired.current);
      look.current.copy(target.current);
      ready.current = true;
    } else {
      camera.position.lerp(desired.current, 1 - Math.exp(-2.1 * dt));
      look.current.lerp(target.current, 1 - Math.exp(-2.6 * dt));
    }

    camera.up.set(0, 1, 0);
    camera.lookAt(look.current);
  });

  return null;
};

export default ShipChaseCamera;
