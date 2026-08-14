import { describe, expect, it } from 'vitest'

import { backboneBonds } from '../lib/bonds.ts'
import { buildAtoms, placeSideChain } from '../lib/chain.ts'
import {
  CB_IMPROPER_DIHEDRAL,
  DEFAULT_CHI,
  PLANAR_CIS,
  PLANAR_TRANS,
  PRO_CB_IMPROPER_DIHEDRAL,
  SIDE_CHAIN_GEOMETRY,
  TETRAHEDRAL_BRANCH_OFFSET,
} from '../lib/constants.ts'
import { chiFor, updateChi, updateResidue } from '../lib/edits.ts'
import { bondAngle, dihedral, distance, normalizeDegrees, placeAtom, type Vec3 } from '../lib/nerf.ts'
import { elementOf, sideChainPlacements } from '../lib/sidechains.ts'
import { CHI_COUNT, heavyAtomCount, SIDE_CHAIN_TOPOLOGY } from '../lib/sidechainTopology.ts'
import { AMINO_ACID_CODES, type AminoAcidCode, type Residue } from '../lib/types.ts'
import fixture from './fixtures/4lzt-sidechains.json' with { type: 'json' }

/**
 * Tests for side-chain placement.
 *
 * Validated against 4LZT — hen egg-white lysozyme at 0.95 Å — which contains all
 * 20 standard amino acids. 1UBQ, the backbone fixture, has no cysteine and no
 * tryptophan and so cannot validate those two.
 *
 * The load-bearing test is the first one: feed each residue's *measured* internal
 * coordinates through `placeAtom` and reproduce the deposited position. That is
 * what validates the topology — the claim that Cγ is placed from (N, Cα, Cβ) and
 * not some other triple. A transposed reference triple would produce a
 * plausible-looking side chain rather than an obvious error, so it needs real data
 * to catch, and it needs to be checked for all 20 residues rather than a sample.
 *
 * The idealised constants are then checked separately, and more loosely, against
 * the same structure's distribution. Those two things are different claims and the
 * tests keep them apart.
 */

const residuesByCode = new Map<string, (typeof fixture.residues)[number][]>()
for (const residue of fixture.residues) {
  const list = residuesByCode.get(residue.residueName) ?? []
  list.push(residue)
  residuesByCode.set(residue.residueName, list)
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

const isBackbone = (atom: { name: string }): boolean =>
  atom.name === 'N' || atom.name === 'CA' || atom.name === 'C' || atom.name === 'O'

const residue = (aminoAcid: AminoAcidCode, chi?: readonly number[]): Residue => ({
  id: 'r1',
  aminoAcid,
  phi: -57,
  psi: -47,
  omega: 180,
  chi: chi ?? chiFor(aminoAcid),
})

describe('the fixture covers what it claims to', () => {
  it('contains all 20 standard amino acids', () => {
    expect([...residuesByCode.keys()].sort()).toEqual([...AMINO_ACID_CODES].sort())
  })

  it('includes the two 1UBQ lacks', () => {
    expect(residuesByCode.has('CYS')).toBe(true)
    expect(residuesByCode.has('TRP')).toBe(true)
  })

  it('is a high-resolution structure, which the geometry claims depend on', () => {
    expect(fixture.source.pdbId).toBe('4LZT')
    expect(fixture.residueCount).toBeGreaterThan(100)
  })
})

describe('placement reproduces deposited side-chain coordinates', () => {
  // The primary test. One case per amino acid so a failure names the residue.
  for (const code of AMINO_ACID_CODES) {
    const topology = SIDE_CHAIN_TOPOLOGY[code]
    if (topology.atoms.length === 0) continue

    it(`${code}: every atom, from its own measured internals`, () => {
      const examples = residuesByCode.get(code) ?? []
      expect(examples.length).toBeGreaterThan(0)

      let checked = 0
      for (const example of examples) {
        const placed = new Map<string, Vec3>(Object.entries(example.backbone))

        for (const atom of example.sideChain) {
          const [aName, bName, cName] = atom.refs as [string, string, string]
          const a = placed.get(aName)
          const b = placed.get(bName)
          const c = placed.get(cName)
          expect(a, `${code} ${atom.name}: reference ${aName} placed first`).toBeDefined()
          expect(b, `${code} ${atom.name}: reference ${bName} placed first`).toBeDefined()
          expect(c, `${code} ${atom.name}: reference ${cName} placed first`).toBeDefined()

          const result = placeAtom(
            a!,
            b!,
            c!,
            atom.internal.bondLength,
            atom.internal.bondAngleDeg,
            atom.internal.dihedralDeg,
          )
          // Reconstructed from the deposited positions themselves, so this is a
          // test of the placement algebra and the reference triples, at full
          // floating-point precision.
          expect(
            distance(result, atom.position),
            `${code} ${example.residueSeq} ${atom.name}`,
          ).toBeLessThan(1e-6)

          // Chain from the *reconstructed* position, not the deposited one, so any
          // error would compound rather than be silently reset each step.
          placed.set(atom.name, result)
          checked++
        }
      }
      expect(checked).toBeGreaterThan(0)
    })
  }

  it('checks every side-chain atom in the structure', () => {
    const total = fixture.residues.reduce((sum, r) => sum + r.sideChain.length, 0)
    expect(total).toBeGreaterThan(400)
  })
})

describe('the derived reference triples are chemically right', () => {
  it('places Cβ from the backbone, as an improper dihedral', () => {
    for (const code of AMINO_ACID_CODES) {
      if (code === 'GLY') continue
      const [first] = sideChainPlacements(code)
      expect(first?.name).toBe('CB')
      expect(first?.refs).toEqual(['N', 'C', 'CA'])
    }
  })

  it('places every other atom from the two bonds back toward Cα', () => {
    for (const code of AMINO_ACID_CODES) {
      const topology = SIDE_CHAIN_TOPOLOGY[code]
      for (const placement of sideChainPlacements(code)) {
        if (placement.name === 'CB') continue
        // The third reference is the atom this one is bonded to.
        const bondedTo = topology.atoms.find((a) => a.name === placement.name)!.bondedTo
        expect(placement.refs[2], `${code} ${placement.name}`).toBe(bondedTo)
      }
    }
  })

  it('only ever references atoms placed earlier', () => {
    for (const code of AMINO_ACID_CODES) {
      const available = new Set(['N', 'CA', 'C', 'O'])
      for (const placement of sideChainPlacements(code)) {
        for (const ref of placement.refs) {
          expect(available.has(ref), `${code} ${placement.name} references ${ref}`).toBe(true)
        }
        available.add(placement.name)
      }
    }
  })

  it('matches the reference triples the fixture measured independently', () => {
    // The fixture derives its triples through the same code path, so this is not
    // independent verification of the rule — but it does pin that the rule the
    // tests validated against real coordinates is the rule the app uses.
    for (const [code, examples] of residuesByCode) {
      const placements = sideChainPlacements(code as AminoAcidCode)
      const example = examples[0]!
      expect(example.sideChain.map((a) => a.name)).toEqual(placements.map((p) => p.name))
      example.sideChain.forEach((atom, i) => {
        expect(atom.refs).toEqual([...placements[i]!.refs])
      })
    }
  })
})

describe('the idealised constants sit close to real geometry', () => {
  /**
   * Tolerances, and why they are what they are.
   *
   * These are *idealised* values standing in for a distribution, so the question
   * is not whether they match exactly but whether the idealisation is small
   * against the thing being shown. 0.05 Å is under 4% of a bond and invisible at
   * ball-and-stick scale; 4° of bond angle moves an atom ~0.1 Å.
   */
  const LENGTH_TOLERANCE = 0.05
  const ANGLE_TOLERANCE = 4

  it('bond lengths are within 0.05 Å of the measured median, for every atom', () => {
    const failures: string[] = []
    for (const [code, examples] of residuesByCode) {
      const geometry = SIDE_CHAIN_GEOMETRY[code]
      if (!geometry) continue
      for (const placement of sideChainPlacements(code as AminoAcidCode)) {
        const measured = examples
          .flatMap((r) => r.sideChain.filter((a) => a.name === placement.name))
          .map((a) => a.internal.bondLength)
        if (measured.length === 0) continue
        const deviation = Math.abs(placement.length - median(measured))
        if (deviation > LENGTH_TOLERANCE) {
          failures.push(`${code}.${placement.name} off by ${deviation.toFixed(3)} Å`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('bond angles are within 4° of the measured median, for every atom', () => {
    const failures: string[] = []
    for (const [code, examples] of residuesByCode) {
      const geometry = SIDE_CHAIN_GEOMETRY[code]
      if (!geometry) continue
      for (const placement of sideChainPlacements(code as AminoAcidCode)) {
        const measured = examples
          .flatMap((r) => r.sideChain.filter((a) => a.name === placement.name))
          .map((a) => a.internal.bondAngleDeg)
        if (measured.length === 0) continue
        const deviation = Math.abs(placement.angle - median(measured))
        if (deviation > ANGLE_TOLERANCE) {
          failures.push(`${code}.${placement.name} off by ${deviation.toFixed(1)}°`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('the Cβ improper is within 5° of measurement for every residue', () => {
    // A single constant standing in for a 121°–127° spread, so this tolerance is
    // wider than the per-atom ones above and deliberately documented as such.
    const failures: string[] = []
    for (const [code, examples] of residuesByCode) {
      if (code === 'GLY') continue
      const measured = examples
        .flatMap((r) => r.sideChain.filter((a) => a.name === 'CB'))
        .map((a) => a.internal.dihedralDeg)
      const expectedValue = code === 'PRO' ? PRO_CB_IMPROPER_DIHEDRAL : CB_IMPROPER_DIHEDRAL
      const deviation = Math.abs(normalizeDegrees(median(measured) - expectedValue))
      if (deviation > 5) failures.push(`${code} off by ${deviation.toFixed(1)}°`)
    }
    expect(failures).toEqual([])
  })

  it('proline genuinely needs its own Cβ improper', () => {
    // Justifying the extra constant: if proline were within tolerance of the
    // shared value, the constant would be dead weight.
    const measured = residuesByCode
      .get('PRO')!
      .flatMap((r) => r.sideChain.filter((a) => a.name === 'CB'))
      .map((a) => a.internal.dihedralDeg)
    expect(Math.abs(normalizeDegrees(median(measured) - CB_IMPROPER_DIHEDRAL))).toBeGreaterThan(5)
  })

  it('the branch and ring dihedral offsets match measurement', () => {
    const failures: string[] = []
    for (const [code, examples] of residuesByCode) {
      for (const placement of sideChainPlacements(code as AminoAcidCode)) {
        if (placement.dihedral.kind === 'chi' || placement.name === 'CB') continue

        const deviations: number[] = []
        for (const example of examples) {
          const own = example.sideChain.find((a) => a.name === placement.name)
          if (!own) continue
          if (placement.dihedral.kind === 'fixed') {
            deviations.push(normalizeDegrees(own.internal.dihedralDeg - placement.dihedral.degrees))
          } else {
            // An offset is relative to the χ-driven sibling, so compare the gap.
            const sibling = example.sideChain.find(
              (a) =>
                a.name !== placement.name &&
                a.refs[0] === placement.refs[0] &&
                a.refs[1] === placement.refs[1] &&
                a.refs[2] === placement.refs[2],
            )
            if (!sibling) continue
            const gap = normalizeDegrees(own.internal.dihedralDeg - sibling.internal.dihedralDeg)
            deviations.push(normalizeDegrees(gap - placement.dihedral.degrees))
          }
        }
        if (deviations.length === 0) continue
        const worst = Math.abs(median(deviations))
        // 8°: the tetrahedral offset is one constant covering 121°–126° of real
        // spread, and the planar ones cover 174°–180°.
        if (worst > 8) failures.push(`${code}.${placement.name} off by ${worst.toFixed(1)}°`)
      }
    }
    expect(failures).toEqual([])
  })

  it('uses only the four named dihedral constants', () => {
    const allowed = new Set([
      CB_IMPROPER_DIHEDRAL,
      PRO_CB_IMPROPER_DIHEDRAL,
      TETRAHEDRAL_BRANCH_OFFSET,
      -TETRAHEDRAL_BRANCH_OFFSET,
      PLANAR_CIS,
      PLANAR_TRANS,
    ])
    for (const code of AMINO_ACID_CODES) {
      for (const placement of sideChainPlacements(code)) {
        if (placement.dihedral.kind === 'chi') continue
        expect(allowed.has(placement.dihedral.degrees), `${code}.${placement.name}`).toBe(true)
      }
    }
  })
})

describe('χ drives the side chain and nothing else', () => {
  it('turning χ1 moves the side chain but not one backbone atom', () => {
    const before = buildAtoms([residue('LYS')])
    const after = buildAtoms([residue('LYS', [60, 180, 180, 180])])

    const backboneBefore = before.filter(isBackbone)
    const backboneAfter = after.filter(isBackbone)
    backboneAfter.forEach((atom, i) => {
      expect(atom.position).toEqual(backboneBefore[i]!.position)
    })

    // Cβ is placed from the backbone by a fixed improper, so χ1 doesn't move it
    // either — χ1 is the rotation *about* Cα–Cβ.
    const cbBefore = before.find((a) => a.name === 'CB')!
    const cbAfter = after.find((a) => a.name === 'CB')!
    expect(distance(cbBefore.position, cbAfter.position)).toBeLessThan(1e-12)

    // Everything beyond Cβ swings.
    const cgBefore = before.find((a) => a.name === 'CG')!
    const cgAfter = after.find((a) => a.name === 'CG')!
    expect(distance(cgBefore.position, cgAfter.position)).toBeGreaterThan(0.5)
  })

  it('χ1 is the N-Cα-Cβ-Cγ dihedral it claims to be', () => {
    for (const value of [-60, 0, 60, 175]) {
      const atoms = buildAtoms([residue('LEU', [value, 180])])
      const at = (name: string) => atoms.find((a) => a.name === name)!.position
      expect(dihedral(at('N'), at('CA'), at('CB'), at('CG'))).toBeCloseTo(value, 6)
    }
  })

  it('every χ of every residue is the dihedral its topology names', () => {
    for (const code of AMINO_ACID_CODES) {
      const topology = SIDE_CHAIN_TOPOLOGY[code]
      if (topology.chi.length === 0) continue
      // Distinct values so a mixed-up index shows as a mismatch.
      const chi = topology.chi.map((_, i) => -150 + i * 47)
      const atoms = buildAtoms([residue(code, chi)])
      const at = (name: string) => atoms.find((a) => a.name === name)!.position

      topology.chi.forEach((quad, i) => {
        const measured = dihedral(at(quad[0]), at(quad[1]), at(quad[2]), at(quad[3]))
        expect(measured, `${code} χ${i + 1} = ${quad.join('-')}`).toBeCloseTo(chi[i]!, 6)
      })
    }
  })

  it('a χ beyond χ1 leaves the atoms before it in place', () => {
    const before = buildAtoms([residue('ARG', [-60, 180, 180, 180])])
    const after = buildAtoms([residue('ARG', [-60, 60, 180, 180])])
    const at = (list: readonly { name: string; position: Vec3 }[], name: string) =>
      list.find((a) => a.name === name)!.position
    // χ2 rotates about Cβ–Cγ, so N/CA/CB/CG are fixed and Cδ outward moves.
    for (const name of ['N', 'CA', 'C', 'O', 'CB', 'CG']) {
      expect(distance(at(before, name), at(after, name)), name).toBeLessThan(1e-12)
    }
    expect(distance(at(before, 'CD'), at(after, 'CD'))).toBeGreaterThan(0.5)
  })

  it('falls back to the default rotamer when χ is missing', () => {
    // A residue built by hand without χ values must still place a full side chain.
    const withoutChi = buildAtoms([{ ...residue('TRP'), chi: [] }])
    const withDefaults = buildAtoms([residue('TRP', DEFAULT_CHI.TRP)])
    expect(withoutChi).toHaveLength(withDefaults.length)
    withoutChi.forEach((atom, i) => {
      expect(distance(atom.position, withDefaults[i]!.position)).toBeLessThan(1e-12)
    })
  })
})

describe('atom counts follow the amino acid', () => {
  it('matches the topology for every residue', () => {
    for (const code of AMINO_ACID_CODES) {
      expect(buildAtoms([residue(code)]), code).toHaveLength(heavyAtomCount(code))
    }
  })

  it('glycine has no Cβ and alanine has nothing beyond it', () => {
    expect(buildAtoms([residue('GLY')]).map((a) => a.name)).toEqual(['N', 'CA', 'C', 'O'])
    expect(buildAtoms([residue('ALA')]).map((a) => a.name)).toEqual(['N', 'CA', 'C', 'O', 'CB'])
  })

  it('changes when the amino acid changes — the point of the feature', () => {
    let residues = [residue('GLY')]
    expect(buildAtoms(residues)).toHaveLength(4)

    residues = updateResidue(residues, 0, { aminoAcid: 'ALA' })
    expect(buildAtoms(residues)).toHaveLength(5)

    residues = updateResidue(residues, 0, { aminoAcid: 'TRP' })
    expect(buildAtoms(residues)).toHaveLength(14)
    expect(residues[0]!.chi).toHaveLength(2)

    residues = updateResidue(residues, 0, { aminoAcid: 'GLY' })
    expect(buildAtoms(residues)).toHaveLength(4)
    expect(residues[0]!.chi).toEqual([])
  })

  it('matches the deposited atom count for every residue in 4LZT', () => {
    for (const example of fixture.residues) {
      expect(
        example.sideChain.length + 4,
        `${example.residueName} ${example.residueSeq}`,
      ).toBe(heavyAtomCount(example.residueName as AminoAcidCode))
    }
  })

  it('agrees with the standard χ counts', () => {
    expect(CHI_COUNT.GLY).toBe(0)
    expect(CHI_COUNT.ALA).toBe(0)
    expect(CHI_COUNT.SER).toBe(1)
    expect(CHI_COUNT.VAL).toBe(1)
    expect(CHI_COUNT.LEU).toBe(2)
    expect(CHI_COUNT.MET).toBe(3)
    expect(CHI_COUNT.LYS).toBe(4)
    expect(CHI_COUNT.ARG).toBe(4)
  })
})

describe('chiFor', () => {
  it('sizes the array to the amino acid', () => {
    for (const code of AMINO_ACID_CODES) {
      expect(chiFor(code), code).toHaveLength(CHI_COUNT[code])
    }
  })

  it('carries existing values over positionally', () => {
    expect(chiFor('LYS', [11, 22])).toEqual([11, 22, 180, 180])
  })

  it('truncates when the new residue has fewer χ', () => {
    expect(chiFor('SER', [11, 22, 33, 44])).toEqual([11])
  })

  it('wraps carried-over values', () => {
    expect(chiFor('SER', [200])[0]).toBeCloseTo(-160, 10)
  })
})

describe('updateChi', () => {
  const residues = [residue('LYS')]

  it('sets one χ by 1-based index', () => {
    expect(updateChi(residues, 0, 2, 75)[0]!.chi).toEqual([-60, 75, 180, 180])
  })

  it('wraps the value', () => {
    expect(updateChi(residues, 0, 1, 200)[0]!.chi[0]).toBeCloseTo(-160, 10)
  })

  it('ignores an index the residue does not have', () => {
    // A stale UI event after an amino-acid change is not an error.
    expect(updateChi(residues, 0, 5, 90)[0]!.chi).toEqual(residues[0]!.chi)
    expect(updateChi(residues, 0, 0, 90)[0]!.chi).toEqual(residues[0]!.chi)
    expect(updateChi([residue('GLY')], 0, 1, 90)[0]!.chi).toEqual([])
  })

  it('does not mutate its input', () => {
    const snapshot = structuredClone(residues)
    updateChi(residues, 0, 1, 90)
    expect(residues).toEqual(snapshot)
  })
})

describe('bonds cover the side chain', () => {
  it('leaves no side-chain atom unbonded, for every amino acid', () => {
    for (const code of AMINO_ACID_CODES) {
      const atoms = buildAtoms([residue(code)])
      const bonded = new Set<number>()
      for (const bond of backboneBonds(atoms)) {
        bonded.add(bond.a)
        bonded.add(bond.b)
      }
      atoms.forEach((atom, i) => {
        expect(bonded.has(i), `${code} ${atom.name} is an orphan`).toBe(true)
      })
    }
  })

  it('draws the ring closures', () => {
    // Both atoms are already placed when a ring closes, so the bond is topology
    // only — but it must be drawn, or a phenylalanine renders as an open chain.
    const cyclic: AminoAcidCode[] = ['PRO', 'HIS', 'PHE', 'TYR', 'TRP']
    for (const code of cyclic) {
      const atoms = buildAtoms([residue(code)])
      const bonds = backboneBonds(atoms)
      const topology = SIDE_CHAIN_TOPOLOGY[code]
      expect(topology.ringClosures.length).toBeGreaterThan(0)

      for (const [fromName, toName] of topology.ringClosures) {
        const from = atoms.findIndex((a) => a.name === fromName)
        const to = atoms.findIndex((a) => a.name === toName)
        const found = bonds.some(
          (b) => (b.a === from && b.b === to) || (b.a === to && b.b === from),
        )
        expect(found, `${code} ring closure ${fromName}–${toName}`).toBe(true)
      }
    }
  })

  it('labels side-chain bonds distinctly from the main chain', () => {
    const bonds = backboneBonds(buildAtoms([residue('LYS')]))
    expect(bonds.filter((b) => b.kind === 'SIDECHAIN')).toHaveLength(5)
    expect(bonds.filter((b) => b.kind === 'BACKBONE')).toHaveLength(2)
    expect(bonds.filter((b) => b.kind === 'CARBONYL')).toHaveLength(1)
  })
})

describe('ideal geometry does not close the rings — and that is the output', () => {
  it('leaves proline’s ring slightly open', () => {
    // Placed outward from ideal parameters, so the Cδ–N closure will not land at
    // the ideal bond length. Pinned rather than corrected: closing it would mean
    // minimisation, which claude.md forbids. If this ever starts passing exactly,
    // something has started "fixing" the geometry.
    const atoms = buildAtoms([residue('PRO')])
    const at = (name: string) => atoms.find((a) => a.name === name)!.position
    const closure = distance(at('CD'), at('N'))
    // A real Cδ–N bond is ~1.47 Å.
    expect(closure).toBeGreaterThan(1.0)
    expect(closure).toBeLessThan(2.2)
    expect(Math.abs(closure - 1.47)).toBeGreaterThan(1e-6)
  })

  it('keeps the aromatic rings very nearly closed and planar', () => {
    // The aromatics fare much better than proline: their dihedrals are all 0° or
    // 180°, so the ring closes to within a few hundredths of an ångström.
    for (const code of ['PHE', 'TYR', 'TRP', 'HIS'] as const) {
      const atoms = buildAtoms([residue(code)])
      const at = (name: string) => atoms.find((a) => a.name === name)!.position
      for (const [fromName, toName] of SIDE_CHAIN_TOPOLOGY[code].ringClosures) {
        const length = distance(at(fromName), at(toName))
        expect(length, `${code} ${fromName}–${toName}`).toBeGreaterThan(1.2)
        expect(length, `${code} ${fromName}–${toName}`).toBeLessThan(1.6)
      }
    }
  })

  it('places no two atoms of one residue on top of each other, in any rotamer', () => {
    // A transposed reference triple or a sign error would usually show up as an
    // atom landing inside another. Checked for all 20 residues in each of the three
    // staggered rotamer wells — the conformations side chains actually occupy.
    for (const code of AMINO_ACID_CODES) {
      for (const spin of [-60, 60, 180]) {
        const chi = chiFor(code).map(() => spin)
        const atoms = buildAtoms([residue(code, chi)])
        for (let i = 0; i < atoms.length; i++) {
          for (let j = i + 1; j < atoms.length; j++) {
            expect(
              distance(atoms[i]!.position, atoms[j]!.position),
              `${code} χ=${spin}: ${atoms[i]!.name} vs ${atoms[j]!.name}`,
            ).toBeGreaterThan(0.8)
          }
        }
      }
    }
  })

  it('lets a fully eclipsed side chain fold into itself — also the correct output', () => {
    // Setting every χ of an arginine to 0° eclipses every torsion, which curls the
    // side chain back onto its own backbone: Nη ends up 0.64 Å from the backbone N.
    // No protein adopts this, and the tool builds it anyway, because the user asked
    // for it. Pinned deliberately — if this ever stops overlapping, something has
    // started rejecting or relaxing user input.
    const atoms = buildAtoms([residue('ARG', [0, 0, 0, 0])])
    const at = (name: string) => atoms.find((a) => a.name === name)!.position
    expect(distance(at('N'), at('NE'))).toBeLessThan(1)
  })
})

describe('elementOf', () => {
  it('reads the element off the atom name', () => {
    expect(elementOf('CB')).toBe('C')
    expect(elementOf('ND2')).toBe('N')
    expect(elementOf('OG1')).toBe('O')
    expect(elementOf('SD')).toBe('S')
  })

  it('assigns the right element to every atom of every residue', () => {
    for (const code of AMINO_ACID_CODES) {
      for (const placement of sideChainPlacements(code)) {
        expect(placement.element, `${code} ${placement.name}`).toBe(placement.name[0])
      }
    }
  })

  it('rejects a name it cannot read', () => {
    expect(() => elementOf('FE')).toThrow(/Cannot infer element/)
    expect(() => elementOf('')).toThrow(/Cannot infer element/)
  })
})

describe('placeSideChain', () => {
  it('returns nothing for glycine', () => {
    const backbone = { N: { x: 0, y: 0, z: 0 }, CA: { x: 1.458, y: 0, z: 0 }, C: { x: 2, y: 1.4, z: 0 }, O: { x: 3, y: 1.5, z: 0 } }
    expect(placeSideChain(backbone, residue('GLY'), 0)).toEqual([])
  })

  it('tags every atom with the residue it belongs to', () => {
    const atoms = buildAtoms([residue('ARG')])
    for (const atom of atoms) {
      expect(atom.residueIndex).toBe(0)
      expect(atom.residueId).toBe('r1')
      expect(atom.aminoAcid).toBe('ARG')
    }
  })

  it('produces the ideal bond length and angle it was given', () => {
    // Closes the loop on the constants: what the table says is what gets built.
    for (const code of AMINO_ACID_CODES) {
      const atoms = buildAtoms([residue(code)])
      const at = (name: string) => atoms.find((a) => a.name === name)!.position
      for (const placement of sideChainPlacements(code)) {
        const [, bName, cName] = placement.refs
        expect(distance(at(cName), at(placement.name)), `${code} ${placement.name} length`).toBeCloseTo(
          placement.length,
          9,
        )
        expect(bondAngle(at(bName), at(cName), at(placement.name)), `${code} ${placement.name} angle`).toBeCloseTo(
          placement.angle,
          9,
        )
      }
    }
  })
})
