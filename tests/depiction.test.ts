import { describe, expect, it } from 'vitest'

import { backboneBonds } from '../lib/bonds.ts'
import { buildAtoms } from '../lib/chain.ts'
import { depict } from '../lib/depiction.ts'
import { chiFor } from '../lib/edits.ts'
import { formatFormula, freeAminoAcidFormula, molecularFormula, unmodelledHeavyAtoms } from '../lib/formula.ts'
import { heavyAtomCount, SIDE_CHAIN_TOPOLOGY } from '../lib/sidechainTopology.ts'
import { AMINO_ACID_CODES, type AminoAcidCode, type Residue } from '../lib/types.ts'

/**
 * Tests for the 2D depiction and the molecular formula.
 *
 * The central assertion is that **the 2D view cannot invent or lose a bond**
 * relative to the 3D one. It is a second rendering of the same topology, and the
 * failure mode that matters is the two disagreeing — a ring drawn with the right
 * atoms and the wrong bonds looks plausible, which is exactly how the vertex
 * ordering bug in `ringsOf` survived until this test was written.
 *
 * The formula's element counts are cross-checked two ways: C/N/O/S against the bond
 * graph, and the whole thing against known peptide formulas.
 */

const residue = (aminoAcid: AminoAcidCode): Residue => ({
  id: `r-${aminoAcid}`,
  aminoAcid,
  phi: -57,
  psi: -47,
  omega: 180,
  chi: chiFor(aminoAcid),
})

const chain = (...codes: AminoAcidCode[]): Residue[] =>
  codes.map((code, i) => ({ ...residue(code), id: `r${i + 1}` }))

/** The edge set of a depiction, as sorted `key|key` strings, caps excluded. */
const depictionEdges = (residues: readonly Residue[]): Set<string> =>
  new Set(
    depict(residues)
      .edges.filter((edge) => edge.kind !== 'CAP')
      .map((edge) => [edge.from, edge.to].sort().join('|')),
  )

/** The same set, derived from the 3D structure's bonds. */
const structureEdges = (residues: readonly Residue[]): Set<string> => {
  const atoms = buildAtoms(residues)
  return new Set(
    backboneBonds(atoms).map((bond) => {
      const a = atoms[bond.a]!
      const b = atoms[bond.b]!
      return [`${a.residueIndex}:${a.name}`, `${b.residueIndex}:${b.name}`].sort().join('|')
    }),
  )
}

describe('the 2D depiction has exactly the 3D structure’s bonds', () => {
  for (const code of AMINO_ACID_CODES) {
    it(`${code}`, () => {
      const residues = [residue(code)]
      const twoD = depictionEdges(residues)
      const threeD = structureEdges(residues)
      expect([...twoD].sort()).toEqual([...threeD].sort())
    })
  }

  it('for a mixed chain, including the peptide bonds', () => {
    const residues = chain('GLY', 'PRO', 'PHE', 'TRP', 'HIS', 'TYR', 'ARG', 'CYS')
    expect([...depictionEdges(residues)].sort()).toEqual([...structureEdges(residues)].sort())
  })

  it('for a long chain', () => {
    const residues = chain(...AMINO_ACID_CODES, ...AMINO_ACID_CODES)
    expect([...depictionEdges(residues)].sort()).toEqual([...structureEdges(residues)].sort())
  })
})

describe('nodes', () => {
  it('has one real node per heavy atom, plus the two terminus caps', () => {
    for (const code of AMINO_ACID_CODES) {
      const { nodes } = depict([residue(code)])
      const real = nodes.filter((node) => node.isRealAtom)
      expect(real, code).toHaveLength(heavyAtomCount(code))
      expect(nodes.filter((node) => !node.isRealAtom)).toHaveLength(2)
    }
  })

  it('keys every node uniquely, so highlighting is unambiguous', () => {
    const { nodes } = depict(chain(...AMINO_ACID_CODES))
    expect(new Set(nodes.map((node) => node.key)).size).toBe(nodes.length)
  })

  it('keys real atoms as residueIndex:atomName, which is how stage 10 addresses them', () => {
    const { nodes } = depict(chain('GLY', 'TRP'))
    const trpCz2 = nodes.find((node) => node.key === '1:CZ2')
    expect(trpCz2).toBeDefined()
    expect(trpCz2!.residueIndex).toBe(1)
    expect(trpCz2!.atomName).toBe('CZ2')
  })

  it('matches every real node to an atom the builder actually places', () => {
    const residues = chain(...AMINO_ACID_CODES)
    const atoms = new Set(
      buildAtoms(residues).map((atom) => `${atom.residueIndex}:${atom.name}`),
    )
    for (const node of depict(residues).nodes) {
      if (!node.isRealAtom) continue
      expect(atoms.has(node.key), node.key).toBe(true)
    }
    // ...and every placed atom has a node.
    const nodeKeys = new Set(depict(residues).nodes.map((node) => node.key))
    for (const key of atoms) expect(nodeKeys.has(key), key).toBe(true)
  })

  it('overlaps no two nodes, for any residue', () => {
    for (const code of AMINO_ACID_CODES) {
      const { nodes } = depict([residue(code)])
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const gap = Math.hypot(nodes[i]!.x - nodes[j]!.x, nodes[i]!.y - nodes[j]!.y)
          expect(gap, `${code}: ${nodes[i]!.atomName} vs ${nodes[j]!.atomName}`).toBeGreaterThan(0.3)
        }
      }
    }
  })

  it('overlaps no two nodes across a mixed chain either', () => {
    const { nodes } = depict(chain('TRP', 'TRP', 'ARG', 'PHE', 'GLY'))
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const gap = Math.hypot(nodes[i]!.x - nodes[j]!.x, nodes[i]!.y - nodes[j]!.y)
        expect(gap, `${nodes[i]!.key} vs ${nodes[j]!.key}`).toBeGreaterThan(0.3)
      }
    }
  })

  it('follows skeletal convention: heteroatoms labelled, carbons bare', () => {
    const { nodes } = depict(chain(...AMINO_ACID_CODES))
    for (const node of nodes) {
      if (!node.isRealAtom) {
        expect(node.showLabel, node.key).toBe(true)
        continue
      }
      const expected = node.element !== 'C' || node.atomName === 'CA' || node.atomName === 'CB'
      expect(node.showLabel, `${node.key} (${node.element})`).toBe(expected)
    }
    // Concretely: a phenylalanine ring has no labelled carbon in it.
    const phe = nodes.filter((n) => n.residueIndex === AMINO_ACID_CODES.indexOf('PHE'))
    const ringCarbons = phe.filter((n) => ['CG', 'CD1', 'CE1', 'CZ', 'CE2', 'CD2'].includes(n.atomName))
    expect(ringCarbons).toHaveLength(6)
    expect(ringCarbons.every((n) => !n.showLabel)).toBe(true)
    // ...but tyrosine's hydroxyl oxygen is labelled.
    const tyrOh = nodes.find(
      (n) => n.residueIndex === AMINO_ACID_CODES.indexOf('TYR') && n.atomName === 'OH',
    )!
    expect(tyrOh.showLabel).toBe(true)
  })

  it('labels Cα and Cβ with Greek letters, and the caps as groups', () => {
    const { nodes } = depict([residue('ALA')])
    expect(nodes.find((n) => n.atomName === 'CA')!.label).toBe('Cα')
    expect(nodes.find((n) => n.atomName === 'CB')!.label).toBe('Cβ')
    expect(nodes.find((n) => n.key === 'cap:N')!.label).toBe('H₂N')
    expect(nodes.find((n) => n.key === 'cap:C')!.label).toBe('OH')
  })
})

describe('layout', () => {
  it('runs the main chain left to right', () => {
    const { nodes } = depict(chain('GLY', 'GLY', 'GLY'))
    const cas = nodes.filter((node) => node.atomName === 'CA')
    expect(cas.map((node) => node.x)).toEqual([...cas.map((node) => node.x)].sort((a, b) => a - b))
  })

  it('zig-zags: Cα is raised above the N and C either side of it', () => {
    const { nodes } = depict([residue('GLY')])
    const y = (name: string) => nodes.find((node) => node.atomName === name)!.y
    expect(y('CA')).toBeGreaterThan(y('N'))
    expect(y('CA')).toBeGreaterThan(y('C'))
  })

  it('hangs each carbonyl O below its C, as a double bond', () => {
    const { nodes, edges } = depict([residue('GLY')])
    const c = nodes.find((node) => node.atomName === 'C')!
    const o = nodes.find((node) => node.atomName === 'O')!
    expect(o.y).toBeLessThan(c.y)
    expect(o.x).toBeCloseTo(c.x, 6)
    const carbonyl = edges.find((edge) => edge.kind === 'CARBONYL')!
    expect(carbonyl.double).toBe(true)
  })

  it('grows side chains upward, away from the carbonyls', () => {
    const { nodes } = depict([residue('LYS')])
    const ca = nodes.find((node) => node.atomName === 'CA')!
    for (const name of ['CB', 'CG', 'CD', 'CE', 'NZ']) {
      expect(nodes.find((node) => node.atomName === name)!.y, name).toBeGreaterThan(ca.y)
    }
  })

  it('places rings as regular polygons, not fans', () => {
    // Every ring bond the same length is what makes it read as a ring.
    const { nodes } = depict([residue('PHE')])
    const at = (name: string) => nodes.find((node) => node.atomName === name)!
    const ring = ['CG', 'CD1', 'CE1', 'CZ', 'CE2', 'CD2'].map(at)
    const sides = ring.map((node, i) => {
      const next = ring[(i + 1) % ring.length]!
      return Math.hypot(node.x - next.x, node.y - next.y)
    })
    for (const side of sides) expect(side).toBeCloseTo(sides[0]!, 6)
    expect(sides[0]).toBeCloseTo(1, 6)
  })

  it('is deterministic', () => {
    const residues = chain('TRP', 'ARG', 'PRO')
    expect(depict(residues)).toEqual(depict(residues))
  })

  it('ignores the 3D geometry entirely — same sequence, same picture', () => {
    // The claim that this is a depiction rather than a projection. Two chains with
    // wildly different conformations must draw identically.
    const a = chain('LEU', 'PHE', 'LYS')
    const b = a.map((r) => ({ ...r, phi: 120, psi: -170, omega: 0, chi: r.chi.map(() => 33) }))
    expect(depict(b)).toEqual(depict(a))
  })

  it('is empty for a blank canvas', () => {
    expect(depict([])).toEqual({ nodes: [], edges: [], width: 0, height: 0 })
  })

  it('reports a width that grows with the chain', () => {
    expect(depict(chain('GLY', 'GLY')).width).toBeGreaterThan(depict(chain('GLY')).width)
  })
})

describe('molecularFormula', () => {
  it('matches the known free amino acids', () => {
    // Spot-checked against standard formulas, which also validates that the
    // hand-written hydrogen counts line up with the bond graph's C/N/O/S.
    expect(freeAminoAcidFormula('GLY')).toEqual({ C: 2, H: 5, N: 1, O: 2, S: 0 })
    expect(freeAminoAcidFormula('ALA')).toEqual({ C: 3, H: 7, N: 1, O: 2, S: 0 })
    expect(freeAminoAcidFormula('CYS')).toEqual({ C: 3, H: 7, N: 1, O: 2, S: 1 })
    expect(freeAminoAcidFormula('TRP')).toEqual({ C: 11, H: 12, N: 2, O: 2, S: 0 })
    expect(freeAminoAcidFormula('ARG')).toEqual({ C: 6, H: 14, N: 4, O: 2, S: 0 })
    expect(freeAminoAcidFormula('HIS')).toEqual({ C: 6, H: 9, N: 3, O: 2, S: 0 })
    expect(freeAminoAcidFormula('MET')).toEqual({ C: 5, H: 11, N: 1, O: 2, S: 1 })
    expect(freeAminoAcidFormula('TYR')).toEqual({ C: 9, H: 11, N: 1, O: 3, S: 0 })
  })

  it('counts C, N, O and S from the bond graph, so they cannot drift from it', () => {
    for (const code of AMINO_ACID_CODES) {
      const formula = freeAminoAcidFormula(code)
      const sideChain = SIDE_CHAIN_TOPOLOGY[code].atoms
      const countIn = (element: string) =>
        sideChain.filter((atom) => atom.name.startsWith(element)).length
      expect(formula.C, `${code} C`).toBe(2 + countIn('C'))
      expect(formula.N, `${code} N`).toBe(1 + countIn('N'))
      expect(formula.O, `${code} O`).toBe(2 + countIn('O'))
      expect(formula.S, `${code} S`).toBe(countIn('S'))
    }
  })

  it('condenses a dipeptide, losing one water', () => {
    // Glycylglycine is C4H8N2O3.
    expect(molecularFormula(chain('GLY', 'GLY'))).toEqual({ C: 4, H: 8, N: 2, O: 3, S: 0 })
  })

  it('condenses a tripeptide, losing two', () => {
    // Glutathione's backbone is Glu-Cys-Gly: C10H17N3O6S.
    expect(molecularFormula(chain('GLU', 'CYS', 'GLY'))).toEqual({
      C: 10,
      H: 17,
      N: 3,
      O: 6,
      S: 1,
    })
  })

  it('gives a single residue its free formula', () => {
    for (const code of AMINO_ACID_CODES) {
      expect(molecularFormula([residue(code)]), code).toEqual(freeAminoAcidFormula(code))
    }
  })

  it('accounts for every heavy atom the structure places, plus the terminal OXT', () => {
    // The strongest cross-check available: the formula and the builder are
    // independent code paths over the same chemistry, and they must agree.
    for (const residues of [
      chain('GLY'),
      chain('ALA', 'GLY'),
      chain(...AMINO_ACID_CODES),
      chain('TRP', 'TRP', 'PRO', 'CYS'),
    ]) {
      const formula = molecularFormula(residues)
      const heavy = formula.C + formula.N + formula.O + formula.S
      expect(heavy).toBe(buildAtoms(residues).length + unmodelledHeavyAtoms(residues))
    }
  })

  it('is empty for a blank canvas', () => {
    expect(molecularFormula([])).toEqual({ C: 0, H: 0, N: 0, O: 0, S: 0 })
    expect(unmodelledHeavyAtoms([])).toBe(0)
  })
})

describe('formatFormula', () => {
  it('writes Hill order with subscript digits', () => {
    expect(formatFormula({ C: 4, H: 8, N: 2, O: 3, S: 0 })).toBe('C₄H₈N₂O₃')
  })

  it('omits absent elements and the subscript 1', () => {
    expect(formatFormula({ C: 1, H: 4, N: 0, O: 0, S: 0 })).toBe('CH₄')
    expect(formatFormula({ C: 2, H: 5, N: 1, O: 2, S: 0 })).toBe('C₂H₅NO₂')
  })

  it('includes sulfur last', () => {
    expect(formatFormula({ C: 3, H: 7, N: 1, O: 2, S: 1 })).toBe('C₃H₇NO₂S')
  })

  it('handles multi-digit counts', () => {
    expect(formatFormula({ C: 123, H: 45, N: 0, O: 0, S: 0 })).toBe('C₁₂₃H₄₅')
  })

  it('is empty for an empty formula', () => {
    expect(formatFormula({ C: 0, H: 0, N: 0, O: 0, S: 0 })).toBe('')
  })
})
