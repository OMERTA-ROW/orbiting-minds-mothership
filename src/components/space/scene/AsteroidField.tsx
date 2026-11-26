// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { asteroidRegistry } from "./asteroidRegistry";
import { detectDeviceClass, resolveAsteroidConfig, type AsteroidConfig } from "./asteroidConfig";
import { asteroidDebugStats } from "./asteroidDebug";
import { asteroidMaps } from "./procTextures";

/**
 * Real rocks drifting through the scene, replacing the old pale streak
 * billboards. Three irregular cratered shapes are drawn as three instanced
 * meshes (one draw call each) and pooled: rocks that leave the travelling box
 * around the camera are recycled to the far side on a fresh trajectory, so
 * nothing pops into view close up.
 *
 * Density, geometry detail and the size range come from the per-device config
 * so mobile stays cheap while desktop keeps its original look.
 */

/** Deform an icosahedron into a pitted, cratered, irregular rock. */
const makeRockGeometry = (seed: number, detail: number) => {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  // deterministic per-shape noise so the three shapes stay distinct
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  // a handful of crater centres gouged into the surface
  const craters: { dir: THREE.Vector3; r: number; d: number }[] = [];
  for (let i = 0; i < 9; i++) {
    craters.push({
      dir: new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(),
      r: 0.22 + rand() * 0.4,
      d: 0.07 + rand() * 0.16,
    });
  }
  const lumpA = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
  const lumpB = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    // large-scale irregularity: never a sphere or an obvious repeat
    let r = 1 + 0.22 * v.dot(lumpA) + 0.16 * v.dot(lumpB);
    r += 0.09 * Math.sin(v.x * 5.3 + seed) * Math.cos(v.y * 4.1 - seed);
    r += 0.05 * Math.sin(v.z * 9.7 + v.x * 6.1);
    // craters
    for (const c of craters) {
      const d = v.angleTo(c.dir);
      if (d < c.r) {
        const f = 1 - d / c.r;
        r -= c.d * f * f * (1.15 - 0.5 * f);
      }
    }
    // fine pitting
    r += 0.018 * Math.sin(v.x * 31.1) * Math.sin(v.y * 27.7) * Math.sin(v.z * 23.3);
    pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
};

interface Rock {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  rot: THREE.Euler;
  scale: number;
  shape: number;
}

const AsteroidField = ({ animate, full }: { animate: boolean; full: boolean }) => {
  const { camera } = useThree();
  const meshes = [
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
  ];

  // device class can change (rotation, window resize) — re-resolve on resize
  const [device, setDevice] = useState(detectDeviceClass);
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setDevice(detectDeviceClass()));
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  const cfg: AsteroidConfig = useMemo(() => resolveAsteroidConfig(full, device), [full, device]);

  useEffect(() => {
    asteroidDebugStats.device = device;
    asteroidDebugStats.count = cfg.count;
  }, [device, cfg.count]);

  const geometries = useMemo(
    () => [
      makeRockGeometry(9137, cfg.detail),
      makeRockGeometry(48211, cfg.detail),
      makeRockGeometry(70513, cfg.detail),
    ],
    [cfg.detail],
  );
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);

  const rocks = useMemo<Rock[]>(() => {
    const list: Rock[] = [];
    const span = cfg.maxScale - cfg.minScale;
    for (let i = 0; i < cfg.count; i++) {
      // several depth bands: near rocks are small and fast in screen terms,
      // far ones are large and slow, which is what reads as parallax
      const band = Math.random();
      const depth = band < 0.35 ? 0.35 : band < 0.75 ? 1 : 2.1;
      list.push({
        pos: new THREE.Vector3(
          (Math.random() * 2 - 1) * cfg.field,
          (Math.random() * 2 - 1) * cfg.field * 0.7,
          (Math.random() * 2 - 1) * cfg.field,
        ),
        vel: new THREE.Vector3(Math.random() * 2 - 1, (Math.random() * 2 - 1) * 0.35, Math.random() * 2 - 1)
          .normalize()
          .multiplyScalar((2.5 + Math.random() * 7) / depth),
        spin: new THREE.Vector3(
          (Math.random() * 2 - 1) * 0.28,
          (Math.random() * 2 - 1) * 0.28,
          (Math.random() * 2 - 1) * 0.28,
        ),
        rot: new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28),
        scale: (cfg.minScale + Math.random() * span) * depth,
        shape: i % 3,
      });
    }
    return list;
  }, [cfg.count, cfg.minScale, cfg.maxScale, cfg.field]);

  const scratch = useMemo(
    () => ({ dummy: new THREE.Object3D(), colour: new THREE.Color(), counts: [0, 0, 0] }),
    [],
  );

  // per-instance grey/brown variation
  useLayoutEffect(() => {
    for (let shape = 0; shape < 3; shape++) {
      const inst = meshes[shape].current;
      if (!inst) continue;
      let n = 0;
      for (const r of rocks) if (r.shape === shape) n++;
      const colours = new Float32Array(Math.max(n, 1) * 3);
      let k = 0;
      for (const r of rocks) {
        if (r.shape !== shape) continue;
        const warm = Math.random();
        scratch.colour.setRGB(
          0.62 + warm * 0.22,
          0.56 + warm * 0.16,
          0.50 + warm * 0.10,
        );
        colours[k * 3] = scratch.colour.r;
        colours[k * 3 + 1] = scratch.colour.g;
        colours[k * 3 + 2] = scratch.colour.b;
        k++;
      }
      inst.instanceColor = new THREE.InstancedBufferAttribute(colours, 3);
      inst.instanceColor.needsUpdate = true;
    }
  }, [rocks]);

  useFrame((_, delta) => {
    const dt = animate ? Math.min(delta, 0.05) : 0;
    scratch.counts[0] = scratch.counts[1] = scratch.counts[2] = 0;
    asteroidRegistry.count = 0;
    asteroidRegistry.recycled = 0;

    const FIELD = cfg.field;
    for (const r of rocks) {
      if (dt > 0) {
        r.pos.addScaledVector(r.vel, dt);
        r.rot.x += r.spin.x * dt;
        r.rot.y += r.spin.y * dt;
        r.rot.z += r.spin.z * dt;
      }

      // pooling: wrap around the travelling box, far from the camera so the
      // reappearance is never visible
      const p = r.pos;
      const c = camera.position;
      let wrapped = false;
      if (Math.abs(p.x - c.x) > FIELD) { p.x += p.x > c.x ? -2 * FIELD : 2 * FIELD; wrapped = true; }
      if (Math.abs(p.y - c.y) > FIELD * 0.7) { p.y += p.y > c.y ? -1.4 * FIELD : 1.4 * FIELD; wrapped = true; }
      if (Math.abs(p.z - c.z) > FIELD) { p.z += p.z > c.z ? -2 * FIELD : 2 * FIELD; wrapped = true; }
      if (wrapped) {
        asteroidRegistry.recycled++;
        asteroidRegistry.recycledTotal++;
      }

      const inst = meshes[r.shape].current;
      if (!inst) continue;
      const i = scratch.counts[r.shape]++;
      scratch.dummy.position.copy(p);
      scratch.dummy.rotation.copy(r.rot);
      scratch.dummy.scale.setScalar(r.scale);
      scratch.dummy.updateMatrix();
      inst.setMatrixAt(i, scratch.dummy.matrix);

      // publish the biggest nearby rocks so the autopilot can steer around them
      if (asteroidRegistry.count < asteroidRegistry.centers.length && r.scale > cfg.avoidanceMinScale) {
        asteroidRegistry.centers[asteroidRegistry.count].copy(p);
        asteroidRegistry.radii[asteroidRegistry.count] = r.scale * 1.35;
        asteroidRegistry.count++;
      }
    }

    asteroidRegistry.alive = rocks.length;

    for (let shape = 0; shape < 3; shape++) {
      const inst = meshes[shape].current;
      if (!inst) continue;
      inst.count = scratch.counts[shape];
      inst.instanceMatrix.needsUpdate = true;
    }
  });

  const perShape = Math.ceil(cfg.count / 3) + 1;

  return (
    <>
      {geometries.map((geo, i) => (
        <instancedMesh
          key={`${i}-${cfg.count}-${cfg.detail}`}
          ref={meshes[i]}
          args={[geo, undefined as never, perShape]}
          frustumCulled={false}
          castShadow={false}
          receiveShadow={false}
        >
          <meshStandardMaterial
            vertexColors
            map={asteroidMaps(i).map}
            normalMap={asteroidMaps(i).normalMap}
            normalScale={new THREE.Vector2(1.55, 1.55)}
            roughnessMap={asteroidMaps(i).roughnessMap}
            color="#b8b0a6"
            emissive="#171614"
            emissiveIntensity={0.18}
            roughness={1}
            metalness={i === 2 ? 0.08 : 0.015}
            flatShading={cfg.flatShading}
          />
        </instancedMesh>
      ))}
    </>
  );
};

export default AsteroidField;
