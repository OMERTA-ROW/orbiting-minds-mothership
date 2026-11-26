// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as THREE from "three";
import MiningVessel from "./MiningVessel";
import { Draco, Grey } from "./AlienCrew";
import { oreMaps, plateMaps, rockMaps } from "./procTextures";
import { MINING_SHIP_SCALE, missionAt, shipTelemetry } from "./shipTelemetry";
import Starfield from "./Starfield";
import DeepSky from "./DeepSky";
import Sun from "./Sun";
import { SolarFlares } from "../CosmicAnomalies";
import { SPACE_TEXTURE_URLS, useLazyTexture } from "../realTextures";

/**
 * The alien mining world: a real-time surface where the vessel travels in,
 * approaches, lands, docks, extracts ore, secures the claim, defends it and
 * departs — then loops. Everything is live geometry driven by the mission clock.
 */

const rnd = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const PAD = new THREE.Vector3(0, 1.6, 0);
const ORE_FIELD = new THREE.Vector3(46, 9, -34);

/* ---------------- terrain ---------------- */

const Terrain = ({ full }: { full: boolean }) => {
  const maps = useMemo(() => rockMaps(), []);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(2400, 2400, full ? 220 : 100, full ? 220 : 100);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const r = rnd(9);
    const peaks = Array.from({ length: 40 }, () => ({
      x: (r() - 0.5) * 2100,
      y: (r() - 0.5) * 2100,
      h: 18 + r() * 130,
      s: 70 + r() * 260,
    }));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      let h = Math.sin(x * 0.012) * 3 + Math.cos(y * 0.017) * 3.4;
      for (const p of peaks) {
        const d = Math.hypot(x - p.x, y - p.y);
        h += p.h * Math.exp(-(d * d) / (2 * p.s * p.s));
      }
      // flatten the landing basin
      const dPad = Math.hypot(x, y);
      h *= THREE.MathUtils.clamp((dPad - 40) / 60, 0, 1);
      pos.setZ(i, h);
    }
    g.computeVertexNormals();
    return g;
  }, [full]);

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        ...maps,
        color: new THREE.Color("#8b7867"),
        roughness: 0.96,
        metalness: 0.05,
        normalScale: new THREE.Vector2(1.6, 1.6),
      }),
    [maps],
  );

  useMemo(() => {
    [mat.map, mat.normalMap, mat.roughnessMap].forEach((t) => t && t.repeat.set(140, 140));
  }, [mat]);

  return <mesh geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />;
};

/* ---------------- ore boulders ---------------- */

const OreField = ({ full }: { full: boolean }) => {
  const maps = useMemo(() => oreMaps(), []);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        ...maps,
        color: new THREE.Color("#7f8ea0"),
        roughness: 0.82,
        metalness: 0.35,
        emissive: new THREE.Color("#0e5f57"),
        emissiveIntensity: 0.35,
        normalScale: new THREE.Vector2(1.8, 1.8),
      }),
    [maps],
  );
  const items = useMemo(() => {
    const r = rnd(31);
    return Array.from({ length: full ? 120 : 42 }, () => ({
      p: [
        ORE_FIELD.x + (r() - 0.5) * 130,
        0,
        ORE_FIELD.z + (r() - 0.5) * 130,
      ] as [number, number, number],
      s: 1.2 + r() * 5.5,
      rot: [r() * 6.28, r() * 6.28, r() * 6.28] as [number, number, number],
    }));
  }, [full]);

  return (
    <group>
      {items.map((o, i) => (
        <mesh key={i} material={mat} position={o.p} rotation={o.rot} scale={o.s} castShadow>
          <dodecahedronGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
};

/* ---------------- outpost, pad and rigs ---------------- */

const Outpost = ({ animate, claimed }: { animate: boolean; claimed: number }) => {
  const maps = useMemo(() => plateMaps(), []);
  const metal = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        ...maps,
        color: new THREE.Color("#7b838d"),
        metalness: 0.9,
        roughness: 0.55,
      }),
    [maps],
  );
  const lights = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!lights.current || !animate) return;
    const t = state.clock.elapsedTime;
    lights.current.children.forEach((c, i) => {
      const l = c as THREE.PointLight;
      l.intensity = (1.4 + Math.sin(t * 2.4 + i) * 1.2) * (0.3 + claimed * 0.7);
    });
  });

  return (
    <group>
      {/* landing pad */}
      <mesh material={metal} position={[0, 0.6, 0]}>
        <cylinderGeometry args={[14, 15.5, 1.2, 40]} />
      </mesh>
      <mesh position={[0, 1.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[8, 9.4, 40]} />
        <meshBasicMaterial color="#20e0c4" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>

      {/* docking clamps */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <mesh key={i} material={metal} position={[Math.cos(a) * 10, 1.7, Math.sin(a) * 10]} rotation={[0, -a, 0.2]}>
            <boxGeometry args={[1.6, 1.4, 0.8]} />
          </mesh>
        );
      })}

      {/* refinery towers */}
      {[
        [-30, 0, 22],
        [-42, 0, -6],
        [26, 0, 30],
      ].map((p, i) => (
        <group key={i} position={p as [number, number, number]}>
          <mesh material={metal} position={[0, 7, 0]}>
            <cylinderGeometry args={[3.2, 4.2, 14, 18]} />
          </mesh>
          <mesh material={metal} position={[0, 15, 0]}>
            <cylinderGeometry args={[1.1, 1.1, 3, 12]} />
          </mesh>
          <mesh position={[0, 16.8, 0]}>
            <sphereGeometry args={[0.5, 12, 12]} />
            <meshBasicMaterial color="#ff5a3c" toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* claim beacons that come online during conquest */}
      <group ref={lights}>
        {[
          [22, 6, -14],
          [-18, 6, -26],
          [40, 6, 18],
        ].map((p, i) => (
          <pointLight key={i} position={p as [number, number, number]} color="#25f0c8" distance={70} intensity={1} />
        ))}
      </group>
      {[
        [22, 0, -14],
        [-18, 0, -26],
        [40, 0, 18],
      ].map((p, i) => (
        <mesh key={i} material={metal} position={[p[0], 3, p[2]]}>
          <cylinderGeometry args={[0.5, 0.9, 6, 10]} />
        </mesh>
      ))}
    </group>
  );
};

/* ---------------- ground crew ---------------- */

const GroundCrew = ({ animate, visible }: { animate: boolean; visible: boolean }) => {
  if (!visible) return null;
  return (
    <group position={[9, 1.2, 7]} scale={2.4}>
      <Draco position={[0, 0, 0]} rotation={[0, -0.5, 0]} animate={animate} seed={0.2} />
      <Grey position={[1.1, 0, 0.5]} rotation={[0, -1.2, 0]} animate={animate} seed={2.4} />
      <Grey position={[-1.0, 0, 0.8]} rotation={[0, 0.9, 0]} animate={animate} seed={4.1} />
    </group>
  );
};

/* ---------------- hostile drones + combat ---------------- */

const Hostiles = ({ animate, active }: { animate: boolean; active: number }) => {
  const group = useRef<THREE.Group>(null);
  const bolts = useRef<THREE.Group>(null);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: new THREE.Color("#3a2b2b"), metalness: 0.85, roughness: 0.4 }),
    [],
  );

  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;
    group.current?.children.forEach((c, i) => {
      const a = t * (0.5 + i * 0.08) + i * 2.1;
      c.position.set(Math.cos(a) * (38 + i * 7), 26 + Math.sin(a * 1.7) * 8, Math.sin(a) * (38 + i * 7) - 10);
      c.lookAt(shipTelemetry.position);
    });
    bolts.current?.children.forEach((c, i) => {
      const k = ((t * 1.6 + i * 0.33) % 1);
      c.position.lerpVectors(
        (group.current?.children[i % Math.max(1, group.current.children.length)]?.position ??
          new THREE.Vector3()) as THREE.Vector3,
        shipTelemetry.position,
        k,
      );
      (c as THREE.Mesh).visible = active > 0.05;
    });
  });

  return (
    <group visible={active > 0.02}>
      <group ref={group}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i}>
            <mesh material={mat} scale={[1.6, 0.5, 2.4]}>
              <octahedronGeometry args={[1.4, 0]} />
            </mesh>
            <mesh position={[0, 0, 2]}>
              <sphereGeometry args={[0.35, 10, 10]} />
              <meshBasicMaterial color="#ff3355" toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={bolts}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.32, 8, 8]} />
            <meshBasicMaterial color="#ff7a3c" toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

/* ---------------- the flying vessel, driven by mission beats ---------------- */

const smooth = (x: number) => x * x * (3 - 2 * x);

const MissionVessel = ({ animate, full }: { animate: boolean; full: boolean }) => {
  const ship = useRef<THREE.Group>(null);
  const clock = useRef(0);
  const prev = useRef(new THREE.Vector3());
  const beam = useRef(0);
  const throttle = useRef(0.6);
  const m = useRef(new THREE.Matrix4());
  const nextPos = useRef(new THREE.Vector3());
  const aim = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3(0, 1, 0));

  const posFor = (phase: string, p: number, time: number, out: THREE.Vector3) => {
    switch (phase) {
      case "travel":
        return out.set(-420 + p * 520, 96 - p * 26, 260 - p * 180);
      case "approach": {
        const a = p * Math.PI * 1.1;
        return out.set(Math.cos(a) * 150 * (1 - p * 0.55), 70 - p * 44, Math.sin(a) * 150 * (1 - p * 0.55));
      }
      case "landing": {
        const e = smooth(p);
        return out.set(
          THREE.MathUtils.lerp(-60, PAD.x, e),
          THREE.MathUtils.lerp(26, PAD.y + 2.6, smooth(Math.min(1, p * 1.15))),
          THREE.MathUtils.lerp(30, PAD.z, e),
        );
      }
      case "docked":
        return out.set(PAD.x, PAD.y + 2.4, PAD.z);
      case "mining": {
        const a = p * Math.PI * 2;
        return out.set(
          ORE_FIELD.x + Math.cos(a) * 26,
          ORE_FIELD.y + 10 + Math.sin(time * 0.8) * 0.6,
          ORE_FIELD.z + Math.sin(a) * 26,
        );
      }
      case "conquest": {
        const a = p * Math.PI * 2;
        return out.set(Math.cos(a) * 60, 22 + Math.sin(a * 2) * 5, Math.sin(a) * 60);
      }
      case "combat": {
        const a = p * Math.PI * 4;
        return out.set(Math.cos(a) * 70, 26 + Math.sin(a * 3) * 10, Math.sin(a * 1.3) * 70);
      }
      default:
        return out.set(p * 260, 22 + p * 200, -p * 320);
    }
  };

  // a view switch invalidates the shared pose until this scene writes one
  useEffect(() => () => { shipTelemetry.ready = false; }, []);

  useFrame((state, delta) => {
    if (!ship.current) return;
    const dt = Math.min(delta, 0.05);
    if (animate) clock.current += dt;
    const beat = missionAt(clock.current);

    prev.current.copy(ship.current.position);
    posFor(beat.phase, beat.progress, clock.current, nextPos.current);
    ship.current.position.lerp(nextPos.current, 1 - Math.exp(-3.2 * dt));

    // aim along travel, but hold a level nose while landed
    const grounded = beat.phase === "docked";
    if (!grounded) {
      posFor(beat.phase, Math.min(1, beat.progress + 0.03), clock.current + 0.4, aim.current);
      if (aim.current.distanceToSquared(ship.current.position) > 0.001) {
        m.current.lookAt(ship.current.position, aim.current, up.current);
        const q = new THREE.Quaternion().setFromRotationMatrix(m.current);
        q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
        ship.current.quaternion.slerp(q, 1 - Math.exp(-2.4 * dt));
      }
    }

    const targetBeam = beat.phase === "mining" ? 1 : 0;
    const targetThrottle =
      beat.phase === "docked" ? 0.06 : beat.phase === "mining" ? 0.3 : beat.phase === "combat" ? 1 : 0.66;
    beam.current = THREE.MathUtils.lerp(beam.current, targetBeam, 1 - Math.exp(-2 * dt));
    throttle.current = THREE.MathUtils.lerp(throttle.current, targetThrottle, 1 - Math.exp(-2 * dt));

    shipTelemetry.position.copy(ship.current.position);
    shipTelemetry.quaternion.copy(ship.current.quaternion);
    shipTelemetry.velocity.subVectors(ship.current.position, prev.current);
    shipTelemetry.throttle = throttle.current;
    shipTelemetry.scale = MINING_SHIP_SCALE;
    shipTelemetry.ready = true;
    shipTelemetry.phase = beat.phase;
    shipTelemetry.phaseProgress = beat.progress;
  });

  return (
    <group ref={ship}>
      <MiningVessel
        animate={animate}
        beam={beam.current}
        throttle={throttle.current}
        crew={full}
        scale={MINING_SHIP_SCALE}
      />
    </group>
  );
};

/* ---------------- sky and lighting ---------------- */

const skyMaterial = () =>
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 zenith = vec3(0.016, 0.024, 0.055);
        vec3 mid    = vec3(0.07, 0.06, 0.10);
        vec3 horizon= vec3(0.33, 0.17, 0.10);
        vec3 col = mix(horizon, mid, smoothstep(0.44, 0.56, h));
        col = mix(col, zenith, smoothstep(0.55, 0.95, h));
        // faint star dust above the horizon
        vec3 q = floor(vDir * 420.0);
        float s = hash(q);
        if (s > 0.9985 && vDir.y > 0.02) col += vec3(0.7, 0.75, 0.9) * (s - 0.9985) * 500.0;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

const AlienSky = ({ animate, full }: { animate: boolean; full: boolean }) => {
  const mat = useMemo(skyMaterial, []);
  const giantMap = useLazyTexture(SPACE_TEXTURE_URLS.Jupiter, { delay: full ? 220 : 500, anisotropy: full ? 4 : 1 });
  return (
    <group>
      <mesh material={mat} renderOrder={-1}>
        <sphereGeometry args={[2600, 40, 28]} />
      </mesh>
      {/* gas giant hanging over the horizon */}
      <mesh position={[-900, 300, -1500]}>
        <sphereGeometry args={[300, 48, 32]} />
        <meshStandardMaterial map={giantMap ?? undefined} color={giantMap ? "#ffffff" : "#7a5238"} roughness={0.82} metalness={0} fog={false} />
      </mesh>
      <group position={[1000, 420, -1400]} scale={3.75}>
        <Sun full={full} animate={animate} />
        <SolarFlares radius={16} animate={animate} full={full} />
      </group>
    </group>
  );
};

/** Local PMREM environment so the hull metal reflects something real. */
const SceneEnvironment = () => {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    const prev = scene.environment;
    scene.environment = env.texture;
    return () => {
      scene.environment = prev;
      env.texture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
};

const MiningWorld = ({ animate, full }: { animate: boolean; full: boolean }) => {
  const claimed = useRef(0);
  const combat = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const target = ["conquest", "combat", "departure"].includes(shipTelemetry.phase) ? 1 : 0;
    claimed.current = THREE.MathUtils.lerp(claimed.current, target, 1 - Math.exp(-1.2 * dt));
    combat.current = THREE.MathUtils.lerp(
      combat.current,
      shipTelemetry.phase === "combat" ? 1 : 0,
      1 - Math.exp(-1.6 * dt),
    );
  });

  return (
    <group>
      <SceneEnvironment />
      <DeepSky full={full} />
      <Starfield full={full} dpr={full ? 1.5 : 1} boost={0.7} animate={animate} />
      <AlienSky animate={animate} full={full} />
      <hemisphereLight args={["#6e7f9c", "#3a2b1e", 1.15]} />
      <directionalLight position={[900, 420, -600]} intensity={2.6} color="#ffdcb4" castShadow={false} />
      <ambientLight intensity={0.35} />
      

      <Terrain full={full} />
      <OreField full={full} />
      <Outpost animate={animate} claimed={claimed.current} />
      <GroundCrew animate={animate} visible={full} />
      <Hostiles animate={animate} active={combat.current} />
      <MissionVessel animate={animate} full={full} />
    </group>
  );
};

export default MiningWorld;
