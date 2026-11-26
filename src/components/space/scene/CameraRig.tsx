// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { marketPulse } from "./useMarketPulse";
import { WORLD_SCALE } from "../worldScale";

/**
 * Slow continuous orbital travel. The camera rides a wide, gently precessing
 * path through the system, easing its look direction and banking into turns.
 * Speed lifts slightly with market volatility.
 */
const CameraRig = ({ animate }: { animate: boolean }) => {
  const { camera } = useThree();
  const t = useRef(0);
  const look = useRef(new THREE.Vector3(0, 0, 0));
  const prev = useRef(new THREE.Vector3());
  const vel = useRef(new THREE.Vector3());
  const tmp = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  const upTarget = useRef(new THREE.Vector3(0, 1, 0));
  const up = useRef(new THREE.Vector3(0, 1, 0));

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const speed = 1 + marketPulse.volatility * 0.45;
    if (animate) t.current += dt * 0.0065 * speed;
    const a = t.current;

    // wide precessing orbit around the star, well outside the inner bodies
    const r = (210 + Math.sin(a * 0.37) * 78) * WORLD_SCALE;
    const pointerX = animate ? state.pointer.x * 12 * WORLD_SCALE : 0;
    const pointerY = animate ? state.pointer.y * 7 * WORLD_SCALE : 0;
    const pos = tmp.current.set(
      Math.cos(a) * r + pointerX,
      Math.sin(a * 0.53) * 46 * WORLD_SCALE + 18 * WORLD_SCALE + pointerY,
      Math.sin(a) * r * 0.86,
    );

    prev.current.copy(camera.position);
    camera.position.lerp(pos, animate ? 1 - Math.exp(-0.72 * dt) : 1);
    vel.current.subVectors(camera.position, prev.current);

    // ease the aim point ahead of the travel direction, biased at the star
    const ahead = 0.9;
    target.current.set(
      Math.cos(a + ahead) * r * 0.12,
      Math.sin(a * 0.53 + ahead) * 10 * WORLD_SCALE,
      Math.sin(a + ahead) * r * 0.1,
    );
    look.current.lerp(target.current, 1 - Math.exp(-0.48 * dt));

    // bank into the turn instead of snapping
    const bank = THREE.MathUtils.clamp(vel.current.x * 0.6, -0.22, 0.22);
    upTarget.current.set(Math.sin(bank), Math.cos(bank), 0);
    up.current.lerp(upTarget.current, 1 - Math.exp(-0.55 * dt));
    camera.up.copy(up.current);
    camera.lookAt(look.current);
  });

  return null;
};

export default CameraRig;
