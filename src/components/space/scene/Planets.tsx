// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  CLOUD_TEXTURE_URLS,
  RING_TEXTURE_URL,
  SPACE_TEXTURE_URLS,
  useLazyTexture,
} from "../realTextures";
import Sun from "./Sun";
import { SolarFlares } from "../CosmicAnomalies";
import { WORLD_SCALE } from "../worldScale";

/**
 * Real 3D bodies on inclined elliptical orbits around a single local star.
 * Each planet is a textured sphere using credited mission-derived and
 * Solar System Scope maps, with a separate cloud shell where appropriate, and
 * real ring geometry. Colour maps are never reused as fake terrain data.
 * Orbits, radii, tilts and speeds are unchanged.
 */

const atmoVert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

const atmoFrag = /* glsl */ `
  precision highp float;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying vec3 vNormalW;
  varying vec3 vPosW;
  uniform vec3 uColor;
  uniform vec3 uLightPos;
  uniform float uStrength;

  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 L = normalize(uLightPos - vPosW);
    float ndl = dot(n, L);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 3.2);
    float forward = pow(max(dot(V, -L), 0.0), 3.0);
    float a = fres * smoothstep(-0.35, 0.65, ndl) * (0.75 + forward * 0.4) * uStrength;
    gl_FragColor = vec4(uColor * (0.9 + forward * 0.5), clamp(a, 0.0, 1.0));
  }
`;


type TextureKey = keyof typeof SPACE_TEXTURE_URLS;

export interface Body {
  name: string;
  texture: TextureKey;
  radius: number;
  a: number;      // semi-major axis
  ecc: number;
  incl: number;   // radians
  phase: number;
  tilt: number;
  spin: number;
  base: [number, number, number];
  atmo: [number, number, number];
  atmoStrength: number;
  bump: number;
  rough: number;
  ring?: { inner: number; outer: number };
}

export const BODIES: Body[] = [
  { name: "inner", texture: "Mercury", radius: 6.08, a: 165.6, ecc: 0.19, incl: 0.12, phase: 0.7, tilt: 0.03, spin: 0.10,
    base: [0.55, 0.51, 0.47], atmo: [0.25, 0.22, 0.20], atmoStrength: 0.12, bump: 0.06, rough: 1.0 },
  { name: "terra", texture: "Earth", radius: 9.5, a: 266.4, ecc: 0.05, incl: 0.05, phase: 2.3, tilt: 0.41, spin: 0.07,
    base: [0.12, 0.3, 0.5], atmo: [0.30, 0.55, 1.0], atmoStrength: 0.85, bump: 0.05, rough: 0.72 },
  { name: "rust", texture: "Mars", radius: 7.6, a: 388.8, ecc: 0.13, incl: 0.09, phase: 4.4, tilt: 0.44, spin: 0.065,
    base: [0.65, 0.35, 0.20], atmo: [0.75, 0.40, 0.28], atmoStrength: 0.3, bump: 0.07, rough: 0.92 },
  { name: "giant", texture: "Jupiter", radius: 20.9, a: 604.8, ecc: 0.06, incl: 0.03, phase: 1.1, tilt: 0.05, spin: 0.16,
    base: [0.78, 0.68, 0.53], atmo: [0.80, 0.66, 0.45], atmoStrength: 0.45, bump: 0.015, rough: 0.6 },
  { name: "ringed", texture: "Saturn", radius: 17.1, a: 864, ecc: 0.05, incl: 0.16, phase: 3.6, tilt: 0.47, spin: 0.14,
    base: [0.85, 0.78, 0.58], atmo: [0.85, 0.78, 0.55], atmoStrength: 0.4, bump: 0.012, rough: 0.6,
    ring: { inner: 1.5, outer: 2.5 } },
  { name: "ice", texture: "Uranus", radius: 12.16, a: 1152, ecc: 0.04, incl: 0.2, phase: 5.2, tilt: 1.6, spin: 0.09,
    base: [0.45, 0.75, 0.80], atmo: [0.45, 0.80, 0.95], atmoStrength: 0.5, bump: 0.008, rough: 0.55 },
];

const ORBIT_SPEED = 0.24;

export const orbitPoint = (b: Body, t: number, out: THREE.Vector3) => {
  const period = Math.pow(b.a / (46 * WORLD_SCALE), 1.5) * 150;
  const ang = b.phase + (t * ORBIT_SPEED) / period * Math.PI * 2;
  const bMin = b.a * Math.sqrt(Math.max(1 - b.ecc * b.ecc, 0.01));
  const x = b.a * Math.cos(ang) - b.a * b.ecc;
  const z = bMin * Math.sin(ang);
  out.set(x, z * Math.sin(b.incl), z * Math.cos(b.incl));
  return out;
};

/** ringGeometry with radial UVs so a real ring map bands correctly */
const useRingGeometry = (inner: number, outer: number) =>
  useMemo(() => {
    const geo = new THREE.RingGeometry(inner, outer, 128, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const r = v.length();
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    uv.needsUpdate = true;
    return geo;
  }, [inner, outer]);

const Ring = ({ inner, outer, delay }: { inner: number; outer: number; delay: number }) => {
  const geo = useRingGeometry(inner, outer);
  const map = useLazyTexture(RING_TEXTURE_URL, { delay });
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} geometry={geo} receiveShadow>
      <meshStandardMaterial
        map={map ?? undefined}
        alphaMap={map ?? undefined}
        color={map ? "#ffffff" : "#d9c8a0"}
        side={THREE.DoubleSide}
        transparent
        opacity={map ? 0.95 : 0.32}
        roughness={0.9}
        metalness={0}
        depthWrite={false}
      />
    </mesh>
  );
};

const PlanetMesh = ({ body, full, animate, segments, index }: { body: Body; full: boolean; animate: boolean; segments: number; index: number }) => {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const clouds = useRef<THREE.Mesh>(null);
  const atmoMat = useRef<THREE.ShaderMaterial>(null);
  const orbitalTime = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  // progressive: stagger requests so the UI paints first
  const delay = 220 + index * 160;
  const map = useLazyTexture(SPACE_TEXTURE_URLS[body.texture], { delay, anisotropy: full ? 8 : 2 });
  const cloudUrl = full ? CLOUD_TEXTURE_URLS[body.texture] : undefined;
  const cloudMap = useLazyTexture(cloudUrl, { delay: delay + 600, anisotropy: full ? 8 : 2 });

  const atmoUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(...body.atmo) },
      uLightPos: { value: new THREE.Vector3(0, 0, 0) },
      uStrength: { value: body.atmoStrength },
    }),
    [body.atmo, body.atmoStrength],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (animate) orbitalTime.current += dt;
    if (group.current) group.current.position.copy(orbitPoint(body, orbitalTime.current, tmp));
    if (animate && mesh.current) mesh.current.rotation.y += dt * body.spin * 0.28;
    if (animate && clouds.current) clouds.current.rotation.y += dt * body.spin * 0.36;
    if (atmoMat.current) atmoMat.current.uniforms.uLightPos.value.set(0, 0, 0);
  });

  return (
    <group ref={group}>
      <group rotation={[body.tilt, 0, 0]}>
        <mesh ref={mesh} castShadow receiveShadow>
          <sphereGeometry args={[body.radius, segments, segments / 2]} />
          <meshStandardMaterial
            map={map ?? undefined}
            color={map ? "#ffffff" : new THREE.Color(...body.base)}
            roughness={body.rough}
            metalness={0}
          />
        </mesh>

        {cloudMap && (
          <mesh ref={clouds}>
            <sphereGeometry args={[body.radius * 1.015, segments, segments / 2]} />
            <meshStandardMaterial
              map={cloudMap}
              alphaMap={cloudMap}
              color="#ffffff"
              transparent
              opacity={0.85}
              roughness={1}
              depthWrite={false}
            />
          </mesh>
        )}

        <mesh scale={1.06}>
          <sphereGeometry args={[body.radius, 48, 24]} />
          <shaderMaterial
            ref={atmoMat}
            vertexShader={atmoVert}
            fragmentShader={atmoFrag}
            uniforms={atmoUniforms}
            transparent
            depthWrite={false}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {body.ring && (
          <Ring inner={body.radius * body.ring.inner} outer={body.radius * body.ring.outer} delay={delay + 800} />
        )}
      </group>
    </group>
  );
};


const Planets = ({ full, animate }: { full: boolean; animate: boolean }) => {
  const segments = full ? 96 : 40;
  const bodies = full ? BODIES : BODIES.slice(0, 4);

  return (
    <group>
      {/* local star: the single light source for every body */}
      <pointLight position={[0, 0, 0]} intensity={6200} distance={0} decay={2} color="#fff3d8" />
      <Sun full={full} animate={animate} />
      <SolarFlares radius={16} animate={animate} full={full} />

      {bodies.map((b, i) => (
        <PlanetMesh key={b.name} body={b} full={full} animate={animate} segments={segments} index={i} />
      ))}
    </group>
  );
};

export default Planets;
