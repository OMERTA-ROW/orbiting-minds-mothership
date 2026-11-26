// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type V3 = [number, number, number];

const seeded = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
};


const makePointGeometry = (
  count: number,
  seed: number,
  point: (random: () => number, index: number) => [number, number, number],
) => {
  const random = seeded(seed);
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions.set(point(random, index), index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
};

const useDisposableGeometry = (geometry: THREE.BufferGeometry) => {
  useEffect(() => () => geometry.dispose(), [geometry]);
};

const SOFT_POINT_VERTEX_SHADER = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uSize;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, uSize * (300.0 / max(1.0, -viewPosition.z)));
    gl_Position = projectionMatrix * viewPosition;
    #include <logdepthbuf_vertex>
  }
`;

const SOFT_POINT_FRAGMENT_SHADER = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    #include <logdepthbuf_fragment>
    float radius = length(gl_PointCoord - vec2(0.5));
    float alpha = 1.0 - smoothstep(0.12, 0.5, radius);
    if (alpha < 0.015) discard;

    float luminousCore = 1.0 - smoothstep(0.0, 0.24, radius);
    vec3 color = uColor * (0.82 + luminousCore * 0.38);
    gl_FragColor = vec4(color, alpha * uOpacity);
  }
`;


export const SolarFlares = ({ radius, animate, full = true, steady = false }: { radius: number; animate: boolean; full?: boolean; steady?: boolean }) => {
  const group = useRef<THREE.Group>(null);
  const corona = useRef<THREE.ShaderMaterial>(null);
  const cme = useRef<THREE.Points>(null);
  const cmeMaterial = useRef<THREE.ShaderMaterial>(null);
  const loops = useMemo(() => {
    const random = seeded(77);
    return Array.from({ length: full ? 7 : 4 }, () => ({
      rotation: [random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2] as V3,
      radius: radius * (0.18 + random() * 0.25),
      phase: random() * Math.PI * 2,
    }));
  }, [full, radius]);
  const cmeGeometry = useMemo(
    () => makePointGeometry(full ? 96 : 48, 7721, (random) => {
      const cone = Math.pow(random(), 0.55);
      const angle = random() * Math.PI * 2;
      const spread = cone * radius * 0.42;
      return [radius * (1.02 + cone * 1.8), Math.cos(angle) * spread, Math.sin(angle) * spread];
    }),
    [full, radius],
  );
  useDisposableGeometry(cmeGeometry);
  const cmeUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color("#ff9b4f") },
      uSize: { value: radius * 0.12 },
      uOpacity: { value: 0 },
    }),
    [radius],
  );
  const coronaUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0.16 },
    }),
    [],
  );
  const time = useRef(0);
  useFrame((_, delta) => {
    if (!group.current) return;
    if (animate && !steady) time.current += Math.min(delta, 0.05);
    const effectTime = steady ? 5.142 : time.current;
    if (corona.current) corona.current.uniforms.uTime.value = effectTime;
    group.current.children.forEach((child, index) => {
      const loop = loops[index - 1];
      if (!loop) return;
      child.scale.setScalar(0.85 + 0.25 * Math.sin(effectTime * 0.6 + loop.phase));
    });
    const cycle = steady ? 0.18 : (time.current * 0.035) % 1;
    const active = steady ? 0.4 : smoothPulse(cycle, 0.08, 0.72);
    if (cme.current) {
      cme.current.scale.setScalar(0.72 + cycle * 0.85);
      cme.current.rotation.x = Math.sin(effectTime * 0.025) * 0.18;
    }
    if (cmeMaterial.current) cmeMaterial.current.uniforms.uOpacity.value = active * 0.3;
  });
  return (
    <group ref={group}>
      <mesh scale={1.13} renderOrder={-1}>
        <sphereGeometry args={[radius, 48, 24]} />
        <shaderMaterial
          ref={corona}
          uniforms={coronaUniforms}
          vertexShader={/* glsl */ `
            #include <common>
            #include <logdepthbuf_pars_vertex>
            varying vec3 vNormalW;
            varying vec3 vPositionW;
            void main() {
              vec4 world = modelMatrix * vec4(position, 1.0);
              vPositionW = world.xyz;
              vNormalW = normalize(mat3(modelMatrix) * normal);
              gl_Position = projectionMatrix * viewMatrix * world;
              #include <logdepthbuf_vertex>
            }
          `}
          fragmentShader={/* glsl */ `
            #include <common>
            #include <logdepthbuf_pars_fragment>
            uniform float uTime;
            uniform float uOpacity;
            varying vec3 vNormalW;
            varying vec3 vPositionW;
            void main() {
              #include <logdepthbuf_fragment>
              vec3 viewDir = normalize(cameraPosition - vPositionW);
              float rim = pow(1.0 - max(dot(normalize(vNormalW), viewDir), 0.0), 4.2);
              float filament = 0.82 + 0.18 * sin(vPositionW.y * 0.23 + vPositionW.x * 0.11 + uTime * 0.08);
              float alpha = rim * filament * uOpacity;
              if (alpha < 0.004) discard;
              gl_FragColor = vec4(vec3(1.0, 0.48, 0.16), alpha);
            }
          `}
          transparent
          depthWrite={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      {loops.map((loop, index) => (
        <group key={index} rotation={loop.rotation}>
          <mesh position={[0, radius * 0.98, 0]}>
            <torusGeometry args={[loop.radius, loop.radius * 0.08, 8, 48, Math.PI]} />
            <meshBasicMaterial color="#ff8a3a" transparent opacity={0.42} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <points ref={cme} geometry={cmeGeometry} rotation={[0.35, -0.5, 0.2]} frustumCulled={false}>
        <shaderMaterial
          ref={cmeMaterial}
          uniforms={cmeUniforms}
          vertexShader={SOFT_POINT_VERTEX_SHADER}
          fragmentShader={SOFT_POINT_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
};

const smoothPulse = (phase: number, rise: number, fall: number) => {
  if (phase <= rise) return THREE.MathUtils.smoothstep(phase, 0, rise);
  if (phase >= fall) return 0;
  return 1 - THREE.MathUtils.smoothstep(phase, rise, fall);
};

/** Decorative cosmic-event image rendering is retired; physical systems render elsewhere. */
const CosmicAnomalies = () => null;

export default CosmicAnomalies;
