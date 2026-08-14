/**
 * Rigid transforms — the reference-frame / origin control.
 *
 * Pure and framework-free, like the rest of lib/. This module knows nothing about
 * residues, angles or NeRF; it moves points.
 *
 * **This is applied to the finished atom list, after NeRF construction.** It never
 * enters lib/chain.ts and never touches an angle input. claude.md requires the two
 * systems stay decoupled, and the reason is worth stating plainly: a rigid motion
 * cannot change a bond length, a bond angle, or a dihedral. So no matter what the
 * user does with the origin, the reconstruction it was measured from is untouched
 * — which is also exactly why the tests below are able to assert that.
 *
 * Rotations are unit quaternions internally and Euler degrees at the UI boundary,
 * because the panel types degrees and quaternions compose without gimbal lock.
 */

import { add, cross, dot, degToRad, scale, sub, vec3, type Vec3 } from './nerf.ts'
import type { Atom } from './types.ts'

/** A unit quaternion. `w` is the scalar part. */
export interface Quat {
  readonly w: number
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * A rotation about the world origin followed by a translation.
 *
 * Applied as `p ↦ rotation · p + translation`. Order matters and this is the only
 * order used anywhere in this module.
 */
export interface RigidTransform {
  readonly rotation: Quat
  readonly translation: Vec3
}

export const IDENTITY_QUAT: Quat = { w: 1, x: 0, y: 0, z: 0 }

export const IDENTITY_TRANSFORM: RigidTransform = {
  rotation: IDENTITY_QUAT,
  translation: vec3(0, 0, 0),
}

// --- quaternions -----------------------------------------------------------

export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  }
}

/** The inverse rotation. For a unit quaternion this is the conjugate. */
export function quatConjugate(q: Quat): Quat {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z }
}

export function quatNorm(q: Quat): number {
  return Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z)
}

/**
 * Rescale to unit length.
 *
 * Composing many rotations accumulates floating-point drift away from the unit
 * sphere, and a non-unit quaternion scales the model as well as rotating it —
 * which would be a rigid transform that isn't rigid, silently changing bond
 * lengths. Everything that produces a quaternion here normalises.
 */
export function quatNormalize(q: Quat): Quat {
  const n = quatNorm(q)
  if (n === 0) {
    throw new Error('Cannot normalize a zero quaternion.')
  }
  return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n }
}

export function quatFromAxisAngle(axis: Vec3, degrees: number): Quat {
  const length = Math.sqrt(dot(axis, axis))
  if (length === 0) {
    throw new Error('Rotation axis must be non-zero.')
  }
  const half = degToRad(degrees) / 2
  const s = Math.sin(half) / length
  return quatNormalize({ w: Math.cos(half), x: axis.x * s, y: axis.y * s, z: axis.z * s })
}

/**
 * A rotation from three Euler angles in degrees.
 *
 * Extrinsic XYZ: rotate about world X, then world Y, then world Z, i.e.
 * `R = Rz · Ry · Rx`. Stated because there are two dozen conventions and a panel
 * that types "rotate Y by 90" has to mean one of them; this one reads as "spin
 * about each world axis in turn", which is what someone typing into three boxes
 * labelled x/y/z expects.
 */
export function quatFromEulerDegrees(x: number, y: number, z: number): Quat {
  const qx = quatFromAxisAngle(vec3(1, 0, 0), x)
  const qy = quatFromAxisAngle(vec3(0, 1, 0), y)
  const qz = quatFromAxisAngle(vec3(0, 0, 1), z)
  return quatNormalize(quatMultiply(quatMultiply(qz, qy), qx))
}

/** Rotate a vector by a unit quaternion. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2w(qv × v) + 2(qv × (qv × v)) — the standard expansion of
  // q·(0,v)·q*, which avoids building a matrix.
  const qv = vec3(q.x, q.y, q.z)
  const t = scale(cross(qv, v), 2)
  return add(add(v, scale(t, q.w)), cross(qv, t))
}

// --- transforms ------------------------------------------------------------

export function applyToPoint(t: RigidTransform, p: Vec3): Vec3 {
  return add(rotate(t.rotation, p), t.translation)
}

/**
 * The transform equivalent to applying `inner` first, then `outer`.
 *
 * `p ↦ Rₒ(Rᵢp + dᵢ) + dₒ = (RₒRᵢ)p + (Rₒdᵢ + dₒ)`.
 */
export function compose(outer: RigidTransform, inner: RigidTransform): RigidTransform {
  return {
    rotation: quatNormalize(quatMultiply(outer.rotation, inner.rotation)),
    translation: add(rotate(outer.rotation, inner.translation), outer.translation),
  }
}

/** The transform that undoes `t`. */
export function invert(t: RigidTransform): RigidTransform {
  const rotation = quatConjugate(t.rotation)
  return { rotation, translation: rotate(rotation, scale(t.translation, -1)) }
}

export function isIdentityTransform(t: RigidTransform, epsilon = 1e-12): boolean {
  return (
    Math.abs(t.translation.x) <= epsilon &&
    Math.abs(t.translation.y) <= epsilon &&
    Math.abs(t.translation.z) <= epsilon &&
    Math.abs(Math.abs(t.rotation.w) - 1) <= epsilon
  )
}

/**
 * The transform that rotates by `rotation` and lands `anchor` exactly on `target`.
 *
 * This one function is both origin modes the UI offers, which is why they share an
 * implementation rather than resembling each other:
 *
 *  - **Place** — anchor is Cα of residue 1, target is the x/y/z the user typed.
 *  - **Pick**  — anchor is whichever atom the user clicked, target is (0, 0, 0).
 *
 * Solving `R·anchor + d = target` for the translation gives `d = target − R·anchor`,
 * so the anchor lands on the target *exactly*, not to within a tolerance. The
 * rotation is about the anchor, not about the world origin, which is what makes
 * typing an orientation feel like turning the molecule in place.
 */
export function frameOn(anchor: Vec3, target: Vec3, rotation: Quat): RigidTransform {
  const unit = quatNormalize(rotation)
  return { rotation: unit, translation: sub(target, rotate(unit, anchor)) }
}

/**
 * Move every atom by `t`, preserving all of its other fields.
 *
 * Returns the input array itself when `t` is the identity. That is not a
 * micro-optimisation: the rest of the app leans on atom identity to decide what
 * needs redrawing, and the default state of this feature is the identity, so an
 * untouched origin must not make every atom look new on every render.
 */
export function applyToAtoms(t: RigidTransform, atoms: readonly Atom[]): readonly Atom[] {
  if (isIdentityTransform(t)) return atoms
  return atoms.map((atom) => ({ ...atom, position: applyToPoint(t, atom.position) }))
}
