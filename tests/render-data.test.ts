import { describe, expect, it } from 'vitest'

import { backboneBonds } from '../lib/bonds.ts'
import { buildBackbone } from '../lib/chain.ts'
import { BOND_LENGTH } from '../lib/constants.ts'
import { boundingSphere, fitDistance, frameCamera } from '../lib/framing.ts'
import { distance, norm, scale, sub, vec3, type Vec3 } from '../lib/nerf.ts'
import type { Atom, Residue } from '../lib/types.ts'
import fixture from './fixtures/1ubq-backbone.json' with { type: 'json' }

/**
 * Tests for the two pure modules the viewport consumes: bond topology and camera
 * framing. Both are derived-on-render data, so they get the same treatment as
 * the geometry — validated against the real 1UBQ backbone, not hand-picked
 * numbers.
 *
 * The framing tests exist mainly to pin one property: framing moves the camera,
 * never the structure. Every assertion here reads atoms; none produces new ones.
 */

const residue = (i: number, phi: number, psi: number, omega = 180): Residue => ({
  id: `r${i}`,
  aminoAcid: 'ALA',
  phi,
  psi,
  omega,
})

/** 1UBQ's real backbone angles, as in tests/chain.test.ts. */
const ubiquitin: Residue[] = fixture.residues.map((r) => ({
  id: `ubq-${r.residueSeq}`,
  aminoAcid: r.residueName as Residue['aminoAcid'],
  phi: r.phi ?? 0,
  psi: r.psi ?? 0,
  omega: r.omega ?? 180,
}))

/** Atoms carrying the deposited 1UBQ coordinates, bypassing the builder. */
const depositedAtoms: Atom[] = fixture.atoms.map((a) => ({
  name: a.name as Atom['name'],
  element: a.name === 'CA' ? 'C' : (a.name as Atom['element']),
  position: vec3(a.position.x, a.position.y, a.position.z),
  residueIndex: a.residueIndex,
  residueId: `ubq-${a.residueSeq}`,
  aminoAcid: a.residueName as Atom['aminoAcid'],
}))

describe('backboneBonds', () => {
  it('yields no bonds for an empty structure', () => {
    expect(backboneBonds([])).toEqual([])
  })

  it('gives a single residue its three intra-residue bonds and no peptide bond', () => {
    const bonds = backboneBonds(buildBackbone([residue(1, -57, -47)]))
    expect(bonds).toEqual([
      { a: 0, b: 1, kind: 'BACKBONE' },
      { a: 1, b: 2, kind: 'BACKBONE' },
      { a: 2, b: 3, kind: 'CARBONYL' },
    ])
  })

  it('counts 4n - 1 bonds: three per residue plus one peptide bond per link', () => {
    for (const n of [1, 2, 5, 76]) {
      const residues = Array.from({ length: n }, (_, i) => residue(i, -57, -47))
      expect(backboneBonds(buildBackbone(residues))).toHaveLength(4 * n - 1)
    }
  })

  it('bonds only chemically-bonded atom pairs, in every residue of 1UBQ', () => {
    const atoms = buildBackbone(ubiquitin)
    const expected: Record<string, string> = {
      'N-CA': 'BACKBONE',
      'CA-C': 'BACKBONE',
      'C-O': 'CARBONYL',
      'C-N': 'BACKBONE',
    }
    for (const bond of backboneBonds(atoms)) {
      const a = atoms[bond.a]!
      const b = atoms[bond.b]!
      expect(expected[`${a.name}-${b.name}`]).toBe(bond.kind)
      // A peptide bond is the only kind that crosses a residue boundary.
      const crossesResidue = a.residueIndex !== b.residueIndex
      expect(crossesResidue).toBe(a.name === 'C' && b.name === 'N')
      if (crossesResidue) expect(b.residueIndex).toBe(a.residueIndex + 1)
    }
  })

  it('produces bonds whose lengths are the ideal bond lengths', () => {
    const atoms = buildBackbone(ubiquitin)
    const expected: Record<string, number> = {
      'N-CA': BOND_LENGTH.N_CA,
      'CA-C': BOND_LENGTH.CA_C,
      'C-O': BOND_LENGTH.C_O,
      'C-N': BOND_LENGTH.C_N,
    }
    for (const bond of backboneBonds(atoms)) {
      const a = atoms[bond.a]!
      const b = atoms[bond.b]!
      expect(distance(a.position, b.position)).toBeCloseTo(expected[`${a.name}-${b.name}`]!, 9)
    }
  })

  it('spans every atom, so nothing renders as an orphan', () => {
    const atoms = buildBackbone(ubiquitin)
    const touched = new Set<number>()
    for (const bond of backboneBonds(atoms)) {
      touched.add(bond.a)
      touched.add(bond.b)
    }
    expect(touched.size).toBe(atoms.length)
  })

  it('is derived from chain order alone, not from distances', () => {
    // A wildly distorted chain (all-cis, eclipsed φ/ψ) keeps identical topology:
    // bonds come from the sequence, so a bad reconstruction looks wrong on
    // screen rather than quietly dropping bonds.
    const straight = Array.from({ length: 8 }, (_, i) => residue(i, -57, -47, 180))
    const distorted = Array.from({ length: 8 }, (_, i) => residue(i, 0, 0, 0))
    expect(backboneBonds(buildBackbone(distorted))).toEqual(
      backboneBonds(buildBackbone(straight)),
    )
  })
})

describe('boundingSphere', () => {
  it('is a zero-radius sphere at the origin for a blank canvas', () => {
    expect(boundingSphere([])).toEqual({ center: vec3(0, 0, 0), radius: 0 })
  })

  it('encloses every atom of the deposited 1UBQ structure', () => {
    const { center, radius } = boundingSphere(depositedAtoms)
    for (const atom of depositedAtoms) {
      expect(distance(center, atom.position)).toBeLessThanOrEqual(radius + 1e-12)
    }
    // Ubiquitin is a compact ~30 Å globule; its enclosing radius is ~20 Å.
    expect(radius).toBeGreaterThan(15)
    expect(radius).toBeLessThan(25)
  })

  it('touches the furthest atom exactly — the radius is not padded', () => {
    const { center, radius } = boundingSphere(depositedAtoms)
    const furthest = Math.max(...depositedAtoms.map((a) => distance(center, a.position)))
    expect(radius).toBeCloseTo(furthest, 12)
  })

  it('centres on the bounding-box midpoint', () => {
    const atoms = buildBackbone(ubiquitin)
    const axes = ['x', 'y', 'z'] as const
    const { center } = boundingSphere(atoms)
    for (const axis of axes) {
      const values = atoms.map((a) => a.position[axis])
      expect(center[axis]).toBeCloseTo((Math.min(...values) + Math.max(...values)) / 2, 12)
    }
  })

  it('translates with the structure and is unchanged by atom order', () => {
    const atoms = buildBackbone(ubiquitin)
    const offset = vec3(10, -20, 30)
    const moved = atoms.map((a) => ({ ...a, position: sub(a.position, offset) }))
    const base = boundingSphere(atoms)
    const shifted = boundingSphere(moved)
    expect(shifted.radius).toBeCloseTo(base.radius, 12)
    expect(distance(shifted.center, sub(base.center, offset))).toBeCloseTo(0, 12)

    const reversed = boundingSphere([...atoms].reverse())
    expect(reversed.radius).toBeCloseTo(base.radius, 12)
    expect(distance(reversed.center, base.center)).toBeCloseTo(0, 12)
  })
})

describe('fitDistance', () => {
  it('puts a 90-degree camera at r * sqrt(2) — the sphere touching both edges', () => {
    expect(fitDistance(1, 90)).toBeCloseTo(Math.SQRT2, 12)
  })

  it('scales linearly with radius and with padding', () => {
    expect(fitDistance(10, 50)).toBeCloseTo(fitDistance(1, 50) * 10, 12)
    expect(fitDistance(10, 50, 1.5)).toBeCloseTo(fitDistance(10, 50) * 1.5, 12)
  })

  it('recedes as the field of view narrows', () => {
    const distances = [120, 90, 50, 20, 5].map((fov) => fitDistance(1, fov))
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]!).toBeGreaterThan(distances[i - 1]!)
    }
  })

  it('subtends exactly the field of view: asin(r / d) = fov / 2', () => {
    const fov = 45
    const d = fitDistance(7.5, fov)
    expect((Math.asin(7.5 / d) * 360) / Math.PI).toBeCloseTo(fov, 9)
  })

  it('rejects a degenerate radius, field of view, or padding', () => {
    expect(() => fitDistance(-1, 50)).toThrow(/non-negative/)
    expect(() => fitDistance(Number.NaN, 50)).toThrow(/finite/)
    expect(() => fitDistance(1, 0)).toThrow(/\(0, 180\)/)
    expect(() => fitDistance(1, 180)).toThrow(/\(0, 180\)/)
    expect(() => fitDistance(1, 50, 0)).toThrow(/positive/)
  })
})

describe('frameCamera', () => {
  const fov = 50

  it('looks at the structure centre from the requested direction', () => {
    const atoms = buildBackbone(ubiquitin)
    const { center, radius } = boundingSphere(atoms)
    const { position, target } = frameCamera(atoms, {
      verticalFovDeg: fov,
      direction: vec3(0, 0, 1),
    })
    expect(distance(target, center)).toBeCloseTo(0, 12)
    expect(distance(position, center)).toBeCloseTo(fitDistance(radius, fov), 12)
    // Offset purely along +z, as asked.
    expect(norm(sub(sub(position, center), vec3(0, 0, distance(position, center))))).toBeCloseTo(
      0,
      12,
    )
  })

  it('normalizes the direction, so its magnitude does not change the distance', () => {
    const atoms = buildBackbone(ubiquitin)
    const shortDir = vec3(1, 1, 1)
    const longDir = scale(shortDir, 100)
    const a = frameCamera(atoms, { verticalFovDeg: fov, direction: shortDir })
    const b = frameCamera(atoms, { verticalFovDeg: fov, direction: longDir })
    expect(distance(a.position, b.position)).toBeCloseTo(0, 12)
  })

  it('honours minDistance when the structure is a single point', () => {
    const one = buildBackbone([residue(1, -57, -47)])
    const { center } = boundingSphere(one)
    const framed = frameCamera(one, { verticalFovDeg: fov, minDistance: 12 })
    // A 4-atom residue has a real but tiny radius; the floor should dominate.
    expect(distance(framed.position, center)).toBeCloseTo(12, 12)

    // Blank canvas: radius 0, so the floor is the only thing positioning it.
    const empty = frameCamera([], { verticalFovDeg: fov, minDistance: 12 })
    expect(distance(empty.position, vec3(0, 0, 0))).toBeCloseTo(12, 12)
    expect(empty.target).toEqual(vec3(0, 0, 0))
  })

  it('backs off as the chain grows, and is deterministic for equal input', () => {
    const grow = (n: number) =>
      frameCamera(
        buildBackbone(Array.from({ length: n }, (_, i) => residue(i, -139, 135))),
        { verticalFovDeg: fov },
      )
    const distances = [2, 4, 8, 16, 32].map((n) => {
      const { position, target } = grow(n)
      return distance(position, target)
    })
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]!).toBeGreaterThan(distances[i - 1]!)
    }
    expect(grow(8)).toEqual(grow(8))
  })

  it('does not touch the atoms it frames', () => {
    const atoms = buildBackbone(ubiquitin)
    const before: Vec3[] = atoms.map((a) => ({ ...a.position }))
    frameCamera(atoms, { verticalFovDeg: fov, padding: 1.4 })
    atoms.forEach((atom, i) => {
      expect(distance(atom.position, before[i]!)).toBe(0)
    })
  })
})
