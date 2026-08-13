/**
 * Camera framing: how far back a camera has to sit to see the whole structure.
 *
 * This is a *view-only* concern and it is important that it stay that way. The
 * chain builder emits the structure in the canonical frame, wherever that puts
 * it in space; the viewport reacts by moving the camera. Nothing here transforms
 * a single atom — the geometry is never nudged to suit the view. (Repositioning
 * the structure itself is the separate reference-frame control, step 6.)
 *
 * Pure and framework-free, like the rest of lib/, so it can be unit-tested
 * without a renderer.
 */

import { add, distance, normalize, scale, vec3, type Vec3 } from './nerf.ts'
import type { Atom } from './types.ts'

/** A centre and a radius that together enclose every atom. */
export interface BoundingSphere {
  readonly center: Vec3
  /** Distance from `center` to the furthest atom. Zero for 0 or 1 atoms. */
  readonly radius: number
}

/**
 * A sphere enclosing all atoms, centred on the midpoint of their bounding box.
 *
 * Box-centred rather than centroid-centred so that a long chain with atoms
 * bunched at one end still frames symmetrically. Not the minimal enclosing
 * sphere — that is a harder problem than framing a camera warrants.
 *
 * An empty atom list gives a zero-radius sphere at the origin, which is the
 * blank-canvas case: the camera falls back to its default distance.
 */
export function boundingSphere(atoms: readonly Atom[]): BoundingSphere {
  const first = atoms[0]
  if (!first) return { center: vec3(0, 0, 0), radius: 0 }

  let min = first.position
  let max = first.position
  for (const atom of atoms) {
    const p = atom.position
    min = vec3(Math.min(min.x, p.x), Math.min(min.y, p.y), Math.min(min.z, p.z))
    max = vec3(Math.max(max.x, p.x), Math.max(max.y, p.y), Math.max(max.z, p.z))
  }

  const center = scale(add(min, max), 0.5)
  let radius = 0
  for (const atom of atoms) {
    radius = Math.max(radius, distance(center, atom.position))
  }
  return { center, radius }
}

/**
 * Distance from a bounding sphere's centre at which it exactly fills the
 * vertical field of view: r / sin(fov / 2).
 *
 * @param radius        bounding sphere radius, in ångströms
 * @param verticalFovDeg camera vertical field of view, in degrees
 * @param padding       multiplier on the result; > 1 leaves margin around the
 *                      structure. 1 means the sphere touches the frame edges.
 */
export function fitDistance(radius: number, verticalFovDeg: number, padding = 1): number {
  if (!Number.isFinite(radius) || radius < 0) {
    throw new Error(`radius must be a non-negative finite number, got ${radius}.`)
  }
  if (!(verticalFovDeg > 0) || verticalFovDeg >= 180) {
    throw new Error(`verticalFovDeg must be in (0, 180), got ${verticalFovDeg}.`)
  }
  if (!(padding > 0)) {
    throw new Error(`padding must be positive, got ${padding}.`)
  }
  return (radius / Math.sin(degToRadHalf(verticalFovDeg))) * padding
}

function degToRadHalf(deg: number): number {
  return (deg * Math.PI) / 360
}

/**
 * Where to put the camera, and what to look at, to frame a whole structure.
 *
 * The camera is offset along a fixed direction so that identical structures
 * always frame identically — deterministic in, deterministic out, the same
 * property the geometry itself has.
 *
 * @param minDistance floor on the camera distance, for the near-empty case: one
 *                    atom has radius 0 and would otherwise put the camera
 *                    inside it.
 */
export function frameCamera(
  atoms: readonly Atom[],
  options: {
    verticalFovDeg: number
    padding?: number
    direction?: Vec3
    minDistance?: number
  },
): { position: Vec3; target: Vec3 } {
  const { verticalFovDeg, padding = 1, minDistance = 0 } = options
  const direction = options.direction ?? vec3(0, 0, 1)
  const { center, radius } = boundingSphere(atoms)
  const distanceFromCenter = Math.max(fitDistance(radius, verticalFovDeg, padding), minDistance)
  const unit = normalize(direction, 'camera direction')
  return { position: add(center, scale(unit, distanceFromCenter)), target: center }
}
