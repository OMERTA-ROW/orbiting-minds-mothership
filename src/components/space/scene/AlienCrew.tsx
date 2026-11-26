// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { dracoSkinMaps, greySkinMaps } from "./procTextures";

/**
 * Procedurally built alien crew: a Draco (tall, scaled, crested reptilian) and
 * Greys (slight, large-craniumed, smooth-skinned). Both are real 3D meshes with
 * PBR skin maps and idle motion, not sprites.
 */

const useDracoMaterial = () => {
  const maps = useMemo(() => dracoSkinMaps(), []);
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        ...maps,
        color: new THREE.Color("#8fbf7a"),
        roughness: 0.62,
        metalness: 0.06,
        normalScale: new THREE.Vector2(1.1, 1.1),
      }),
    [maps],
  );
};

const useGreyMaterial = () => {
  const maps = useMemo(() => greySkinMaps(), []);
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        ...maps,
        color: new THREE.Color("#cfd6dc"),
        roughness: 0.42,
        metalness: 0.02,
        normalScale: new THREE.Vector2(0.5, 0.5),
      }),
    [maps],
  );
};

const eyeMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color("#05070a"),
  roughness: 0.08,
  metalness: 0.3,
});

const dracoEyeMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color("#f4b032"),
  emissive: new THREE.Color("#c96a08"),
  emissiveIntensity: 1.6,
  roughness: 0.15,
});

const suitMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color("#1b2129"),
  roughness: 0.5,
  metalness: 0.55,
});

interface CrewProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  animate?: boolean;
  /** small phase offset so a crew doesn't breathe in lockstep */
  seed?: number;
}

export const Draco = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, animate = true, seed = 0 }: CrewProps) => {
  const skin = useDracoMaterial();
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime + seed;
    if (body.current) body.current.position.y = Math.sin(t * 0.9) * 0.012;
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 0.32) * 0.28;
      head.current.rotation.x = Math.sin(t * 0.47) * 0.08;
    }
  });

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <group ref={body}>
        {/* torso */}
        <mesh material={skin} position={[0, 0.62, 0]} castShadow>
          <capsuleGeometry args={[0.19, 0.42, 8, 24]} />
        </mesh>
        {/* chest plate */}
        <mesh material={suitMaterial} position={[0, 0.68, 0.14]}>
          <boxGeometry args={[0.3, 0.34, 0.1]} />
        </mesh>
        {/* hips + legs */}
        <mesh material={skin} position={[-0.1, 0.2, 0]}>
          <capsuleGeometry args={[0.08, 0.3, 6, 16]} />
        </mesh>
        <mesh material={skin} position={[0.1, 0.2, 0]}>
          <capsuleGeometry args={[0.08, 0.3, 6, 16]} />
        </mesh>
        {/* arms */}
        <mesh material={skin} position={[-0.26, 0.66, 0.02]} rotation={[0.2, 0, 0.35]}>
          <capsuleGeometry args={[0.06, 0.34, 6, 16]} />
        </mesh>
        <mesh material={skin} position={[0.26, 0.66, 0.02]} rotation={[0.2, 0, -0.35]}>
          <capsuleGeometry args={[0.06, 0.34, 6, 16]} />
        </mesh>
        {/* tail */}
        <mesh material={skin} position={[0, 0.34, -0.26]} rotation={[1.15, 0, 0]}>
          <coneGeometry args={[0.09, 0.72, 12]} />
        </mesh>

        <group ref={head} position={[0, 1.0, 0]}>
          {/* elongated reptilian skull */}
          <mesh material={skin} scale={[1, 0.92, 1.35]}>
            <sphereGeometry args={[0.16, 28, 24]} />
          </mesh>
          {/* snout */}
          <mesh material={skin} position={[0, -0.03, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.09, 0.2, 14]} />
          </mesh>
          {/* brow crest */}
          <mesh material={skin} position={[0, 0.12, -0.02]} rotation={[0.35, 0, 0]}>
            <coneGeometry args={[0.1, 0.26, 3]} />
          </mesh>
          {/* eyes */}
          <mesh material={dracoEyeMaterial} position={[-0.09, 0.03, 0.14]}>
            <sphereGeometry args={[0.033, 16, 16]} />
          </mesh>
          <mesh material={dracoEyeMaterial} position={[0.09, 0.03, 0.14]}>
            <sphereGeometry args={[0.033, 16, 16]} />
          </mesh>
        </group>
      </group>
    </group>
  );
};

export const Grey = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, animate = true, seed = 0 }: CrewProps) => {
  const skin = useGreyMaterial();
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime + seed;
    if (body.current) body.current.position.y = Math.sin(t * 1.1) * 0.008;
    if (head.current) head.current.rotation.y = Math.sin(t * 0.55) * 0.4;
    if (armL.current) armL.current.rotation.x = -0.3 + Math.sin(t * 1.6) * 0.35;
  });

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <group ref={body}>
        <mesh material={skin} position={[0, 0.44, 0]}>
          <capsuleGeometry args={[0.11, 0.26, 8, 22]} />
        </mesh>
        <mesh material={suitMaterial} position={[0, 0.44, 0.075]}>
          <boxGeometry args={[0.17, 0.22, 0.06]} />
        </mesh>
        <mesh material={skin} position={[-0.06, 0.14, 0]}>
          <capsuleGeometry args={[0.04, 0.22, 6, 14]} />
        </mesh>
        <mesh material={skin} position={[0.06, 0.14, 0]}>
          <capsuleGeometry args={[0.04, 0.22, 6, 14]} />
        </mesh>
        <mesh ref={armL} material={skin} position={[-0.15, 0.48, 0.02]} rotation={[-0.3, 0, 0.28]}>
          <capsuleGeometry args={[0.032, 0.3, 6, 14]} />
        </mesh>
        <mesh material={skin} position={[0.15, 0.48, 0.02]} rotation={[-0.2, 0, -0.28]}>
          <capsuleGeometry args={[0.032, 0.3, 6, 14]} />
        </mesh>

        <group ref={head} position={[0, 0.72, 0]}>
          {/* oversized cranium tapering to a narrow chin */}
          <mesh material={skin} scale={[1, 1.05, 0.92]}>
            <sphereGeometry args={[0.135, 28, 24]} />
          </mesh>
          <mesh material={skin} position={[0, -0.1, 0.01]} rotation={[Math.PI, 0, 0]} scale={[1, 1.1, 0.85]}>
            <coneGeometry args={[0.1, 0.16, 18]} />
          </mesh>
          {/* almond black eyes */}
          <mesh material={eyeMaterial} position={[-0.062, -0.012, 0.104]} rotation={[0, -0.35, 0.5]} scale={[1, 0.55, 0.4]}>
            <sphereGeometry args={[0.055, 18, 14]} />
          </mesh>
          <mesh material={eyeMaterial} position={[0.062, -0.012, 0.104]} rotation={[0, 0.35, -0.5]} scale={[1, 0.55, 0.4]}>
            <sphereGeometry args={[0.055, 18, 14]} />
          </mesh>
        </group>
      </group>
    </group>
  );
};

/** Pilot + two Greys arranged at a cockpit console. */
export const CockpitCrew = ({ animate = true }: { animate?: boolean }) => (
  <group>
    <Draco position={[0, -0.62, -0.15]} scale={0.85} animate={animate} seed={0.4} />
    <Grey position={[-0.55, -0.6, 0.15]} rotation={[0, 0.4, 0]} scale={0.8} animate={animate} seed={1.7} />
    <Grey position={[0.55, -0.6, 0.15]} rotation={[0, -0.4, 0]} scale={0.8} animate={animate} seed={3.1} />
  </group>
);
