import { describe, expect, it } from 'vitest'

import { buildAtoms, firstChangedIndex } from '../lib/chain.ts'
import { bondAngle, dihedral, distance, normalizeDegrees, vec3, type Vec3 } from '../lib/nerf.ts'
import {
  applyToAtoms,
  applyToPoint,
  compose,
  frameOn,
  IDENTITY_QUAT,
  IDENTITY_TRANSFORM,
  invert,
  isIdentityTransform,
  quatFromAxisAngle,
  quatFromEulerDegrees,
  quatMultiply,
  quatNorm,
  quatNormalize,
  rotate,
  type RigidTransform,
} from '../lib/transform.ts'
import type { Residue } from '../lib/types.ts'
import fixture from './fixtures/1ubq-backbone.json' with { type: 'json' }

/**
 * Tests for the reference-frame transform.
 *
 * The premise of the whole feature is that moving the origin cannot corrupt the
 * angle-driven geometry, so that is what most of this file asserts — not by
 * inspecting the code path but by measuring the structure. A rigid motion cannot
 * change a bond length, a bond angle or a dihedral, so if every internal
 * coordinate of the transformed 1UBQ backbone still matches the deposited values,
 * the transform provably didn't touch the reconstruction.
 */

const ubiquitin: Residue[] = fixture.residues.map((r) => ({
  id: `ubq-${r.residueSeq}`,
  aminoAcid: r.residueName as Residue['aminoAcid'],
  phi: r.phi ?? 0,
  psi: r.psi ?? 0,
  omega: r.omega ?? 180,
}))

const atoms = buildAtoms(ubiquitin)

/** A rotation and translation with nothing special about them. */
const arbitrary: RigidTransform = {
  rotation: quatFromEulerDegrees(37, -114, 62),
  translation: vec3(-8.25, 41.5, 17.125),
}

/**
 * Assert two dihedrals are the same angle.
 *
 * Dihedrals are periodic, so 180° and −180° are equal and a plain numeric
 * comparison of them fails by 360. Compare the wrapped difference instead — this
 * is about the comparison, not a tolerance on the geometry: the bound below is
 * still tighter than any real error would be.
 */
function expectSameAngle(actual: number, expected: number): void {
  expect(Math.abs(normalizeDegrees(actual - expected))).toBeLessThan(1e-9)
}

/** Every internal coordinate measurable from consecutive atom quadruples. */
function internalCoordinates(list: readonly { position: Vec3 }[]) {
  const lengths: number[] = []
  const angles: number[] = []
  const dihedrals: number[] = []
  for (let i = 0; i + 1 < list.length; i++) {
    lengths.push(distance(list[i]!.position, list[i + 1]!.position))
  }
  for (let i = 0; i + 2 < list.length; i++) {
    angles.push(bondAngle(list[i]!.position, list[i + 1]!.position, list[i + 2]!.position))
  }
  for (let i = 0; i + 3 < list.length; i++) {
    dihedrals.push(
      dihedral(
        list[i]!.position,
        list[i + 1]!.position,
        list[i + 2]!.position,
        list[i + 3]!.position,
      ),
    )
  }
  return { lengths, angles, dihedrals }
}

describe('quaternions', () => {
  it('are unit length however they are built', () => {
    const quats = [
      IDENTITY_QUAT,
      quatFromAxisAngle(vec3(1, 2, 3), 47),
      quatFromEulerDegrees(10, 20, 30),
      quatNormalize({ w: 4, x: -3, y: 2, z: 1 }),
    ]
    for (const q of quats) expect(quatNorm(q)).toBeCloseTo(1, 12)
  })

  it('stay unit length under repeated composition', () => {
    // Drift off the unit sphere would scale the model as well as rotate it, i.e.
    // a "rigid" transform that changes bond lengths.
    let q = quatFromEulerDegrees(13, 29, 7)
    for (let i = 0; i < 500; i++) q = quatNormalize(quatMultiply(q, q))
    expect(quatNorm(q)).toBeCloseTo(1, 12)
  })

  it('rotate by the requested angle about the requested axis', () => {
    const q = quatFromAxisAngle(vec3(0, 0, 1), 90)
    const r = rotate(q, vec3(1, 0, 0))
    expect(r.x).toBeCloseTo(0, 12)
    expect(r.y).toBeCloseTo(1, 12)
    expect(r.z).toBeCloseTo(0, 12)
  })

  it('leave a point on the rotation axis fixed', () => {
    const axis = vec3(0, 1, 0)
    const spun = rotate(quatFromAxisAngle(axis, 123), axis)
    expect(distance(spun, axis)).toBeLessThan(1e-12)
  })

  it('preserve length', () => {
    const v = vec3(3, -4, 12) // length 13
    const spun = rotate(quatFromEulerDegrees(21, 53, -97), v)
    expect(Math.sqrt(spun.x ** 2 + spun.y ** 2 + spun.z ** 2)).toBeCloseTo(13, 12)
  })

  it('compose extrinsic XYZ in the documented order (Rz·Ry·Rx)', () => {
    // Rotating +90 about X then +90 about Z sends +Y to +Z to... check directly.
    const q = quatFromEulerDegrees(90, 0, 90)
    const stepwise = rotate(
      quatFromAxisAngle(vec3(0, 0, 1), 90),
      rotate(quatFromAxisAngle(vec3(1, 0, 0), 90), vec3(0, 1, 0)),
    )
    const combined = rotate(q, vec3(0, 1, 0))
    expect(distance(combined, stepwise)).toBeLessThan(1e-12)
  })

  it('rejects a zero axis and a zero quaternion', () => {
    expect(() => quatFromAxisAngle(vec3(0, 0, 0), 30)).toThrow(/non-zero/)
    expect(() => quatNormalize({ w: 0, x: 0, y: 0, z: 0 })).toThrow(/zero quaternion/)
  })
})

describe('the transform cannot change the reconstruction', () => {
  it('preserves every bond length, bond angle and dihedral of 1UBQ', () => {
    const before = internalCoordinates(atoms)
    const after = internalCoordinates(applyToAtoms(arbitrary, atoms))

    expect(after.lengths).toHaveLength(before.lengths.length)
    before.lengths.forEach((v, i) => expect(after.lengths[i]!).toBeCloseTo(v, 9))
    before.angles.forEach((v, i) => expect(after.angles[i]!).toBeCloseTo(v, 9))
    before.dihedrals.forEach((v, i) => expectSameAngle(after.dihedrals[i]!, v))
  })

  it('preserves the deposited φ/ψ/ω, so the angles round-trip', () => {
    // Measure φ/ψ/ω back out of the *transformed* structure and compare to the
    // fixture's published values, not just to the untransformed build.
    const moved = applyToAtoms(arbitrary, atoms)
    for (let i = 1; i < ubiquitin.length; i++) {
      const prev = i - 1
      const cPrev = moved[prev * 4 + 2]!.position
      const n = moved[i * 4]!.position
      const ca = moved[i * 4 + 1]!.position
      const c = moved[i * 4 + 2]!.position
      expectSameAngle(dihedral(cPrev, n, ca, c), ubiquitin[i]!.phi)
    }
  })

  it('preserves pairwise distances between arbitrary atom pairs', () => {
    const moved = applyToAtoms(arbitrary, atoms)
    for (const [i, j] of [
      [0, 1],
      [0, 303],
      [17, 152],
      [200, 201],
      [99, 4],
    ] as const) {
      expect(distance(moved[i]!.position, moved[j]!.position)).toBeCloseTo(
        distance(atoms[i]!.position, atoms[j]!.position),
        9,
      )
    }
  })

  it('preserves handedness — it is a rotation, never a reflection', () => {
    // A reflection would preserve all distances and angles but flip every
    // dihedral's sign, turning a right-handed helix into a left-handed one.
    const helix: Residue[] = Array.from({ length: 6 }, (_, i) => ({
      id: `h${i}`,
      aminoAcid: 'ALA' as const,
      phi: -57,
      psi: -47,
      omega: 180,
    }))
    const built = buildAtoms(helix)
    const moved = applyToAtoms(arbitrary, built)
    const signOf = (list: readonly { position: Vec3 }[]) =>
      Math.sign(
        dihedral(list[1]!.position, list[5]!.position, list[9]!.position, list[13]!.position),
      )
    expect(signOf(moved)).toBe(signOf(built))
  })

  it('leaves atom identity fields untouched', () => {
    const moved = applyToAtoms(arbitrary, atoms)
    moved.forEach((atom, i) => {
      const original = atoms[i]!
      expect(atom.name).toBe(original.name)
      expect(atom.element).toBe(original.element)
      expect(atom.residueId).toBe(original.residueId)
      expect(atom.residueIndex).toBe(original.residueIndex)
      expect(atom.aminoAcid).toBe(original.aminoAcid)
    })
  })
})

describe('identity', () => {
  it('is a no-op on points', () => {
    const p = vec3(1.5, -2.25, 3)
    expect(applyToPoint(IDENTITY_TRANSFORM, p)).toEqual(p)
  })

  it('returns the very same atom array, so nothing downstream looks new', () => {
    expect(applyToAtoms(IDENTITY_TRANSFORM, atoms)).toBe(atoms)
  })

  it('is recognised', () => {
    expect(isIdentityTransform(IDENTITY_TRANSFORM)).toBe(true)
    expect(isIdentityTransform({ ...IDENTITY_TRANSFORM, translation: vec3(0, 0, 1) })).toBe(false)
    expect(isIdentityTransform({ ...IDENTITY_TRANSFORM, rotation: quatFromEulerDegrees(0, 90, 0) })).toBe(
      false,
    )
  })

  it('is recognised for a full turn, which is the identity rotation', () => {
    expect(isIdentityTransform({ ...IDENTITY_TRANSFORM, rotation: quatFromEulerDegrees(0, 360, 0) })).toBe(
      true,
    )
  })
})

describe('compose and invert', () => {
  const a: RigidTransform = {
    rotation: quatFromEulerDegrees(15, 0, 0),
    translation: vec3(1, 2, 3),
  }
  const b: RigidTransform = {
    rotation: quatFromEulerDegrees(0, -40, 0),
    translation: vec3(-5, 0.5, 2),
  }
  const c: RigidTransform = {
    rotation: quatFromEulerDegrees(0, 0, 100),
    translation: vec3(0, -3, 8),
  }
  const p = vec3(2.5, -1, 4)

  it('composes as "inner first, then outer"', () => {
    expect(
      distance(applyToPoint(compose(a, b), p), applyToPoint(a, applyToPoint(b, p))),
    ).toBeLessThan(1e-12)
  })

  it('is associative', () => {
    const left = applyToPoint(compose(compose(a, b), c), p)
    const right = applyToPoint(compose(a, compose(b, c)), p)
    expect(distance(left, right)).toBeLessThan(1e-12)
  })

  it('composes with the identity on either side', () => {
    expect(distance(applyToPoint(compose(a, IDENTITY_TRANSFORM), p), applyToPoint(a, p))).toBeLessThan(1e-12)
    expect(distance(applyToPoint(compose(IDENTITY_TRANSFORM, a), p), applyToPoint(a, p))).toBeLessThan(1e-12)
  })

  it('inverts, forward and back', () => {
    expect(distance(applyToPoint(invert(a), applyToPoint(a, p)), p)).toBeLessThan(1e-12)
    expect(distance(applyToPoint(a, applyToPoint(invert(a), p)), p)).toBeLessThan(1e-12)
  })

  it('inverts a composition, restoring the whole structure', () => {
    const t = compose(compose(a, b), c)
    const round = applyToAtoms(invert(t), applyToAtoms(t, atoms))
    round.forEach((atom, i) => {
      expect(distance(atom.position, atoms[i]!.position)).toBeLessThan(1e-9)
    })
  })
})

describe('frameOn — the one function behind both origin modes', () => {
  const ca1 = atoms[1]!.position

  it('lands the anchor exactly on the target', () => {
    const target = vec3(10, -4, 7.5)
    const t = frameOn(ca1, target, quatFromEulerDegrees(23, 45, 67))
    const moved = applyToPoint(t, ca1)
    // Exactly, not approximately: the translation is *solved* for this.
    expect(distance(moved, target)).toBeLessThan(1e-12)
  })

  it('place mode: Cα of residue 1 goes where the user typed', () => {
    const target = vec3(3, 3, 3)
    const moved = applyToAtoms(frameOn(ca1, target, IDENTITY_QUAT), atoms)
    expect(distance(moved[1]!.position, target)).toBeLessThan(1e-12)
  })

  it('pick mode: any chosen atom becomes (0, 0, 0)', () => {
    const origin = vec3(0, 0, 0)
    for (const index of [0, 1, 42, 137, atoms.length - 1]) {
      const anchor = atoms[index]!.position
      const moved = applyToAtoms(frameOn(anchor, origin, IDENTITY_QUAT), atoms)
      expect(distance(moved[index]!.position, origin)).toBeLessThan(1e-12)
    }
  })

  it('rotates about the anchor, not the world origin', () => {
    // The anchor stays put under any rotation, which is what makes typing an
    // orientation feel like turning the molecule in place.
    const t = frameOn(ca1, ca1, quatFromEulerDegrees(0, 90, 0))
    expect(distance(applyToPoint(t, ca1), ca1)).toBeLessThan(1e-12)
  })

  it('is the identity when the anchor is already the target and there is no rotation', () => {
    expect(isIdentityTransform(frameOn(vec3(0, 0, 0), vec3(0, 0, 0), IDENTITY_QUAT))).toBe(true)
  })

  it('still preserves every internal coordinate', () => {
    const t = frameOn(atoms[100]!.position, vec3(0, 0, 0), quatFromEulerDegrees(11, 22, 33))
    const before = internalCoordinates(atoms)
    const after = internalCoordinates(applyToAtoms(t, atoms))
    before.lengths.forEach((v, i) => expect(after.lengths[i]!).toBeCloseTo(v, 9))
    before.dihedrals.forEach((v, i) => expectSameAngle(after.dihedrals[i]!, v))
  })
})

describe('the origin is decoupled from the chain', () => {
  it('changing it reports no geometric change to the residue list', () => {
    // The transform is applied above the chain builder, so it must be incapable of
    // invalidating the suffix cache. If this ever fails, moving the origin has
    // started triggering chain rebuilds.
    expect(firstChangedIndex(ubiquitin, ubiquitin)).toBe(ubiquitin.length)
    const moved = applyToAtoms(arbitrary, atoms)
    expect(moved).toHaveLength(atoms.length)
    expect(firstChangedIndex(ubiquitin, ubiquitin)).toBe(ubiquitin.length)
  })

  it('does not mutate the atoms it was given', () => {
    const snapshot = atoms.map((a) => ({ ...a.position }))
    applyToAtoms(arbitrary, atoms)
    atoms.forEach((atom, i) => {
      expect(atom.position.x).toBe(snapshot[i]!.x)
      expect(atom.position.y).toBe(snapshot[i]!.y)
      expect(atom.position.z).toBe(snapshot[i]!.z)
    })
  })

  it('handles an empty structure', () => {
    expect(applyToAtoms(arbitrary, [])).toEqual([])
  })
})
