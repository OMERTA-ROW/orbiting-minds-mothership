// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Procedural starfield built from several concentric depth shells.
 * Direction-only layers render before physical objects; ship translation cannot
 * bring background stars into the flight volume.
 */

const vert = /* glsl */ `
  #include <common>

  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uBoost;
  uniform float uLensEnabled;
  uniform vec3 uLensA;
  uniform vec3 uLensB;

  varying vec3 vColor;
  varying float vBright;

  void main() {
    vec3 p = position;
    vec3 dir = normalize(p);
    vec3 tangentA = normalize(cross(uLensA, vec3(0.0, 1.0, 0.001)));
    vec3 tangentB = normalize(cross(uLensB, vec3(1.0, 0.001, 0.0)));
    float lensA = exp(-(1.0 - dot(dir, uLensA)) * 1800.0);
    float lensB = exp(-(1.0 - dot(dir, uLensB)) * 1800.0);
    p = normalize(dir + uLensEnabled * 0.001 * (tangentA * lensA + tangentB * lensB)) * length(p);
    vec4 mv = vec4(mat3(viewMatrix) * mat3(modelMatrix) * p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w * 0.99999;

    float tw = 0.90 + 0.10 * sin(uTime * (0.25 + aSeed * 0.65) + aSeed * 40.0);
    float dist = max(-mv.z, 1.0);
    gl_PointSize = aSize * uPixelRatio * (300.0 / dist) * tw * uBoost;
    gl_PointSize = clamp(gl_PointSize, 0.55, 2.0 * uPixelRatio);

    vColor = aColor;
    vBright = tw;
  }
`;

const frag = /* glsl */ `
  #include <common>

  varying vec3 vColor;
  varying float vBright;

  void main() {
    // Background pass deliberately does not read or write depth.
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    // diffraction-like pin core with a restrained halo on bright stars
    float core = 1.0 - smoothstep(0.055, 0.20, d);
    float halo = exp(-d * d * 18.0) * 0.20;
    float spike = exp(-abs(uv.x) * 85.0) * exp(-abs(uv.y) * 8.0)
      + exp(-abs(uv.y) * 85.0) * exp(-abs(uv.x) * 8.0);
    float a = core + halo + spike * 0.08;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * vBright * (1.0 + core * 1.8), a);
  }
`;

// Stellar temperature ramp: O/B blue-white -> A/F white -> G yellow -> K amber -> M red
const TEMP_COLORS: [number, number, number][] = [
  [0.62, 0.74, 1.0],
  [0.78, 0.86, 1.0],
  [1.0, 1.0, 1.0],
  [1.0, 0.96, 0.84],
  [1.0, 0.84, 0.62],
  [1.0, 0.66, 0.46],
];

const seeded = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
};

const buildShell = (count: number, inner: number, outer: number, sizeScale: number, seedBase: number) => {
  const random = seeded(Math.round(seedBase * 97 + count * 13));
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);
  const v = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    // uniform direction on the sphere, random radius inside the shell
    const u = random() * 2 - 1;
    const theta = random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    v.set(s * Math.cos(theta), u, s * Math.sin(theta));
    const r = inner + random() * (outer - inner);
    pos[i * 3] = v.x * r;
    pos[i * 3 + 1] = v.y * r;
    pos[i * 3 + 2] = v.z * r;

    // luminosity function: most stars faint, a few very bright
    const lum = Math.pow(random(), 3.2);
    const t = Math.min(TEMP_COLORS.length - 1, Math.floor(Math.pow(random(), 1.6) * TEMP_COLORS.length));
    const c = TEMP_COLORS[t];
    const b = 0.35 + lum * 0.9;
    col[i * 3] = c[0] * b;
    col[i * 3 + 1] = c[1] * b;
    col[i * 3 + 2] = c[2] * b;

    size[i] = (0.5 + lum * 2.6) * sizeScale;
    seed[i] = seedBase + random();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), outer * 1.2);
  return geo;
};

const Shell = ({
  count,
  inner,
  outer,
  sizeScale,
  spin,
  dpr,
  boost,
  animate,
  lensEnabled,
}: {
  count: number;
  inner: number;
  outer: number;
  sizeScale: number;
  spin: number;
  dpr: number;
  boost: number;
  animate: boolean;
  lensEnabled: boolean;
}) => {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const group = useRef<THREE.Points>(null);

  const geometry = useMemo(() => buildShell(count, inner, outer, sizeScale, inner), [count, inner, outer, sizeScale]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: dpr },
      uBoost: { value: boost },
      uLensEnabled: { value: lensEnabled ? 1 : 0 },
      uLensA: { value: new THREE.Vector3(2.8, 1.3, -2.4).normalize() },
      uLensB: { value: new THREE.Vector3(-3.7, -1.7, 2.9).normalize() },
    }),
    [boost, dpr, lensEnabled],
  );
  uniforms.uPixelRatio.value = dpr;

  const time = useRef(0);
  useFrame((_, delta) => {
    if (animate) time.current += Math.min(delta, 0.05);
    if (mat.current) {
      mat.current.uniforms.uTime.value = time.current;
      mat.current.uniforms.uBoost.value = boost;
      mat.current.uniforms.uLensEnabled.value = lensEnabled ? 1 : 0;
    }
    if (animate && group.current) group.current.rotation.y += Math.min(delta, 0.05) * spin;
  });

  return (
    <points ref={group} geometry={geometry} frustumCulled={false} renderOrder={-990}>
      <shaderMaterial
        ref={mat}
        vertexShader={vert}
        fragmentShader={frag}
        uniforms={uniforms}
        transparent={false}
        depthTest={false}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

const Starfield = ({
  full,
  dpr,
  boost,
  animate = true,
  lensEnabled = false,
}: {
  full: boolean;
  dpr: number;
  boost: number;
  animate?: boolean;
  lensEnabled?: boolean;
}) => {
  const scale = full ? 1 : 0.2;
  return (
    <group>
      {/* Directional shells: radii vary star density, never physical flight depth. */}
      <Shell
        count={Math.round(7000 * scale)}
        inner={260}
        outer={620}
        sizeScale={0.82}
        spin={0.00065}
        dpr={dpr}
        boost={boost * 0.72}
        animate={animate}
        lensEnabled={lensEnabled}
      />
      <Shell
        count={Math.round(11000 * scale)}
        inner={900}
        outer={1900}
        sizeScale={0.68}
        spin={0.0003}
        dpr={dpr}
        boost={boost * 0.7}
        animate={animate}
        lensEnabled={lensEnabled}
      />
      <Shell
        count={Math.round(13000 * scale)}
        inner={2500}
        outer={4400}
        sizeScale={0.56}
        spin={0.00013}
        dpr={dpr}
        boost={boost * 0.68}
        animate={animate}
        lensEnabled={lensEnabled}
      />
      <Shell
        count={Math.round(13000 * scale)}
        inner={5800}
        outer={9000}
        sizeScale={0.48}
        spin={0.00005}
        dpr={dpr}
        boost={boost * 0.66}
        animate={animate}
        lensEnabled={lensEnabled}
      />
      <Shell
        count={Math.round(11000 * scale)}
        inner={12000}
        outer={18000}
        sizeScale={0.42}
        spin={0.00002}
        dpr={dpr}
        boost={boost * 0.64}
        animate={animate}
        lensEnabled={lensEnabled}
      />
    </group>
  );
};

export default Starfield;
