// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { drainMarketEvents } from "./useMarketPulse";

/**
 * Comets fired by live market moves: green climbing, red falling, brighter
 * and faster for larger moves. Single instanced draw call, pooled — nothing
 * is allocated per frame.
 */

const MAX = 28;

interface Comet {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
  size: number;
}

const UP = new THREE.Color("#37ffb0");
const DOWN = new THREE.Color("#ff4d5e");

const MarketComets = ({ animate }: { animate: boolean }) => {
  const { camera } = useThree();
  const mesh = useRef<THREE.InstancedMesh>(null);

  const pool = useMemo<Comet[]>(
    () =>
      Array.from({ length: MAX }, () => ({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        color: new THREE.Color(),
        size: 1,
      })),
    [],
  );

  const tmp = useMemo(
    () => ({
      dummy: new THREE.Object3D(),
      x: new THREE.Vector3(),
      y: new THREE.Vector3(),
      z: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      c: new THREE.Color(),
      fwd: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((_, delta) => {
    const inst = mesh.current;
    if (!inst) return;
    const dt = Math.min(delta, 0.05);

    if (animate) {
      for (const ev of drainMarketEvents()) {
        const slot = pool.find((c) => !c.alive);
        if (!slot) break;
        // spawn just inside the view, crossing the frame
        camera.getWorldDirection(tmp.fwd);
        slot.pos
          .copy(camera.position)
          .addScaledVector(tmp.fwd, 220)
          .add(
            tmp.x.set(
              (Math.random() * 2 - 1) * 150,
              (Math.random() * 2 - 1) * 90,
              (Math.random() * 2 - 1) * 150,
            ),
          );
        slot.vel
          .set(Math.random() * 2 - 1, ev.direction * (0.4 + Math.random() * 0.6), Math.random() * 2 - 1)
          .normalize()
          .multiplyScalar(60 + ev.strength * 220);
        slot.color.copy(ev.direction > 0 ? UP : DOWN);
        slot.size = 0.6 + ev.strength * 2.4;
        slot.maxLife = 2.2 + ev.strength * 1.6;
        slot.life = slot.maxLife;
        slot.alive = true;
      }
    }

    for (let i = 0; i < MAX; i++) {
      const c = pool[i];
      if (!c.alive) {
        tmp.dummy.position.set(0, -1e6, 0);
        tmp.dummy.scale.set(0.0001, 0.0001, 0.0001);
        tmp.dummy.quaternion.identity();
        tmp.dummy.updateMatrix();
        inst.setMatrixAt(i, tmp.dummy.matrix);
        continue;
      }

      if (animate) {
        c.pos.addScaledVector(c.vel, dt);
        c.life -= dt;
        if (c.life <= 0) c.alive = false;
      }

      const fade = Math.max(0, Math.min(1, c.life / c.maxLife));
      const speed = c.vel.length();

      tmp.y.copy(c.vel).multiplyScalar(1 / Math.max(speed, 1e-4));
      tmp.x.copy(c.pos).sub(camera.position).normalize().cross(tmp.y);
      if (tmp.x.lengthSq() < 1e-6) tmp.x.set(1, 0, 0);
      tmp.x.normalize();
      tmp.z.copy(tmp.x).cross(tmp.y).normalize();
      tmp.m.makeBasis(tmp.x, tmp.y, tmp.z);

      tmp.dummy.position.copy(c.pos);
      tmp.dummy.quaternion.setFromRotationMatrix(tmp.m);
      tmp.dummy.scale.set(c.size * 1.6, c.size * (10 + speed * 0.1), 1);
      tmp.dummy.updateMatrix();
      inst.setMatrixAt(i, tmp.dummy.matrix);
      inst.setColorAt(i, tmp.c.copy(c.color).multiplyScalar(0.35 + fade * 1.1));
    }

    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined as never, undefined as never, MAX]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
};

export default MarketComets;
