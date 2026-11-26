// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
/**
 * Single source of truth for the size of the solar-system view.
 *
 * The scene used to live inside a ~320-unit orbital radius with a 4,200-unit
 * backdrop sphere and a 9,000-unit far plane. Everything spatial is now
 * derived from WORLD_SCALE so the flight volume, the star shells, the
 * backdrop and the camera clipping stay consistent with each other.
 */

/** Multiplier applied to every legacy distance in the solar view. */
export const WORLD_SCALE = 3.6;

/** Radius of the outermost planetary orbit after scaling (~1,152 units). */
export const OUTER_ORBIT = 320 * WORLD_SCALE;

/** Radius of the sphere the ship's hauling route is allowed to occupy. */
export const TRAVEL_RADIUS = OUTER_ORBIT * 1.35;

/** Inward-facing backdrop sphere. Far enough that no edge is ever reached. */
export const SKY_RADIUS = 26000;

/** Camera clipping adapted to the expanded world. */
export const CAMERA_NEAR = 0.6;
export const CAMERA_FAR = SKY_RADIUS * 1.6;
