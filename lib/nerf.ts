/**
 * NeRF (Natural Extension Reference Frame) placement math.
 *
 * Parsons, Holmes, Rojas, Tsai & Strauss (2005), "Practical conversion from
 * torsion space to Cartesian space for in silico protein synthesis."
 *
 * Pure and framework-free by design (see claude.md): no React, no Three.js, no
 * DOM. Everything here is a small referentially-transparent function over plain
 * numbers so the geometry can be unit-tested on its own.
 *
 * There is deliberately no energy minimisation, clash relaxation, or any other
 * "make it look right" post-processing anywhere in this file. Given three prior
 * atoms and (bond length, bond angle, dihedral), the next atom's position is
 * uniquely determined, and that determinism is the entire point of the tool.
 */

/** A point or displacement in 3D space, in ångströms. */
export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** Below this magnitude a vector is treated as degenerate (zero-length). */
const EPSILON = 1e-12

// ---------------------------------------------------------------------------
// Angle conversion
// ---------------------------------------------------------------------------

export const degToRad = (degrees: number): number => (degrees * Math.PI) / 180

export const radToDeg = (radians: number): number => (radians * 180) / Math.PI

/** Wrap an angle in degrees into the half-open interval (-180, 180]. */
export function normalizeDegrees(degrees: number): number {
  const wrapped = ((degrees + 180) % 360 + 360) % 360 - 180
  // The modulo above maps exactly 180 to -180; IUPAC convention prefers +180.
  return wrapped === -180 ? 180 : wrapped
}

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z })

export const add = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.x + b.x, a.y + b.y, a.z + b.z)

export const sub = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.x - b.x, a.y - b.y, a.z - b.z)

export const scale = (v: Vec3, k: number): Vec3 => vec3(v.x * k, v.y * k, v.z * k)

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z

export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)

export const norm = (v: Vec3): number => Math.sqrt(dot(v, v))

/** Scale a vector to unit length. Throws rather than returning NaN if degenerate. */
export function normalize(v: Vec3, what = 'vector'): Vec3 {
  const length = norm(v)
  if (length < EPSILON) {
    throw new Error(`Cannot normalize a zero-length ${what}.`)
  }
  return scale(v, 1 / length)
}

/** Distance between two points, in ångströms. */
export const distance = (a: Vec3, b: Vec3): number => norm(sub(a, b))

// ---------------------------------------------------------------------------
// Measurement (the inverse direction: Cartesian -> internal coordinates)
// ---------------------------------------------------------------------------

/**
 * The angle A-B-C at vertex B, in degrees, in [0, 180].
 *
 * Computed via atan2 of the cross and dot products rather than acos(dot), which
 * loses precision for near-collinear atoms.
 */
export function bondAngle(a: Vec3, b: Vec3, c: Vec3): number {
  const ba = sub(a, b)
  const bc = sub(c, b)
  if (norm(ba) < EPSILON || norm(bc) < EPSILON) {
    throw new Error('Cannot measure a bond angle from coincident atoms.')
  }
  return radToDeg(Math.atan2(norm(cross(ba, bc)), dot(ba, bc)))
}

/**
 * The signed dihedral (torsion) A-B-C-D in degrees, in (-180, 180], following
 * the IUPAC convention: sighting down B->C, it is the angle from the projected
 * B->A direction to the projected C->D direction, positive for a clockwise
 * rotation.
 *
 * This is the exact inverse of the dihedral argument to `placeAtom`, which is
 * what the round-trip fixture test relies on.
 */
export function dihedral(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const b1 = sub(b, a)
  const b2 = sub(c, b)
  const b3 = sub(d, c)

  const n1 = cross(b1, b2)
  const n2 = cross(b2, b3)
  if (norm(n1) < EPSILON || norm(n2) < EPSILON) {
    throw new Error('Cannot measure a dihedral through three collinear atoms.')
  }

  // m1 completes a frame with n1 and the B->C axis, letting us read both
  // components of the angle and recover its sign from a single atan2. The
  // cross-product order is what fixes the sign to the IUPAC convention: it is
  // checked against real data (ubiquitin's α-helix must come out at φ ≈ -60°,
  // not +60° — L-amino acid backbones are overwhelmingly negative in φ).
  const axis = normalize(b2, 'central bond')
  const m1 = cross(axis, n1)
  return radToDeg(Math.atan2(dot(m1, n2), dot(n1, n2)))
}

// ---------------------------------------------------------------------------
// Placement (internal coordinates -> Cartesian)
// ---------------------------------------------------------------------------

/**
 * The NeRF core: place atom D given three previously-placed atoms A, B, C.
 *
 * @param a             first prior atom, defines the dihedral reference plane
 * @param b             second prior atom
 * @param c             third prior atom; D is bonded to this one
 * @param bondLength    C–D distance, in ångströms
 * @param bondAngleDeg  the B-C-D angle, in degrees
 * @param dihedralDeg   the A-B-C-D dihedral, in degrees
 *
 * The construction: build an orthonormal frame at C from the prior three atoms,
 * express D's offset in that local frame in spherical form, then rotate it into
 * world space. Closed form — no iteration, no fitting.
 *
 * Guaranteed inverse of the measurement functions above:
 *   distance(c, D)         === bondLength
 *   bondAngle(b, c, D)     === bondAngleDeg
 *   dihedral(a, b, c, D)   === dihedralDeg   (mod 360)
 */
export function placeAtom(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  bondLength: number,
  bondAngleDeg: number,
  dihedralDeg: number,
): Vec3 {
  if (!Number.isFinite(bondLength) || bondLength <= 0) {
    throw new Error(`Bond length must be a positive number, got ${bondLength}.`)
  }
  if (!Number.isFinite(bondAngleDeg) || !Number.isFinite(dihedralDeg)) {
    throw new Error('Bond angle and dihedral must be finite numbers.')
  }

  // Local frame at C: bc points along the bond being extended, n is the normal
  // of the A-B-C plane, and their cross product completes a right-handed basis.
  const bc = normalize(sub(c, b), 'B->C bond')
  const n = normalize(cross(sub(b, a), bc), 'A-B-C plane normal (atoms collinear?)')
  const p = cross(n, bc)

  const theta = degToRad(bondAngleDeg)
  const phi = degToRad(dihedralDeg)
  const sinTheta = Math.sin(theta)

  // D in the local frame. The -cos(theta) on the bc axis is what makes the
  // measured B-C-D angle come out as theta rather than its supplement.
  const local = vec3(
    -bondLength * Math.cos(theta),
    bondLength * sinTheta * Math.cos(phi),
    bondLength * sinTheta * Math.sin(phi),
  )

  // Rotate the local offset into world space and hang it off C.
  return add(
    c,
    vec3(
      bc.x * local.x + p.x * local.y + n.x * local.z,
      bc.y * local.x + p.y * local.y + n.y * local.z,
      bc.z * local.x + p.z * local.y + n.z * local.z,
    ),
  )
}
