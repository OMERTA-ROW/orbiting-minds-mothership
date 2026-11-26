// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { BODIES, orbitPoint } from "./Planets";

/**
 * Orbital vantage point: the camera rides a slow circle around one planet,
 * keeping the body framed while the system keeps moving behind it.
 * Nothing in the scene changes — this is only where the camera sits.
 */
const PlanetOrbitCamera = ({ animate }: { animate: boolean }) => {
  const { camera } = useThree();
  const body = useMemo(() => BODIES.find((b) => b.name === "terra") ?? BODIES[0], []);
  const planet = useRef(new THREE.Vector3());
  const desired = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  const t = useRef(0);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    if (animate) t.current += dt * 0.09;
    const a = t.current;

    orbitPoint(body, state.clock.elapsedTime, planet.current);

    const r = body.radius * 5.4;
    desired.current.set(
      planet.current.x + Math.cos(a) * r,
      planet.current.y + body.radius * 1.35 + Math.sin(a * 0.6) * body.radius * 0.6,
      planet.current.z + Math.sin(a) * r,
    );

    camera.position.lerp(desired.current, animate ? 1 - Math.exp(-2.2 * dt) : 1);
    look.current.lerp(planet.current, animate ? 1 - Math.exp(-3.0 * dt) : 1);
    camera.up.set(0, 1, 0);
    camera.lookAt(look.current);
  });

  return null;
};

export default PlanetOrbitCamera;
