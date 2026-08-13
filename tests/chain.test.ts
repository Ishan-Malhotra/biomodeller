import { describe, expect, it } from 'vitest'

import {
  ATOMS_PER_RESIDUE,
  buildBackbone,
  canonicalSeedFrame,
  firstChangedIndex,
  rebuildFrom,
} from '../lib/chain.ts'
import { BOND_ANGLE, BOND_LENGTH } from '../lib/constants.ts'
import {
  add,
  bondAngle,
  cross,
  dihedral,
  distance,
  dot,
  normalize,
  normalizeDegrees,
  scale,
  sub,
  vec3,
  type Vec3,
} from '../lib/nerf.ts'
import type { Atom, Residue } from '../lib/types.ts'
import fixture from './fixtures/1ubq-backbone.json' with { type: 'json' }

/**
 * Chain-builder tests.
 *
 * The geometry itself is already pinned by tests/nerf.test.ts. What matters
 * here is sequencing: that each dihedral drives the atom it is supposed to
 * drive, that the whole 1UBQ backbone comes out right, and — the part
 * claude.md is specific about — that an edit at residue i recomputes exactly
 * the suffix from i onward and reuses everything before it.
 */

const residue = (i: number, phi: number, psi: number, omega = 180): Residue => ({
  id: `r${i}`,
  aminoAcid: 'ALA',
  phi,
  psi,
  omega,
})

/** 1UBQ's real backbone angles as a Residue[]. */
const ubiquitin: Residue[] = fixture.residues.map((r) => ({
  id: `ubq-${r.residueSeq}`,
  aminoAcid: r.residueName as Residue['aminoAcid'],
  // The terminal residues have no φ / no ψ,ω; those angles have no geometric
  // effect at the ends, so any placeholder is fine. Zero keeps it obvious.
  phi: r.phi ?? 0,
  psi: r.psi ?? 0,
  omega: r.omega ?? 180,
}))

const positionsOf = (atoms: readonly Atom[]): Vec3[] => atoms.map((atom) => atom.position)

const atomsOfResidue = (atoms: readonly Atom[], i: number): [Vec3, Vec3, Vec3, Vec3] => {
  const [n, ca, c, o] = atoms.slice(i * ATOMS_PER_RESIDUE, (i + 1) * ATOMS_PER_RESIDUE)
  return [n!.position, ca!.position, c!.position, o!.position]
}

// --- Rigid alignment, for comparing against deposited coordinates -----------

/**
 * Map one N/CA/C triple onto another as a rigid transform.
 *
 * Needed because the builder always works in the canonical seed frame, so a
 * structure built from 1UBQ's angles is the right shape in the wrong place.
 * Superposing on residue 1 is the honest comparison: it introduces no fitting
 * freedom beyond the six rigid degrees the reference-frame control will own.
 */
function rigidAlignment(from: readonly Vec3[], to: readonly Vec3[]): (v: Vec3) => Vec3 {
  const frame = (p: readonly Vec3[]): [Vec3, Vec3, Vec3] => {
    const [a, b, c] = [p[0]!, p[1]!, p[2]!]
    const e1 = normalize(sub(b, a))
    const inPlane = sub(c, a)
    const e2 = normalize(sub(inPlane, scale(e1, dot(inPlane, e1))))
    return [e1, e2, cross(e1, e2)]
  }
  const source = frame(from)
  const target = frame(to)
  const origin = from[0]!
  const destination = to[0]!

  return (v: Vec3): Vec3 => {
    const local = sub(v, origin)
    // Coordinates in the source frame, re-expressed in the target frame.
    const coefficients = source.map((axis) => dot(local, axis))
    return target.reduce(
      (acc, axis, i) => add(acc, scale(axis, coefficients[i]!)),
      destination,
    )
  }
}

function deviationStats(actual: readonly Vec3[], expected: readonly Vec3[]) {
  let max = 0
  let sumSquares = 0
  for (const [i, position] of actual.entries()) {
    const d = distance(position, expected[i]!)
    max = Math.max(max, d)
    sumSquares += d * d
  }
  return { max, rms: Math.sqrt(sumSquares / actual.length) }
}

// ---------------------------------------------------------------------------

describe('buildBackbone — degenerate and single-residue cases', () => {
  it('returns nothing for an empty chain (the blank-canvas state)', () => {
    expect(buildBackbone([])).toEqual([])
  })

  it('seeds residue 1 in the canonical frame', () => {
    const atoms = buildBackbone([residue(1, -57, -47)])
    const [seedN, seedCA, seedC] = canonicalSeedFrame()

    expect(atoms).toHaveLength(ATOMS_PER_RESIDUE)
    expect(atoms.map((a) => a.name)).toEqual(['N', 'CA', 'C', 'O'])
    expect(atoms.map((a) => a.element)).toEqual(['N', 'C', 'C', 'O'])
    expect(atoms[0]!.position).toEqual(seedN)
    expect(atoms[1]!.position).toEqual(seedCA)
    expect(atoms[2]!.position).toEqual(seedC)
  })

  it('ignores φ of the first residue, which has no preceding C to rotate about', () => {
    const a = buildBackbone([residue(1, -57, -47)])
    const b = buildBackbone([residue(1, 122, -47)])
    expect(positionsOf(a)).toEqual(positionsOf(b))
  })

  it('still uses ψ of the first residue to orient its carbonyl O', () => {
    const a = buildBackbone([residue(1, -57, -47)])
    const b = buildBackbone([residue(1, -57, 135)])
    expect(distance(a[3]!.position, b[3]!.position)).toBeGreaterThan(0.5)
  })

  it('carries residue identity onto every derived atom', () => {
    const atoms = buildBackbone([residue(1, -57, -47), { ...residue(2, -57, -47), aminoAcid: 'GLY' }])
    expect(atoms.map((a) => a.residueIndex)).toEqual([0, 0, 0, 0, 1, 1, 1, 1])
    expect(atoms.map((a) => a.residueId)).toEqual(['r1', 'r1', 'r1', 'r1', 'r2', 'r2', 'r2', 'r2'])
    expect(new Set(atoms.slice(4).map((a) => a.aminoAcid))).toEqual(new Set(['GLY']))
  })
})

describe('buildBackbone — full 1UBQ backbone', () => {
  const atoms = buildBackbone(ubiquitin)

  it('produces four atoms per residue in N, CA, C, O order', () => {
    expect(atoms).toHaveLength(fixture.atoms.length)
    expect(atoms).toHaveLength(76 * ATOMS_PER_RESIDUE)
    for (const [i, atom] of atoms.entries()) {
      expect(atom.name).toBe(fixture.atoms[i]!.name)
      expect(atom.residueIndex).toBe(fixture.atoms[i]!.residueIndex)
    }
  })

  it('reproduces every input φ, ψ and ω exactly', () => {
    for (let i = 0; i < ubiquitin.length; i++) {
      const [n, ca, c] = atomsOfResidue(atoms, i)
      if (i > 0) {
        const previousC = atomsOfResidue(atoms, i - 1)[2]
        expect(normalizeDegrees(dihedral(previousC, n, ca, c) - ubiquitin[i]!.phi)).toBeCloseTo(0, 9)
      }
      if (i + 1 < ubiquitin.length) {
        const [nextN, nextCA] = atomsOfResidue(atoms, i + 1)
        expect(normalizeDegrees(dihedral(n, ca, c, nextN) - ubiquitin[i]!.psi)).toBeCloseTo(0, 9)
        expect(normalizeDegrees(dihedral(ca, c, nextN, nextCA) - ubiquitin[i]!.omega)).toBeCloseTo(0, 9)
      }
    }
  })

  it('holds every bond length and bond angle at its ideal value', () => {
    for (let i = 0; i < ubiquitin.length; i++) {
      const [n, ca, c, o] = atomsOfResidue(atoms, i)
      expect(distance(n, ca)).toBeCloseTo(BOND_LENGTH.N_CA, 9)
      expect(distance(ca, c)).toBeCloseTo(BOND_LENGTH.CA_C, 9)
      expect(distance(c, o)).toBeCloseTo(BOND_LENGTH.C_O, 9)
      expect(bondAngle(n, ca, c)).toBeCloseTo(BOND_ANGLE.N_CA_C, 9)
      expect(bondAngle(ca, c, o)).toBeCloseTo(BOND_ANGLE.CA_C_O, 9)
      if (i + 1 < ubiquitin.length) {
        const [nextN, nextCA] = atomsOfResidue(atoms, i + 1)
        expect(distance(c, nextN)).toBeCloseTo(BOND_LENGTH.C_N, 9)
        expect(bondAngle(ca, c, nextN)).toBeCloseTo(BOND_ANGLE.CA_C_N, 9)
        expect(bondAngle(c, nextN, nextCA)).toBeCloseTo(BOND_ANGLE.C_N_CA, 9)
      }
    }
  })

  it('matches the deposited structure to the same bound as the raw NeRF path', () => {
    // Superpose on residue 1 only, then compare. The numbers must agree with the
    // ideal-geometry drift already documented in tests/nerf.test.ts: this is the
    // same reconstruction, so the builder must not be adding error of its own.
    const deposited = fixture.atoms.map((a) => a.position)
    const align = rigidAlignment(positionsOf(atoms).slice(0, 3), deposited.slice(0, 3))
    const aligned = positionsOf(atoms).map(align)

    // Measured: 1.56 Å max / 0.66 Å RMS over the first 5 residues. Looser than
    // the 0.63 Å in tests/nerf.test.ts, and legitimately so: that test seeds on
    // the deposited N/CA/C of Met1, i.e. residue 1's *real* triangle, whereas
    // the builder seeds an ideal one. The small orientation difference in the
    // seed frame is levered along the chain. This is the app's real behaviour.
    const first5 = deviationStats(aligned.slice(0, 20), deposited.slice(0, 20))
    expect(first5.max).toBeLessThan(2)
    expect(first5.rms).toBeLessThan(0.8)

    // The last residue's ψ/ω are placeholders, so exclude its O from the sweep.
    const whole = deviationStats(aligned.slice(0, -1), deposited.slice(0, -1))
    expect(whole.max).toBeLessThan(32)
    expect(whole.rms).toBeLessThan(10)
  })

  it('recovers ubiquitin as a real structure, not a tangle', () => {
    // Cheap sanity checks that would fail loudly on a sequencing bug: the fold
    // is compact, and no two non-bonded backbone atoms occupy the same space.
    const positions = positionsOf(atoms)
    const centre = positions
      .reduce((acc, p) => add(acc, p), vec3(0, 0, 0))
    const centroid = scale(centre, 1 / positions.length)
    const radiusOfGyration = Math.sqrt(
      positions.reduce((acc, p) => acc + distance(p, centroid) ** 2, 0) / positions.length,
    )
    // Ubiquitin's backbone Rg is ~11.7 Å; ideal-geometry drift widens it somewhat.
    expect(radiusOfGyration).toBeGreaterThan(9)
    expect(radiusOfGyration).toBeLessThan(20)

    // Sequence-local packing must be physically sane: nothing within a
    // 10-residue window may collide.
    const WINDOW = 10 * ATOMS_PER_RESIDUE
    let closestLocal = Infinity
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 3; j < Math.min(positions.length, i + WINDOW); j++) {
        closestLocal = Math.min(closestLocal, distance(positions[i]!, positions[j]!))
      }
    }
    // Measured 1.69 Å, against 2.37 Å in the deposited structure.
    expect(closestLocal).toBeGreaterThan(1.5)
  })

  it('does clash between distant segments — and that is the correct output', () => {
    // Pinned deliberately. Over 76 residues the ideal-geometry drift is large
    // enough that segments far apart in sequence interpenetrate: N21 and CA55
    // land 0.85 Å apart. That is the honest consequence of reconstructing from
    // angles with fixed ideal bond geometry, and per claude.md it must NOT be
    // relaxed away. If a future change makes this pass, something is quietly
    // "improving" the geometry and the premise of the tool is broken.
    const positions = positionsOf(atoms)
    let closest = Infinity
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 3; j < positions.length; j++) {
        closest = Math.min(closest, distance(positions[i]!, positions[j]!))
      }
    }
    expect(closest).toBeLessThan(1.5)
  })
})

describe('rebuildFrom — suffix-only recomputation', () => {
  const residues = ubiquitin.slice(0, 20)
  const full = buildBackbone(residues)

  it('gives bit-identical results to a full rebuild, from any index', () => {
    for (let i = 0; i <= residues.length; i++) {
      expect(positionsOf(rebuildFrom(full, residues, i))).toEqual(positionsOf(full))
    }
  })

  it('reuses the untouched prefix atoms by reference', () => {
    const fromIndex = 7
    const rebuilt = rebuildFrom(full, residues, fromIndex)
    for (let i = 0; i < fromIndex * ATOMS_PER_RESIDUE; i++) {
      // Identity, not equality: nothing before the edit was recomputed.
      expect(rebuilt[i]).toBe(full[i])
    }
    expect(rebuilt[fromIndex * ATOMS_PER_RESIDUE]).not.toBe(full[fromIndex * ATOMS_PER_RESIDUE])
  })

  it('leaves the prefix in place and moves the suffix when an angle changes', () => {
    const editIndex = 9
    const edited = residues.map((r, i) => (i === editIndex ? { ...r, psi: r.psi + 40 } : r))
    const rebuilt = rebuildFrom(full, edited, editIndex)

    expect(rebuilt).toHaveLength(full.length)
    // ψ(i) places residue i+1, so residue i's own N/CA/C are unmoved; only its
    // O (which ψ also orients) and everything downstream shift.
    for (let i = 0; i < editIndex * ATOMS_PER_RESIDUE + 3; i++) {
      expect(rebuilt[i]!.position).toEqual(full[i]!.position)
    }
    const moved = rebuilt.filter((atom, i) => distance(atom.position, full[i]!.position) > 1e-9)
    expect(moved.length).toBeGreaterThan(0)
    expect(Math.min(...moved.map((a) => a.residueIndex))).toBe(editIndex)

    // And the suffix-only path agrees with rebuilding everything.
    expect(positionsOf(rebuilt)).toEqual(positionsOf(buildBackbone(edited)))
  })

  it('φ(i) moves residue i itself, not just its successors', () => {
    const editIndex = 5
    const edited = residues.map((r, i) => (i === editIndex ? { ...r, phi: r.phi + 30 } : r))
    const rebuilt = rebuildFrom(full, edited, editIndex)
    const [n, ca, c] = atomsOfResidue(rebuilt, editIndex)
    const [fullN, fullCA, fullC] = atomsOfResidue(full, editIndex)

    // φ rotates about N–CA, so N and CA are fixed and C swings.
    expect(n).toEqual(fullN)
    expect(ca).toEqual(fullCA)
    expect(distance(c, fullC)).toBeGreaterThan(0.5)
  })

  it('handles insert, delete and reorder as suffix rebuilds', () => {
    const cases: Array<{ label: string; next: Residue[]; from: number }> = [
      {
        label: 'append',
        next: [...residues, residue(99, -139, 135)],
        from: residues.length,
      },
      {
        label: 'insert in the middle',
        next: [...residues.slice(0, 6), residue(99, -139, 135), ...residues.slice(6)],
        from: 6,
      },
      {
        label: 'delete in the middle',
        next: [...residues.slice(0, 6), ...residues.slice(7)],
        from: 6,
      },
      {
        label: 'delete from the end',
        next: residues.slice(0, -1),
        from: residues.length - 1,
      },
      {
        label: 'swap two residues',
        next: (() => {
          const copy = [...residues]
          ;[copy[3], copy[11]] = [copy[11]!, copy[3]!]
          return copy
        })(),
        from: 3,
      },
    ]

    for (const { label, next, from } of cases) {
      expect(firstChangedIndex(residues, next), `${label}: detected edit index`).toBe(from)
      expect(
        positionsOf(rebuildFrom(full, next, from)),
        `${label}: suffix rebuild matches full rebuild`,
      ).toEqual(positionsOf(buildBackbone(next)))
    }
  })

  it('is safe when asked to rebuild from further back than it needs to', () => {
    // Over-invalidating must be correct, just wasteful — callers can always
    // pass 0 and get the right answer.
    expect(positionsOf(rebuildFrom(full, residues, 0))).toEqual(positionsOf(full))
    expect(positionsOf(rebuildFrom([], residues, 12))).toEqual(positionsOf(full))
    expect(() => rebuildFrom(full, residues, -1)).toThrow(/non-negative/)
  })
})

describe('firstChangedIndex', () => {
  const residues = [residue(1, -57, -47), residue(2, -57, -47), residue(3, -139, 135)]

  it('reports nothing to do when the list is unchanged', () => {
    expect(firstChangedIndex(residues, [...residues])).toBe(residues.length)
    expect(firstChangedIndex([], [])).toBe(0)
  })

  it('finds the first residue whose geometry-affecting fields differ', () => {
    const edited = residues.map((r, i) => (i === 1 ? { ...r, omega: 0 } : r))
    expect(firstChangedIndex(residues, edited)).toBe(1)
  })

  it('treats an amino-acid substitution as a change, since atoms carry identity', () => {
    const edited = residues.map((r, i) => (i === 2 ? { ...r, aminoAcid: 'PRO' as const } : r))
    expect(firstChangedIndex(residues, edited)).toBe(2)
  })

  it('reports the join point for an append and nothing for a truncation', () => {
    expect(firstChangedIndex(residues, [...residues, residue(4, -57, -47)])).toBe(3)
    expect(firstChangedIndex(residues, residues.slice(0, 2))).toBe(2)
  })
})
