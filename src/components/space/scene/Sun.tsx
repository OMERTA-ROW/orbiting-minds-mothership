// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { NOISE_GLSL } from "./noise.glsl";
import { SUN_TEXTURE_URL, useLazyTexture } from "../realTextures";

/**
 * Photorealistic star: a real 3D sphere with a shader-driven photosphere
 * (animated granulation, supergranule flow, sunspots, faculae, limb
 * darkening).
 * and limb prominences. Radius, position and overall size are unchanged.
 */

export const PHOTO_RADIUS = 16;

const surfaceVert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vPos;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;
  void main() {
    vPos = position;
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;


const surfaceFrag = /* glsl */ `
  precision highp float;
  ${NOISE_GLSL}

  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying vec3 vPos;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;

  uniform float uTime;
  uniform sampler2D uMap;
  uniform float uHasMap;

  // convection cell field: inverted ridged noise gives polygonal granules
  float granules(vec3 p, float t, float scale) {
    vec3 q = p * scale;
    // slow plasma drift: advect the sampling point by a large-scale flow
    vec3 flow = vec3(
      noise3(p * 0.9 + vec3(0.0, t * 0.03, 0.0)),
      noise3(p * 0.9 + vec3(5.2, t * 0.03, 1.3)),
      noise3(p * 0.9 + vec3(9.7, t * 0.03, 4.1))
    ) - 0.5;
    q += flow * 2.4;
    float cells = ridge3(q + vec3(0.0, 0.0, t * 0.12), 4);
    cells = pow(clamp(cells, 0.0, 1.0), 1.9);
    return cells;
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    float mu = clamp(dot(n, V), 0.0, 1.0);

    vec3 sp = normalize(vPos);

    // multi-scale convection: supergranulation under fine granulation
    float supers = granules(sp, uTime * 0.35, 7.0);
    float fine   = granules(sp * 1.9 + vec3(11.0), uTime, 26.0);
    float micro  = fbm3(sp * 62.0 + vec3(0.0, 0.0, uTime * 0.25), 3);

    float surf = supers * 0.45 + fine * 0.42 + micro * 0.13;

    // dark intergranular lanes
    float lanes = smoothstep(0.28, 0.62, fine);
    surf *= mix(0.72, 1.06, lanes);

    // sunspots: rare low-frequency dark umbra with penumbral filaments
    float spotField = fbm3(sp * 2.3 + vec3(31.0, 7.0, uTime * 0.01), 4);
    float umbra = smoothstep(0.70, 0.80, spotField);
    float penumbra = smoothstep(0.60, 0.72, spotField) - umbra;
    float filaments = fbm3(sp * 44.0 + vec3(3.0), 3);
    float spot = umbra * 0.86 + penumbra * (0.30 + filaments * 0.25);

    // faculae: bright magnetic network, strongest near the limb
    float fac = smoothstep(0.55, 0.85, fbm3(sp * 15.0 + vec3(77.0, 0.0, uTime * 0.05), 4));

    // optional NASA/SDO photosphere map modulating the procedural field
    vec3 mapc = texture2D(uMap, vUv).rgb;
    float mapLum = dot(mapc, vec3(0.299, 0.587, 0.114));
    surf = mix(surf, surf * (0.55 + mapLum * 0.9), uHasMap * 0.55);

    // temperature ramp: deep orange-red plasma -> hot white-yellow cores
    float h = clamp(surf, 0.0, 1.0);
    vec3 col = mix(vec3(0.42, 0.07, 0.01), vec3(0.95, 0.32, 0.04), smoothstep(0.0, 0.42, h));
    col = mix(col, vec3(1.0, 0.66, 0.16), smoothstep(0.34, 0.70, h));
    col = mix(col, vec3(1.0, 0.94, 0.74), smoothstep(0.66, 0.95, h));

    col += vec3(1.0, 0.72, 0.30) * fac * (0.10 + (1.0 - mu) * 0.42);
    col *= 1.0 - spot * 0.92;

    // real solar photosphere imagery leads; procedural granulation adds fine fire detail
    vec3 fiery = pow(mapc, vec3(0.9)) * vec3(1.25, 0.95, 0.7) * (0.8 + fine * 0.35 + micro * 0.15);
    col = mix(col, fiery, uHasMap * 0.8);

    // limb darkening (Eddington-style): edges markedly darker & redder
    float ld = 0.32 + 0.68 * pow(mu, 0.62);
    col *= ld;
    col = mix(col * vec3(1.0, 0.72, 0.44), col, smoothstep(0.0, 0.55, mu));

    // modest HDR headroom so bloom halos without erasing the granulation
    col *= 1.55;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const Sun = ({ full, animate = true, steady = false }: { full: boolean; animate?: boolean; steady?: boolean }) => {
  const mesh = useRef<THREE.Mesh>(null);
  const surfMat = useRef<THREE.ShaderMaterial>(null);
  const map = useLazyTexture(SUN_TEXTURE_URL, { delay: full ? 160 : 400 });

  const surfUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMap: { value: null as THREE.Texture | null },
      uHasMap: { value: 0 },
    }),
    [],
  );

  if (map && surfUniforms.uMap.value !== map) {
    surfUniforms.uMap.value = map;
    surfUniforms.uHasMap.value = 1;
  }

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    if (animate && mesh.current) mesh.current.rotation.y += dt * 0.012;
    const t = steady ? 5.142 : state.clock.elapsedTime;
    if ((animate || steady) && surfMat.current) surfMat.current.uniforms.uTime.value = t;
  });

  const segments = full ? 128 : 64;

  return (
    <>
      <mesh ref={mesh}>
        <sphereGeometry args={[PHOTO_RADIUS, segments, segments / 2]} />
        <shaderMaterial
          ref={surfMat}
          vertexShader={surfaceVert}
          fragmentShader={surfaceFrag}
          uniforms={surfUniforms}
          toneMapped={false}
        />
      </mesh>
    </>
  );
};

export default Sun;
