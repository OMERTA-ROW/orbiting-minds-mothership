// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import * as THREE from "three";

/**
 * Shared render transform for the vessel.
 *
 * The model is built nosing along +Z while `Matrix4.lookAt` produces a frame
 * that looks down -Z, so a fixed 180-degree yaw has to be folded into the
 * *target* pose. Applying it to the group after interpolation (the old
 * behaviour) fed an already-corrected quaternion back into the next frame's
 * slerp, which flipped the ship 180 degrees every frame — the visible glitch.
 *
 * Pure maths, no scene access, so it can be unit tested against a recorded
 * quaternion sequence.
 */

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);

/** Fixed model-axis correction: lookAt faces -Z, the hull noses along +Z. */
export const MODEL_NOSE_FLIP = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);

/** How fast the rendered pose chases the autopilot heading (per second). */
const POSE_DAMPING = 3;

export interface PoseInput {
  position: THREE.Vector3;
  forward: THREE.Vector3;
  roll: number;
  dt: number;
  animate: boolean;
}

export class ShipPose {
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  /** Per-frame positional delta; zero on the first frame and while paused. */
  readonly velocity = new THREE.Vector3();
  initialized = false;

  private readonly target = new THREE.Quaternion();
  private readonly roll = new THREE.Quaternion();
  private readonly look = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly prev = new THREE.Vector3();

  /** Target pose including the fixed model-axis correction and the bank. */
  poseFor(position: THREE.Vector3, forward: THREE.Vector3, roll: number, out: THREE.Quaternion) {
    this.look.copy(position).add(forward);
    this.matrix.lookAt(position, this.look, UP);
    out.setFromRotationMatrix(this.matrix);
    this.roll.setFromAxisAngle(FORWARD_AXIS, roll);
    out.multiply(this.roll).multiply(MODEL_NOSE_FLIP);
    return out;
  }

  update({ position, forward, roll, dt, animate }: PoseInput) {
    this.poseFor(position, forward, roll, this.target);

    if (!this.initialized) {
      // start directly at a valid pose instead of spinning up from identity
      this.quaternion.copy(this.target);
      this.position.copy(position);
      this.prev.copy(position);
      this.velocity.set(0, 0, 0);
      this.initialized = true;
      return this;
    }

    // frame-rate independent damping; a frozen scene holds the current pose
    if (animate && dt > 0) {
      this.quaternion.slerp(this.target, 1 - Math.exp(-POSE_DAMPING * dt));
      this.quaternion.normalize();
    }

    this.prev.copy(this.position);
    this.position.copy(position);
    this.velocity.subVectors(this.position, this.prev);
    if (!animate) this.velocity.set(0, 0, 0);
    return this;
  }
}
