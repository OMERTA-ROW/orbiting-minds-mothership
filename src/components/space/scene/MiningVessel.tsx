// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { forwardRef, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { shipHullMaps, shipPlateMaps, shipTrimMaps } from "./procTextures";
import { CockpitCrew } from "./AlienCrew";

/**
 * The mining vessel: a heavy industrial hauler built from real geometry with
 * machined-metal PBR maps (panel grid, weld seams, rivet rows, streak
 * weathering, chipped paint), clear-coated hull shading, glowing engines,
 * a glass canopy with a visible alien crew and a mining beam rig.
 *
 * The craft has no landing gear — it never deploys legs in any view.
 */

interface Props {
  animate?: boolean;
  /** 0 = engines idle, 1 = full burn */
  throttle?: number;
  /** 0 = beam off, 1 = full extraction beam */
  beam?: number;
  /** show the crew behind the canopy (skipped in lite mode for cost) */
  crew?: boolean;
  scale?: number;
}

const useHullMaterials = () => {
  const hull = useMemo(() => shipHullMaps(), []);
  const plate = useMemo(() => shipPlateMaps(), []);
  const trim = useMemo(() => shipTrimMaps(), []);

  return useMemo(() => {
    // Clear-coated, fully map-driven metal: roughness and metalness come from
    // the textures so light breaks across plates instead of over the whole hull.
    const primary = new THREE.MeshPhysicalMaterial({
      ...hull,
      color: new THREE.Color("#aeb6c0"),
      metalness: 1,
      roughness: 1,
      normalScale: new THREE.Vector2(1.25, 1.25),
      envMapIntensity: 1.15,
      clearcoat: 0.45,
      clearcoatRoughness: 0.42,
    });
    const secondary = new THREE.MeshPhysicalMaterial({
      ...plate,
      color: new THREE.Color("#767f8a"),
      metalness: 1,
      roughness: 1,
      normalScale: new THREE.Vector2(1.35, 1.35),
      envMapIntensity: 0.95,
      clearcoat: 0.25,
      clearcoatRoughness: 0.6,
    });
    const accent = new THREE.MeshPhysicalMaterial({
      ...trim,
      color: new THREE.Color("#d08a38"),
      metalness: 1,
      roughness: 1,
      normalScale: new THREE.Vector2(1.1, 1.1),
      envMapIntensity: 0.9,
      clearcoat: 0.55,
      clearcoatRoughness: 0.35,
    });
    // Dark heat-soaked metal for nozzles, radiators and greebles.
    const dark = new THREE.MeshStandardMaterial({
      ...plate,
      color: new THREE.Color("#3c4149"),
      metalness: 1,
      roughness: 1,
      normalScale: new THREE.Vector2(1.5, 1.5),
      envMapIntensity: 0.7,
    });
    // Canopy glass: transmission handles the see-through look, so the mesh
    // stays in the opaque pass with a single front face. Rendering it as a
    // double-sided *transparent* sphere made front/back faces re-sort every
    // frame, which read as the canopy flashing while the ship manoeuvred.
    const glass = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#0b1a20"),
      metalness: 0,
      roughness: 0.04,
      transmission: 0.72,
      thickness: 0.35,
      transparent: false,
      opacity: 1,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      ior: 1.45,
      side: THREE.FrontSide,
    });

    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color("#39e6ff"), toneMapped: false });
    // Physically-styled exhaust: white-hot core with shock diamonds near the
    // nozzle, turbulent flame body cooling to amber and red at the tail,
    // soft view-dependent edges so the plume reads as gas, not a cone.
    const engineGlow = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uThrottle: { value: 0.5 }, uOpacity: { value: 0.9 } },
      vertexShader: `
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime; uniform float uThrottle; uniform float uOpacity;
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*n(p); p*=2.03; a*=0.5; } return v; }
        void main(){
          float a = clamp(vUv.y, 0.0, 1.0);           // 0 at nozzle -> 1 at tail
          vec2 q = vec2(vUv.x * 10.0, a * 5.0 - uTime * 6.0);
          float turb = fbm(q + fbm(q * 1.7 + uTime * 0.8));
          float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); // soft gas edges
          float core = exp(-a * 5.0);
          float diamonds = (0.5 + 0.5 * cos(a * 34.0)) * exp(-a * 6.0) * uThrottle;
          float heat = clamp(core * 1.2 + diamonds * 0.6 + (1.0 - a) * 0.35 * turb, 0.0, 1.0);
          vec3 red = vec3(0.55, 0.08, 0.02);
          vec3 orange = vec3(1.0, 0.42, 0.08);
          vec3 yellow = vec3(1.0, 0.78, 0.36);
          vec3 white = vec3(1.0, 0.97, 0.9);
          vec3 col = mix(red, orange, smoothstep(0.05, 0.35, heat));
          col = mix(col, yellow, smoothstep(0.35, 0.65, heat));
          col = mix(col, white, smoothstep(0.65, 0.95, heat));
          // faint blue combustion zone right at the nozzle exit
          col = mix(col, vec3(0.55, 0.75, 1.0), exp(-a * 22.0) * 0.5);
          float alpha = rim * (1.0 - smoothstep(0.55, 1.0, a + (turb - 0.5) * 0.35));
          alpha *= 0.55 + turb * 0.65;
          gl_FragColor = vec4(col * (1.0 + heat * 1.5), clamp(alpha * uOpacity, 0.0, 1.0));
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    return { primary, secondary, accent, dark, glass, glow, engineGlow };
  }, [hull, plate, trim]);
};

const MiningVessel = forwardRef<THREE.Group, Props>(
  ({ animate = true, throttle = 0.5, beam = 0, crew = true, scale = 1 }, ref) => {
    const mats = useHullMaterials();
    const plumeA = useRef<THREE.Mesh>(null);
    const plumeB = useRef<THREE.Mesh>(null);
    const beamRef = useRef<THREE.Mesh>(null);
    const beacon = useRef<THREE.PointLight>(null);
    const drill = useRef<THREE.Group>(null);

    useFrame((state) => {
      const t = state.clock.elapsedTime;
      const flicker = 0.88 + Math.sin(t * 24) * 0.06 + Math.sin(t * 7.3) * 0.06;
      const len = 0.6 + throttle * 3.4;
      const fu = mats.engineGlow.uniforms;
      if (animate) fu.uTime.value = t;
      fu.uThrottle.value = throttle;
      fu.uOpacity.value = 0.45 + throttle * 0.55;
      [plumeA, plumeB].forEach((p) => {
        if (!p.current) return;
        p.current.scale.set(1, animate ? len * flicker : len, 1);
        p.current.position.z = -2.45 - (len * (animate ? flicker : 1)) * 0.5;
      });

      if (beamRef.current) {
        beamRef.current.visible = beam > 0.01;
        const wobble = animate ? 0.9 + Math.sin(t * 9) * 0.1 : 1;
        beamRef.current.scale.set(beam * wobble, 1, beam * wobble);
        (beamRef.current.material as THREE.Material).opacity = 0.28 * beam * wobble;
      }
      if (drill.current && animate) drill.current.rotation.z = t * (2 + beam * 12);
      if (beacon.current) beacon.current.intensity = 2 + Math.sin(t * 3.4) * 1.6;
    });

    return (
      <group ref={ref} scale={scale}>
        {/* ---- main fuselage ---- */}
        <mesh material={mats.primary} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.72, 3.1, 12, 40]} />
        </mesh>
        {/* hull strakes: raised plating that catches the light along the body */}
        {[-0.52, 0.52].map((x) => (
          <mesh key={`strake${x}`} material={mats.secondary} position={[x, 0.18, -0.2]} rotation={[0, 0, x > 0 ? -0.18 : 0.18]} castShadow>
            <boxGeometry args={[0.16, 0.1, 3.0]} />
          </mesh>
        ))}
        {/* belly keel */}
        <mesh material={mats.secondary} position={[0, -0.66, -0.35]} castShadow>
          <boxGeometry args={[0.9, 0.18, 2.6]} />
        </mesh>
        {/* spine / dorsal ridge */}
        <mesh material={mats.secondary} position={[0, 0.62, -0.3]} castShadow>
          <boxGeometry args={[0.7, 0.34, 2.4]} />
        </mesh>
        {/* dorsal greebles: avionics boxes and antennae */}
        {[-0.9, -0.35, 0.25].map((z, i) => (
          <mesh key={`box${z}`} material={mats.dark} position={[i % 2 ? 0.2 : -0.2, 0.82, z]} castShadow>
            <boxGeometry args={[0.22, 0.12, 0.34]} />
          </mesh>
        ))}
        <mesh material={mats.dark} position={[0, 1.05, -1.1]} castShadow>
          <cylinderGeometry args={[0.018, 0.03, 0.7, 8]} />
        </mesh>
        {/* radiator fins along the spine */}
        {[-1.25, -1.0, -0.75].map((z) => (
          <mesh key={`fin${z}`} material={mats.dark} position={[0, 0.9, z]} castShadow>
            <boxGeometry args={[1.5, 0.02, 0.12]} />
          </mesh>
        ))}
        {/* nose — seated slightly forward with a smaller base so its rim cuts
            cleanly through the fuselage cap instead of grazing it tangentially,
            which produced a z-fighting seam that shimmered as the ship moved */}
        <mesh material={mats.primary} position={[0, 0.02, 2.3]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <coneGeometry args={[0.68, 1.12, 40]} />
        </mesh>

        {/* nose ring and sensor head */}
        <mesh material={mats.accent} position={[0, 0.02, 1.94]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.7, 0.045, 10, 40]} />
        </mesh>
        <mesh material={mats.dark} position={[0, -0.16, 2.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.09, 0.12, 0.22, 16]} />
        </mesh>

        {/* ---- cockpit ---- */}
        <group position={[0, 0.36, 1.42]}>
          <mesh material={mats.secondary} position={[0, -0.16, 0]} castShadow>
            <boxGeometry args={[1.14, 0.36, 1.1]} />
          </mesh>
          {/* canopy frame ribs */}
          <mesh material={mats.dark} position={[0, 0.1, 0.06]} rotation={[Math.PI / 2, 0, 0]} scale={[1.02, 1.06, 1]}>
            <torusGeometry args={[0.55, 0.02, 8, 40]} />
          </mesh>
          <mesh material={mats.dark} position={[0, 0.1, 0.06]} rotation={[0, Math.PI / 2, 0]} scale={[1.06, 0.64, 1]}>
            <torusGeometry args={[0.55, 0.02, 8, 40]} />
          </mesh>
          <mesh material={mats.glass} position={[0, 0.1, 0.06]} scale={[1, 0.62, 1.05]}>
            <sphereGeometry args={[0.56, 32, 24]} />
          </mesh>
          {crew && (
            <group position={[0, -0.06, -0.06]} scale={0.42}>
              <CockpitCrew animate={animate} />
              <pointLight color="#2ad4ff" intensity={1.4} distance={3} position={[0, 0.8, 0.6]} />
            </group>
          )}
        </group>

        {/* ---- cargo ore pods ---- */}
        {[-1.28, 1.28].map((x) => (
          <group key={x} position={[x, -0.12, -0.5]}>
            <mesh material={mats.secondary} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.36, 0.36, 2.1, 32]} />
            </mesh>
            {/* banding ribs */}
            {[-0.6, 0, 0.6].map((z) => (
              <mesh key={`rib${z}`} material={mats.dark} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.37, 0.025, 8, 28]} />
              </mesh>
            ))}
            <mesh material={mats.accent} position={[0, 0, 0.85]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.38, 0.38, 0.18, 32]} />
            </mesh>
            {/* pylon tying the pod to the hull */}
            <mesh material={mats.primary} position={[x > 0 ? -0.5 : 0.5, 0.1, 0.2]} castShadow>
              <boxGeometry args={[0.62, 0.16, 0.9]} />
            </mesh>
            <mesh material={mats.dark} position={[x > 0 ? -0.5 : 0.5, -0.05, -0.55]} castShadow>
              <boxGeometry args={[0.5, 0.1, 0.4]} />
            </mesh>
          </group>
        ))}

        {/* ---- engines ---- */}
        {[-0.82, 0.82].map((x, i) => (
          <group key={x} position={[x, -0.05, -1.72]}>
            <mesh material={mats.primary} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.42, 0.5, 1.3, 32]} />
            </mesh>
            {/* cooling shroud */}
            <mesh material={mats.dark} position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.45, 0.05, 10, 32]} />
            </mesh>
            {/* bell nozzle */}
            <mesh material={mats.dark} position={[0, 0, -0.78]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.5, 0.34, 0.36, 32, 1, true]} />
            </mesh>
            <mesh material={mats.accent} position={[0, 0, -0.68]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.5, 0.4, 0.16, 32]} />
            </mesh>
            <mesh material={mats.glow} position={[0, 0, -0.86]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.33, 0.33, 0.06, 24]} />
            </mesh>
            {/* exhaust plume */}
            <mesh
              ref={i === 0 ? plumeA : plumeB}
              material={mats.engineGlow}
              position={[0, 0, -2.45]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <coneGeometry args={[0.34, 1, 32, 16, true]} />
            </mesh>
            <pointLight color="#ffa04a" intensity={2.2 + throttle * 4} distance={9} position={[0, 0, -1]} />
          </group>
        ))}

        {/* ---- mining rig under the belly ---- */}
        <group position={[0, -0.66, 0.55]}>
          <mesh material={mats.secondary} castShadow>
            <boxGeometry args={[0.7, 0.3, 0.9]} />
          </mesh>
          <group ref={drill} position={[0, -0.24, 0]}>
            <mesh material={mats.accent} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.2, 0.1, 0.42, 20]} />
            </mesh>
          </group>
          {/* extraction beam */}
          <mesh ref={beamRef} position={[0, -6.2, 0]} material-transparent>
            <cylinderGeometry args={[0.22, 1.5, 12, 24, 1, true]} />
            <meshBasicMaterial
              color="#37f0d8"
              transparent
              opacity={0.25}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>

        {/* running lights */}
        <mesh material={mats.glow} position={[-1.66, -0.12, -0.5]}>
          <sphereGeometry args={[0.055, 12, 12]} />
        </mesh>
        <mesh position={[1.66, -0.12, -0.5]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshBasicMaterial color="#ff4d5e" toneMapped={false} />
        </mesh>
        <pointLight ref={beacon} color="#39e6ff" intensity={2} distance={7} position={[0, 0.9, 0.2]} />
      </group>
    );
  },
);

MiningVessel.displayName = "MiningVessel";

export default MiningVessel;
