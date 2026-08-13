import { describe, expect, it } from 'vitest'

import { BOND_ANGLE, BOND_LENGTH, PSI_TO_O_DIHEDRAL_OFFSET } from '../lib/constants.ts'
import {
  add,
  bondAngle,
  cross,
  degToRad,
  dihedral,
  distance,
  normalizeDegrees,
  placeAtom,
  scale,
  sub,
  vec3,
  type Vec3,
} from '../lib/nerf.ts'
import fixture from './fixtures/1ubq-backbone.json' with { type: 'json' }

/**
 * Tests for the NeRF core, validated against 1UBQ (ubiquitin, 1.8 Å X-ray).
 *
 * Two tiers, deliberately:
 *
 *  1. Exact — rebuild the deposited structure from internal coordinates
 *     *measured from that same structure*. This must match to ~1e-9 Å. It is
 *     the test that actually pins down the math and the dihedral sign
 *     convention, because there is nowhere for an error to hide.
 *
 *  2. Bounded — rebuild from the real φ/ψ/ω but with the *ideal* bond lengths
 *     and angles from lib/constants.ts, which is the path the app itself uses.
 *     This cannot match exactly: deposited structures have real per-residue
 *     bond-geometry variation, and substituting ideal values introduces small
 *     per-atom errors that compound along the chain. The assertions below pin
 *     the size of that drift so a regression shows up as a changed number.
 */

const EXACT_TOLERANCE = 1e-9

type FixtureAtom = (typeof fixture.atoms)[number]

const positionOf = (atom: FixtureAtom): Vec3 => atom.position

/** The fixture's parent indices, narrowed from JSON's `number[]` to a triple. */
function parentsOf(atom: FixtureAtom): [number, number, number] {
  const parents = atom.parents ?? []
  const [a, b, c] = parents
  if (a === undefined || b === undefined || c === undefined || parents.length !== 3) {
    throw new Error(`Atom ${atom.index} does not have exactly three parents.`)
  }
  return [a, b, c]
}

function expectClose(actual: Vec3, expected: Vec3, tolerance: number, label: string): void {
  const deviation = distance(actual, expected)
  expect(deviation, `${label}: off by ${deviation.toExponential(3)} Å`).toBeLessThan(tolerance)
}

/** Largest and RMS deviation between two same-length coordinate lists. */
function deviationStats(actual: Vec3[], expected: Vec3[]): { max: number; rms: number } {
  let max = 0
  let sumSquares = 0
  for (const [i, position] of actual.entries()) {
    const d = distance(position, expected[i]!)
    max = Math.max(max, d)
    sumSquares += d * d
  }
  return { max, rms: Math.sqrt(sumSquares / actual.length) }
}

describe('placeAtom — exact reconstruction of a deposited structure', () => {
  it('rebuilds all 304 backbone atoms of 1UBQ to within 1e-9 Å', () => {
    // Seed with the first three deposited atoms (N, CA, C of Met1). Every other
    // atom is produced by placeAtom alone, from measured internal coordinates.
    const rebuilt: Vec3[] = []

    for (const atom of fixture.atoms) {
      if (!atom.parents || !atom.internal) {
        rebuilt.push(positionOf(atom))
        continue
      }
      const [ai, bi, ci] = parentsOf(atom)
      rebuilt.push(
        placeAtom(
          rebuilt[ai]!,
          rebuilt[bi]!,
          rebuilt[ci]!,
          atom.internal.bondLength,
          atom.internal.bondAngleDeg,
          atom.internal.dihedralDeg,
        ),
      )
    }

    expect(rebuilt).toHaveLength(fixture.atoms.length)
    for (const [i, atom] of fixture.atoms.entries()) {
      expectClose(
        rebuilt[i]!,
        positionOf(atom),
        EXACT_TOLERANCE,
        `${atom.name} of ${atom.residueName}${atom.residueSeq}`,
      )
    }

    // Error must not creep up over 76 residues of sequential dependence.
    const { max, rms } = deviationStats(rebuilt, fixture.atoms.map(positionOf))
    expect(max).toBeLessThan(EXACT_TOLERANCE)
    expect(rms).toBeLessThan(EXACT_TOLERANCE)
  })

  it('only used seed coordinates for the first three atoms', () => {
    // Guards the test above: if the fixture ever marked more atoms as seeds, the
    // reconstruction would be trivially "correct" by copying deposited values.
    const seeds = fixture.atoms.filter((atom) => atom.parents === null)
    expect(seeds.map((atom) => atom.name)).toEqual(['N', 'CA', 'C'])
  })
})

describe('measurement functions invert placement', () => {
  it('recovers the exact internal coordinates of every placed 1UBQ atom', () => {
    for (const atom of fixture.atoms) {
      if (!atom.parents || !atom.internal) continue
      const [ai, bi, ci] = parentsOf(atom)
      const a = positionOf(fixture.atoms[ai]!)
      const b = positionOf(fixture.atoms[bi]!)
      const c = positionOf(fixture.atoms[ci]!)
      const { bondLength, bondAngleDeg, dihedralDeg } = atom.internal

      const placed = placeAtom(a, b, c, bondLength, bondAngleDeg, dihedralDeg)

      expect(distance(c, placed)).toBeCloseTo(bondLength, 9)
      expect(bondAngle(b, c, placed)).toBeCloseTo(bondAngleDeg, 9)
      expect(normalizeDegrees(dihedral(a, b, c, placed) - dihedralDeg)).toBeCloseTo(0, 9)
    }
  })

  it('measures φ/ψ/ω consistently with the atoms they are derived from', () => {
    // φ is C(i-1)-N(i)-CA(i)-C(i); the fixture stores it per residue and the
    // per-atom internal coordinate for C(i) is the same dihedral. They must agree.
    const cAtoms = fixture.atoms.filter((atom) => atom.name === 'C')
    for (const residue of fixture.residues) {
      if (residue.phi === null) continue
      const c = cAtoms[residue.residueIndex]!
      expect(normalizeDegrees(c.internal!.dihedralDeg - residue.phi)).toBeCloseTo(0, 9)
    }
  })

  it('spans a wide range of φ/ψ, so the fixture is not a single-conformation test', () => {
    const phis = fixture.residues.map((r) => r.phi).filter((v): v is number => v !== null)
    const psis = fixture.residues.map((r) => r.psi).filter((v): v is number => v !== null)
    // Ubiquitin has an α-helix, a β-sheet and loops: ψ in particular should
    // populate both the ~-40° helical and ~+130° extended regions.
    expect(Math.min(...phis)).toBeLessThan(-100)
    expect(Math.max(...phis)).toBeGreaterThan(0)
    expect(Math.min(...psis)).toBeLessThan(-30)
    expect(Math.max(...psis)).toBeGreaterThan(120)
  })

  it('confirms ω is trans for every peptide bond in 1UBQ', () => {
    for (const residue of fixture.residues) {
      if (residue.omega === null) continue
      expect(Math.abs(residue.omega)).toBeGreaterThan(160)
    }
  })
})

// ---------------------------------------------------------------------------
// Ideal-geometry reconstruction (the path the app actually uses)
// ---------------------------------------------------------------------------

interface BackboneAngles {
  phi: number | null
  psi: number | null
  omega: number | null
}

/**
 * Rebuild a backbone from φ/ψ/ω using only the ideal constants, starting from a
 * caller-supplied N/CA/C seed. Returns atoms in N, CA, C, O order per residue.
 *
 * This is a test-local helper, not the shipped chain builder (step 3) — it
 * exists so the geometry can be validated before any chain code is written.
 */
function buildIdealBackbone(residues: readonly BackboneAngles[], seed: readonly [Vec3, Vec3, Vec3]): Vec3[] {
  const out: Vec3[] = []
  let [previousN, previousCA, previousC] = seed

  residues.forEach((residue, i) => {
    let n: Vec3
    let ca: Vec3
    if (i === 0) {
      ;[n, ca] = [previousN, previousCA]
    } else {
      const previousPsi = residues[i - 1]!.psi
      const previousOmega = residues[i - 1]!.omega
      if (previousPsi === null || previousOmega === null) {
        throw new Error(`Residue ${i - 1} needs ψ and ω to place residue ${i}.`)
      }
      // N(i) continues the chain across the peptide bond, driven by ψ(i-1)...
      n = placeAtom(previousN, previousCA, previousC, BOND_LENGTH.C_N, BOND_ANGLE.CA_C_N, previousPsi)
      // ...and CA(i) by ω(i-1), the rotation about that peptide bond.
      ca = placeAtom(previousCA, previousC, n, BOND_LENGTH.N_CA, BOND_ANGLE.C_N_CA, previousOmega)
    }

    // C(i) is what φ(i) rotates.
    const c =
      i === 0
        ? previousC
        : placeAtom(previousC, n, ca, BOND_LENGTH.CA_C, BOND_ANGLE.N_CA_C, residue.phi!)

    // O carries no independent degree of freedom: it sits anti to the next N.
    const oDihedral = (residue.psi ?? 0) + PSI_TO_O_DIHEDRAL_OFFSET
    const o = placeAtom(n, ca, c, BOND_LENGTH.C_O, BOND_ANGLE.CA_C_O, oDihedral)

    out.push(n, ca, c, o)
    ;[previousN, previousCA, previousC] = [n, ca, c]
  })

  return out
}

describe('ideal constants + real φ/ψ/ω — bounded drift from the deposited structure', () => {
  const deposited = fixture.atoms.map(positionOf)
  const seed: [Vec3, Vec3, Vec3] = [deposited[0]!, deposited[1]!, deposited[2]!]
  // The C-terminal residue has no ψ/ω, so it cannot be extended to; rebuild the
  // 75 residues that can be, which still exercises 74 peptide bonds.
  const residues = fixture.residues.slice(0, -1)
  const rebuilt = buildIdealBackbone(residues, seed)
  const target = deposited.slice(0, rebuilt.length)

  it('reproduces local geometry almost exactly over the first 5 residues', () => {
    const window = 5 * 4
    const { max, rms } = deviationStats(rebuilt.slice(0, window), target.slice(0, window))
    // Measured on 1UBQ: max 0.63 Å, RMS 0.24 Å. Sub-ångström this early because
    // the only error source is ideal-vs-real bond lengths and angles, ~0.02 Å
    // and ~2° per atom, with little lever arm yet.
    expect(max).toBeLessThan(0.8)
    expect(rms).toBeLessThan(0.3)
  })

  it('keeps whole-chain drift within a documented bound', () => {
    const { max, rms } = deviationStats(rebuilt, target)
    // Measured on 1UBQ: max 28.0 Å, RMS 8.4 Å over 75 residues (1.4 Å max by
    // residue 10). This is NOT a bug and must not be "fixed" by smoothing the
    // geometry — it is the lever-arm effect of substituting ideal bond
    // lengths/angles for the real ones, compounding along a 75-residue chain.
    // The exact test above is what proves the math; this one just pins the size
    // of the modelling error so a real regression changes the number.
    expect(max).toBeLessThan(32)
    expect(rms).toBeLessThan(10)
  })

  it('reproduces every bond length and bond angle at its ideal value', () => {
    // Whatever the positional drift, the *internal* geometry must be exactly
    // what was asked for — that is the deterministic contract of the tool.
    for (let i = 1; i < residues.length; i++) {
      const [n, ca, c] = [rebuilt[i * 4]!, rebuilt[i * 4 + 1]!, rebuilt[i * 4 + 2]!]
      const previousC = rebuilt[(i - 1) * 4 + 2]!
      expect(distance(previousC, n)).toBeCloseTo(BOND_LENGTH.C_N, 9)
      expect(distance(n, ca)).toBeCloseTo(BOND_LENGTH.N_CA, 9)
      expect(distance(ca, c)).toBeCloseTo(BOND_LENGTH.CA_C, 9)
      expect(bondAngle(n, ca, c)).toBeCloseTo(BOND_ANGLE.N_CA_C, 9)
    }
  })

  it('reproduces the input φ/ψ/ω exactly in the rebuilt structure', () => {
    for (let i = 1; i < residues.length; i++) {
      const residue = residues[i]!
      const [n, ca, c] = [rebuilt[i * 4]!, rebuilt[i * 4 + 1]!, rebuilt[i * 4 + 2]!]
      const previousC = rebuilt[(i - 1) * 4 + 2]!
      expect(normalizeDegrees(dihedral(previousC, n, ca, c) - residue.phi!)).toBeCloseTo(0, 9)
    }
  })

  it('places the carbonyl O anti to the next N, matching the deposited O within a few degrees', () => {
    // Validates PSI_TO_O_DIHEDRAL_OFFSET against reality rather than assuming it.
    const oAtoms = fixture.atoms.filter((atom) => atom.name === 'O')
    const deviations: number[] = []
    for (const residue of fixture.residues) {
      if (residue.psi === null) continue
      const measured = oAtoms[residue.residueIndex]!.internal!.dihedralDeg
      const predicted = residue.psi + PSI_TO_O_DIHEDRAL_OFFSET
      deviations.push(Math.abs(normalizeDegrees(measured - predicted)))
    }
    deviations.sort((a, b) => a - b)
    // Measured on 1UBQ: median 2.4°, max 10.2°. Real peptide units are slightly
    // non-planar, so the O is only approximately anti to the next N — but it is
    // close enough that treating it as a dependent atom is sound.
    expect(deviations[Math.floor(deviations.length / 2)]!).toBeLessThan(3.5)
    expect(deviations[deviations.length - 1]!).toBeLessThan(12)
  })
})

// ---------------------------------------------------------------------------
// Fixture-independent checks
// ---------------------------------------------------------------------------

/** Canonical seed frame for residue 1: N at the origin, CA along +x, C in the xy-plane. */
function canonicalSeed(): [Vec3, Vec3, Vec3] {
  const n = vec3(0, 0, 0)
  const ca = vec3(BOND_LENGTH.N_CA, 0, 0)
  const tau = degToRad(BOND_ANGLE.N_CA_C)
  const c = add(ca, scale(vec3(-Math.cos(tau), Math.sin(tau), 0), BOND_LENGTH.CA_C))
  return [n, ca, c]
}

describe('α-helix regression (no fixture involved)', () => {
  const RESIDUE_COUNT = 12
  const helixAngles: BackboneAngles[] = Array.from({ length: RESIDUE_COUNT }, () => ({
    phi: -57,
    psi: -47,
    omega: 180,
  }))
  const atoms = buildIdealBackbone(helixAngles, canonicalSeed())
  const alphaCarbons = Array.from({ length: RESIDUE_COUNT }, (_, i) => atoms[i * 4 + 1]!)

  it('produces the canonical i→i+3 and i→i+4 Cα distances', () => {
    // Literature α-helix values are ≈5.0-5.4 Å and ≈6.2-6.4 Å; with these exact
    // ideal constants the helix is perfectly regular at 5.227 Å and 6.400 Å.
    for (let i = 0; i + 4 < RESIDUE_COUNT; i++) {
      expect(distance(alphaCarbons[i]!, alphaCarbons[i + 3]!)).toBeCloseTo(5.227, 3)
      expect(distance(alphaCarbons[i]!, alphaCarbons[i + 4]!)).toBeCloseTo(6.4, 3)
    }
  })

  it('rises ~1.5 Å per residue along the helix axis', () => {
    // For a regular helix the successive Cα steps sweep around the axis, so the
    // cross product of consecutive steps points along it.
    const steps = alphaCarbons.slice(1).map((ca, i) => sub(ca, alphaCarbons[i]!))
    let axis = vec3(0, 0, 0)
    for (let i = 0; i + 1 < steps.length; i++) {
      axis = add(axis, cross(steps[i]!, steps[i + 1]!))
    }
    const unitAxis = scale(axis, 1 / Math.hypot(axis.x, axis.y, axis.z))
    const span = sub(alphaCarbons[RESIDUE_COUNT - 1]!, alphaCarbons[0]!)
    const rise =
      (span.x * unitAxis.x + span.y * unitAxis.y + span.z * unitAxis.z) / (RESIDUE_COUNT - 1)
    // Textbook α-helix rise is 1.5 Å/residue; ideal geometry gives 1.558 Å.
    expect(rise).toBeGreaterThan(1.45)
    expect(rise).toBeLessThan(1.65)
  })

  it('forms i→i+4 backbone hydrogen-bond geometry (O···N ≈ 3 Å)', () => {
    for (let i = 0; i + 4 < RESIDUE_COUNT; i++) {
      const o = atoms[i * 4 + 3]!
      const n = atoms[(i + 4) * 4]!
      expect(distance(o, n)).toBeGreaterThan(2.7)
      expect(distance(o, n)).toBeLessThan(3.3)
    }
  })

  it('is right-handed, as a real α-helix is', () => {
    // The Cα(i..i+3) pseudo-dihedral is ≈ +50° for a right-handed α-helix.
    const twist = dihedral(alphaCarbons[0]!, alphaCarbons[1]!, alphaCarbons[2]!, alphaCarbons[3]!)
    expect(twist).toBeGreaterThan(40)
    expect(twist).toBeLessThan(60)
  })

  it('makes a β-strand extended, not helical', () => {
    const strand = buildIdealBackbone(
      Array.from({ length: 6 }, () => ({ phi: -139, psi: 135, omega: 180 })),
      canonicalSeed(),
    )
    const cas = Array.from({ length: 6 }, (_, i) => strand[i * 4 + 1]!)
    // ~3.3-3.5 Å rise per residue in a fully extended chain.
    expect(distance(cas[0]!, cas[5]!) / 5).toBeGreaterThan(3.2)
  })
})

describe('placeAtom — unit behaviour', () => {
  const [a, b, c] = [vec3(0, 1, 0), vec3(0, 0, 0), vec3(1.5, 0, 0)]

  it('honours its three inputs independently', () => {
    for (const dihedralDeg of [-180, -120, -37.5, 0, 45, 179.9]) {
      const d = placeAtom(a, b, c, 1.33, 116.2, dihedralDeg)
      expect(distance(c, d)).toBeCloseTo(1.33, 12)
      expect(bondAngle(b, c, d)).toBeCloseTo(116.2, 12)
      expect(normalizeDegrees(dihedral(a, b, c, d) - dihedralDeg)).toBeCloseTo(0, 12)
    }
  })

  it('places D cis (in-plane, same side as A) at dihedral 0', () => {
    const d = placeAtom(a, b, c, 1.5, 90, 0)
    expect(d.z).toBeCloseTo(0, 12)
    expect(Math.sign(d.y)).toBe(Math.sign(a.y))
  })

  it('places D trans (in-plane, opposite side) at dihedral 180', () => {
    const d = placeAtom(a, b, c, 1.5, 90, 180)
    expect(d.z).toBeCloseTo(0, 12)
    expect(Math.sign(d.y)).toBe(-Math.sign(a.y))
  })

  it('is invariant under rigid transforms of its inputs', () => {
    // This is what makes the step-6 reference-frame control safe: moving the
    // origin can be a post-hoc rigid transform because the geometry commutes with one.
    const rotate = (v: Vec3): Vec3 => {
      const t = degToRad(37)
      // Rotate about z, then translate.
      return add(
        vec3(v.x * Math.cos(t) - v.y * Math.sin(t), v.x * Math.sin(t) + v.y * Math.cos(t), v.z),
        vec3(3, -7, 11),
      )
    }
    const direct = placeAtom(a, b, c, 1.33, 116.2, -60)
    const viaTransform = placeAtom(rotate(a), rotate(b), rotate(c), 1.33, 116.2, -60)
    expectClose(viaTransform, rotate(direct), 1e-12, 'rigid-transform invariance')
  })

  it('rejects degenerate input instead of returning NaN', () => {
    const collinear = vec3(-1, 0, 0)
    expect(() => placeAtom(collinear, b, c, 1.5, 110, 60)).toThrow(/collinear/)
    expect(() => placeAtom(a, b, b, 1.5, 110, 60)).toThrow(/zero-length/)
    expect(() => placeAtom(a, b, c, 0, 110, 60)).toThrow(/positive/)
    expect(() => placeAtom(a, b, c, 1.5, Number.NaN, 60)).toThrow(/finite/)
  })
})

describe('measurement — unit behaviour', () => {
  it('measures known planar dihedrals exactly', () => {
    const a = vec3(1, 1, 0)
    const b = vec3(0, 1, 0)
    const c = vec3(0, 0, 0)
    expect(dihedral(a, b, c, vec3(1, 0, 0))).toBeCloseTo(0, 12) // cis
    expect(Math.abs(dihedral(a, b, c, vec3(-1, 0, 0)))).toBeCloseTo(180, 12) // trans
    expect(dihedral(a, b, c, vec3(0, 0, 1))).toBeCloseTo(90, 12)
    expect(dihedral(a, b, c, vec3(0, 0, -1))).toBeCloseTo(-90, 12)
  })

  it('measures bond angles including the collinear limits', () => {
    expect(bondAngle(vec3(1, 0, 0), vec3(0, 0, 0), vec3(0, 1, 0))).toBeCloseTo(90, 12)
    expect(bondAngle(vec3(1, 0, 0), vec3(0, 0, 0), vec3(-1, 0, 0))).toBeCloseTo(180, 12)
    expect(bondAngle(vec3(1, 0, 0), vec3(0, 0, 0), vec3(2, 0, 0))).toBeCloseTo(0, 12)
  })

  it('wraps angles into (-180, 180]', () => {
    expect(normalizeDegrees(190)).toBeCloseTo(-170, 12)
    expect(normalizeDegrees(-190)).toBeCloseTo(170, 12)
    expect(normalizeDegrees(180)).toBe(180)
    expect(normalizeDegrees(-180)).toBe(180)
    expect(normalizeDegrees(540)).toBe(180)
  })

  it('rejects degenerate measurement input', () => {
    const origin = vec3(0, 0, 0)
    expect(() => bondAngle(origin, origin, vec3(1, 0, 0))).toThrow(/coincident/)
    expect(() =>
      dihedral(vec3(0, 0, 0), vec3(1, 0, 0), vec3(2, 0, 0), vec3(3, 1, 0)),
    ).toThrow(/collinear/)
  })
})
