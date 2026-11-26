// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { asteroidRegistry } from "./asteroidRegistry";
import { asteroidDebugStats } from "./asteroidDebug";
import { shipTelemetry } from "./shipTelemetry";

/**
 * In-scene half of the asteroid debug overlay.
 * Draws a wireframe sphere at the avoidance radius of every rock the autopilot
 * tracks — cyan when it is being ignored, warm when it is actively bending the
 * ship's heading — plus a ring at the ship marking its own reaction range.
 */

const MAX = 48;
/** Matches the autopilot: rocks steer the ship inside (radius + 26) * 3. */
const REACT = (radius: number) => (radius + 26) * 3;

const AsteroidDebug = () => {
  const rings = useRef<THREE.InstancedMesh>(null);
  const shell = useRef<THREE.Mesh>(null);

  const scratch = useMemo(
    () => ({ dummy: new THREE.Object3D(), hot: new THREE.Color("#ff9a3c"), cold: new THREE.Color("#38bdf8") }),
    [],
  );
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  const colours = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3), []);

  useFrame(() => {
    const inst = rings.current;
    if (!inst) return;
    if (!inst.instanceColor) inst.instanceColor = colours;

    const n = Math.min(asteroidRegistry.count, MAX);
    for (let i = 0; i < n; i++) {
      const c = asteroidRegistry.centers[i];
      const react = REACT(asteroidRegistry.radii[i]);
      scratch.dummy.position.copy(c);
      scratch.dummy.rotation.set(0, 0, 0);
      scratch.dummy.scale.setScalar(react);
      scratch.dummy.updateMatrix();
      inst.setMatrixAt(i, scratch.dummy.matrix);

      const pushing = shipTelemetry.position.distanceTo(c) < react;
      const col = pushing ? scratch.hot : scratch.cold;
      colours.setXYZ(i, col.r, col.g, col.b);
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    colours.needsUpdate = true;

    if (shell.current) {
      shell.current.position.copy(shipTelemetry.position);
      const mat = shell.current.material as THREE.MeshBasicMaterial;
      mat.color.set(asteroidDebugStats.rocksPushing > 0 ? "#ff9a3c" : "#38bdf8");
      mat.opacity = asteroidDebugStats.rocksPushing > 0 ? 0.55 : 0.18;
    }
  });

  return (
    <>
      <instancedMesh ref={rings} args={[geometry, undefined as never, MAX]} frustumCulled={false}>
        <meshBasicMaterial vertexColors wireframe transparent opacity={0.28} depthWrite={false} />
      </instancedMesh>
      <mesh ref={shell}>
        <sphereGeometry args={[26, 16, 12]} />
        <meshBasicMaterial wireframe transparent opacity={0.18} depthWrite={false} color="#38bdf8" />
      </mesh>
    </>
  );
};

export default AsteroidDebug;
