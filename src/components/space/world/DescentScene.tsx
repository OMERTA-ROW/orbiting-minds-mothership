// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import Starfield from "../scene/Starfield";
import DeepSky from "../scene/DeepSky";
import { CLOUD_TEXTURE_URLS, SPACE_TEXTURE_URLS, useLazyTexture } from "../realTextures";
import { MAX_ALTITUDE, MIN_ALTITUDE, PLANET_RADIUS } from "./altitude";
import { LodProvider, useLod } from "./lodManager";
import type { QualityTier } from "./qualityTiers";
import {
  cloudAlphaMap,
  disposeWorldTextures,
  facadeMap,
  planetDayMap,
  planetNightMap,
  streetGroundMap,
} from "./worldTextures";

/**
 * Stage 1 of the multiverse: one continuous descent onto Earth.
 *
 * Deep space -> orbit -> atmosphere -> rooftops -> street, with content mounted
 * and cross-faded by the LOD manager. The city here is deliberately blocked
 * out; stages 2 and 3 replace it with the full cyberpunk build without
 * touching this scaffolding.
 */

const CITY_UP = new THREE.Vector3(0, 1, 0);
const SUN_DIR = new THREE.Vector3(0.6, 0.35, 0.72).normalize();

/* ------------------------------------------------------------------ camera */

const DescentCamera = ({
  altitudeRef,
  animate,
}: {
  altitudeRef: React.MutableRefObject<number>;
  animate: boolean;
}) => {
  const { camera } = useThree();
  const t = useRef(1.15); // start part-way down so the planet is on screen immediately
  const look = useRef(new THREE.Vector3(0, PLANET_RADIUS, 0));
  const target = useRef(new THREE.Vector3());
  // ?bgalt=<units> pins the descent at one altitude — used when checking a band
  const pinned = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("bgalt");
    const v = raw ? Number(raw) : NaN;
    return Number.isFinite(v) && v > 0 ? v : null;
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (animate) t.current += dt * 0.045;

    // ping-pong through the full altitude range on a log curve so every band
    // gets roughly equal screen time
    const phase = (Math.cos(t.current) + 1) / 2; // 1 = high, 0 = low
    const hi = Math.log10(MAX_ALTITUDE);
    const lo = Math.log10(MIN_ALTITUDE * 12);
    const alt = pinned ?? Math.pow(10, lo + (hi - lo) * phase);
    altitudeRef.current = alt;

    // gentle lateral drift over the city site at the north pole; at street
    // level we hold a minimum offset so the camera sits in a canyon rather
    // than in the empty road cross at the exact centre
    const swing = THREE.MathUtils.clamp(alt * 0.35, 7, 260);
    const a = t.current * 0.6;
    target.current.set(
      Math.cos(a) * swing,
      PLANET_RADIUS + Math.max(alt, 1.6),
      Math.sin(a) * swing,
    );
    camera.position.lerp(target.current, animate && !pinned ? 1 - Math.exp(-3 * dt) : 1);

    // look ahead and down: straight at the planet from far out, along the
    // street once we are low
    const tilt = THREE.MathUtils.clamp(1 - Math.log10(alt + 1) / 3, 0, 1);
    look.current.lerp(
      new THREE.Vector3(
        Math.cos(a + 1.1) * swing * (1 + tilt * 1.6),
        PLANET_RADIUS + alt * (1 - tilt) * 0.15 + tilt * 1.1,
        Math.sin(a + 1.1) * swing * (1 + tilt * 1.6),
      ),
      animate && !pinned ? 1 - Math.exp(-2.2 * dt) : 1,
    );

    camera.up.copy(CITY_UP);
    camera.lookAt(look.current);
    camera.near = Math.max(0.02, alt * 0.01);
    camera.far = 20000;
    camera.updateProjectionMatrix();
  });

  return null;
};

/* ------------------------------------------------------------------- globe */

const Globe = ({ animate }: { animate: boolean }) => {
  const { cfg, weights } = useLod();
  const size = cfg.texture;
  const fallbackDay = useMemo(() => planetDayMap(size, cfg.anisotropy), [size, cfg.anisotropy]);
  const night = useMemo(() => planetNightMap(size, cfg.anisotropy), [size, cfg.anisotropy]);
  const fallbackClouds = useMemo(() => cloudAlphaMap(size, cfg.anisotropy), [size, cfg.anisotropy]);
  const day = useLazyTexture(SPACE_TEXTURE_URLS.Earth, { delay: 120, anisotropy: cfg.anisotropy }) ?? fallbackDay;
  const clouds = useLazyTexture(CLOUD_TEXTURE_URLS.Earth, { delay: 280, anisotropy: cfg.anisotropy }) ?? fallbackClouds;
  const cloudRef = useRef<THREE.Mesh>(null);
  const segs = cfg.texture >= 1024 ? 128 : cfg.texture >= 512 ? 96 : 48;

  useFrame((_, delta) => {
    if (animate && cloudRef.current) cloudRef.current.rotation.y += Math.min(delta, 0.05) * 0.004;
  });

  // the ground patch takes over below the atmosphere, so fade the globe out
  const surfaceFade = 1 - Math.min(1, weights.street * 1.6 + weights.rooftop * 1.1);

  return (
    <group>
      <mesh>
        <sphereGeometry args={[PLANET_RADIUS, segs, segs / 2]} />
        <meshStandardMaterial
          map={day}
          emissiveMap={night}
          emissive={new THREE.Color("#ffb45c")}
          emissiveIntensity={0.9}
          roughness={0.92}
          metalness={0.02}
          transparent
          opacity={surfaceFade}
        />
      </mesh>

      <mesh ref={cloudRef}>
        <sphereGeometry args={[PLANET_RADIUS * 1.012, segs, segs / 2]} />
        <meshStandardMaterial
          color="#dfe9f5"
          alphaMap={clouds}
          transparent
          opacity={0.72 * surfaceFade}
          depthWrite={false}
          roughness={1}
        />
      </mesh>

      {/* atmospheric rim */}
      <mesh>
        <sphereGeometry args={[PLANET_RADIUS * 1.06, 64, 32]} />
        <meshBasicMaterial
          color="#3fa9ff"
          transparent
          opacity={0.14}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

/* -------------------------------------------------------------------- city */

interface Block {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  tint: number;
}

const buildBlocks = (count: number, spread: number, seed: number): Block[] => {
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out: Block[] = [];
  const cell = spread / Math.ceil(Math.sqrt(count));
  const per = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < per; i++) {
    for (let j = 0; j < per; j++) {
      if (out.length >= count) break;
      const cx = -spread / 2 + (i + 0.5) * cell;
      const cz = -spread / 2 + (j + 0.5) * cell;
      // keep the road cross clear
      if (Math.abs(cx) < cell * 0.6 && Math.abs(cz) < cell * 0.6) continue;
      const w = cell * (0.32 + r() * 0.32);
      const d = cell * (0.32 + r() * 0.32);
      const dist = Math.hypot(cx, cz) / (spread * 0.5);
      const h = (0.6 + r() * 3.4) * cell * (1.25 - dist * 0.7);
      out.push({
        x: cx + (r() - 0.5) * cell * 0.2,
        z: cz + (r() - 0.5) * cell * 0.2,
        w,
        d,
        h: Math.max(cell * 0.4, h),
        tint: r(),
      });
    }
  }
  return out;
};

const CityBlocks = () => {
  const { count, cfg, weights, progress } = useLod();
  const ref = useRef<THREE.InstancedMesh>(null);
  const spread = 64; // city footprint in world units (planet radius is 100)
  const n = Math.min(cfg.instanceBudget, count(1400));
  const blocks = useMemo(() => buildBlocks(n, spread, 20260910), [n]);
  const facade = useMemo(() => facadeMap(cfg.texture, cfg.anisotropy), [cfg.texture, cfg.anisotropy]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const colour = new THREE.Color();
    blocks.forEach((b, i) => {
      pos.set(b.x, PLANET_RADIUS + b.h / 2, b.z);
      scale.set(b.w, b.h, b.d);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(i, m);
      colour.setHSL(0.55 + b.tint * 0.12, 0.22, 0.07 + b.tint * 0.06);
      mesh.setColorAt(i, colour);
    });
    mesh.count = blocks.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [blocks]);

  const fade = Math.min(1, (weights.atmosphere + weights.rooftop + weights.street) * 1.4);
  if (fade <= 0.01) return null;

  return (
    <instancedMesh ref={ref} args={[undefined as never, undefined as never, Math.max(1, blocks.length)]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        map={facade}
        emissiveMap={facade}
        emissive={new THREE.Color("#63e8ff")}
        emissiveIntensity={0.35 + progress * 0.8}
        roughness={0.55}
        metalness={0.35}
        transparent
        opacity={fade}
      />
    </instancedMesh>
  );
};

const GroundPatch = () => {
  const { cfg, weights } = useLod();
  const ground = useMemo(
    () => streetGroundMap(cfg.texture, cfg.anisotropy),
    [cfg.texture, cfg.anisotropy],
  );
  const fade = Math.min(1, (weights.rooftop + weights.street) * 1.5);
  const tiles = 56;

  useEffect(() => {
    ground.repeat.set(tiles, tiles);
    ground.needsUpdate = true;
  }, [ground]);

  if (fade <= 0.01) return null;

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, PLANET_RADIUS + 0.01, 0]}>
      <planeGeometry args={[140, 140]} />
      <meshStandardMaterial
        map={ground}
        roughness={0.22}
        metalness={0.55}
        transparent
        opacity={fade}
        color="#39424f"
      />
    </mesh>
  );
};

/* ------------------------------------------------------------------ lights */

const Lighting = () => {
  const { progress } = useLod();
  return (
    <>
      <ambientLight intensity={0.18 + progress * 0.22} color="#8fb6ff" />
      <directionalLight
        position={[SUN_DIR.x * 900, SUN_DIR.y * 900, SUN_DIR.z * 900]}
        intensity={2.1}
        color="#fff3e0"
      />
      {/* neon bounce that only matters once we are inside the city */}
      <pointLight
        position={[0, PLANET_RADIUS + 4, 0]}
        intensity={progress * 60}
        distance={90}
        color="#4fe4ff"
      />
      <pointLight
        position={[9, PLANET_RADIUS + 3, -6]}
        intensity={progress * 40}
        distance={70}
        color="#ff4fa3"
      />
    </>
  );
};

/* ------------------------------------------------------------------- scene */

const Contents = ({ full, dpr, animate }: { full: boolean; dpr: number; animate: boolean }) => {
  const { weights, resident, progress } = useLod();
  const { scene } = useThree();

  useEffect(() => {
    // sky fills in as we drop through the atmosphere; deep space stays black
    const fog = new THREE.FogExp2(new THREE.Color("#05080f"), 0);
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  useFrame(() => {
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.density = 0.00002 + Math.pow(progress, 3) * 0.02;
      fog.color.setRGB(0.02 + progress * 0.05, 0.03 + progress * 0.06, 0.06 + progress * 0.12);
    }
  });

  return (
    <>
      <Lighting />
      {resident("deep") && weights.street < 0.5 && (
        <>
          <DeepSky full={full} />
          <Starfield full={full} dpr={dpr} boost={1} animate={animate} />
        </>
      )}
      <Globe animate={animate} />
      {(resident("atmosphere") || resident("rooftop") || resident("street")) && <CityBlocks />}
      {(resident("rooftop") || resident("street")) && <GroundPatch />}

    </>
  );
};

interface Props {
  full: boolean;
  animate: boolean;
  tier: QualityTier;
  dpr: number;
}

const DescentScene = ({ full, animate, tier, dpr }: Props) => {
  const altitudeRef = useRef(MAX_ALTITUDE);

  useEffect(() => () => disposeWorldTextures(), []);

  return (
    <LodProvider tier={tier} altitudeRef={altitudeRef} animate={animate}>
      <DescentCamera altitudeRef={altitudeRef} animate={animate} />
      <Contents full={full} dpr={dpr} animate={animate} />
    </LodProvider>
  );
};

export default DescentScene;
