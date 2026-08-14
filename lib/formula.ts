/**
 * The empirical molecular formula of a chain.
 *
 * Pure, and derived data like everything else here — recomputed from the residue
 * list, never stored.
 *
 * **Hydrogens are computed, not measured.** This project places heavy atoms only;
 * there is no H anywhere in the structure. So the H count comes from the chemistry
 * of the residues rather than from anything on screen, and the formula is a
 * statement about the molecule the angles describe rather than a tally of drawn
 * atoms. Worth being explicit about, because it is the one number in the app that
 * is not derived from a coordinate.
 *
 * A peptide is its residues condensed: each bond formed loses one water, so
 *
 *     formula = Σ (free amino acid) − (n − 1) H₂O
 *
 * which is the standard way to compute it and needs only the 20 free-amino-acid
 * formulas. Of those, **only the hydrogen counts are hand-written** — C, N, O and S
 * are counted from the bond graph in lib/sidechainTopology.ts, so the two sources
 * cross-check each other and `tests/formula.test.ts` asserts they agree.
 */

import { elementOf } from './sidechains.ts'
import { SIDE_CHAIN_TOPOLOGY } from './sidechainTopology.ts'
import type { AminoAcidCode, Element, Residue } from './types.ts'

/**
 * Hydrogens on each *free* amino acid — the hand-written part.
 *
 * Standard values: glycine is C₂H₅NO₂, tryptophan C₁₁H₁₂N₂O₂, arginine C₆H₁₄N₄O₂.
 * Includes the two that condensation removes, since the formula above subtracts
 * them per bond.
 */
const FREE_HYDROGEN_COUNT: Record<AminoAcidCode, number> = {
  GLY: 5,
  ALA: 7,
  SER: 7,
  CYS: 7,
  THR: 9,
  VAL: 11,
  LEU: 13,
  ILE: 13,
  PRO: 9,
  MET: 11,
  PHE: 11,
  TYR: 11,
  TRP: 12,
  HIS: 9,
  ASP: 7,
  ASN: 8,
  GLU: 9,
  GLN: 10,
  LYS: 14,
  ARG: 14,
}

/** Element counts. Hill order for display: C, H, then the rest alphabetically. */
export interface MolecularFormula {
  readonly C: number
  readonly H: number
  readonly N: number
  readonly O: number
  readonly S: number
}

const EMPTY_FORMULA: MolecularFormula = { C: 0, H: 0, N: 0, O: 0, S: 0 }

/**
 * Heavy atoms of one *free* amino acid, counted from the bond graph.
 *
 * Backbone contributes 2 C (Cα and the carboxyl C), 1 N, and 2 O — the free form's
 * carboxylic acid has two oxygens, one of which each peptide bond removes.
 */
export function freeAminoAcidFormula(aminoAcid: AminoAcidCode): MolecularFormula {
  const counts = { C: 2, H: FREE_HYDROGEN_COUNT[aminoAcid], N: 1, O: 2, S: 0 }
  for (const atom of SIDE_CHAIN_TOPOLOGY[aminoAcid].atoms) {
    counts[elementOf(atom.name)] += 1
  }
  return counts
}

/**
 * The formula of the whole chain.
 *
 * An empty chain has an empty formula rather than being an error — the blank
 * canvas is a valid state.
 */
export function molecularFormula(residues: readonly Residue[]): MolecularFormula {
  if (residues.length === 0) return EMPTY_FORMULA

  const total = { ...EMPTY_FORMULA }
  for (const residue of residues) {
    const free = freeAminoAcidFormula(residue.aminoAcid)
    total.C += free.C
    total.H += free.H
    total.N += free.N
    total.O += free.O
    total.S += free.S
  }

  // One water lost per peptide bond, and there are n − 1 of them.
  const bonds = residues.length - 1
  total.H -= 2 * bonds
  total.O -= bonds

  return total
}

/** Subscript digits, so the formula reads as chemistry rather than as code. */
const SUBSCRIPTS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'] as const

function subscript(value: number): string {
  if (value <= 1) return ''
  return String(value)
    .split('')
    .map((digit) => SUBSCRIPTS[Number(digit)] ?? digit)
    .join('')
}

/**
 * `'C₁₇H₂₈N₄O₆'` — Hill order, omitting absent elements and the subscript 1.
 *
 * Hill order is carbon, then hydrogen, then everything else alphabetically, which
 * for this element set means N, O, S.
 */
export function formatFormula(formula: MolecularFormula): string {
  const order: readonly Element[] = ['C', 'N', 'O', 'S']
  const parts: string[] = []
  if (formula.C > 0) parts.push(`C${subscript(formula.C)}`)
  if (formula.H > 0) parts.push(`H${subscript(formula.H)}`)
  for (const element of order) {
    if (element === 'C') continue
    const count = formula[element]
    if (count > 0) parts.push(`${element}${subscript(count)}`)
  }
  return parts.join('')
}

/**
 * Heavy atoms the formula accounts for that the structure does not place.
 *
 * Exactly one: the second oxygen of the C-terminal carboxylate (`OXT`). The chain
 * builder gives every residue a single carbonyl O, which is right for a residue in
 * the middle of a chain and one short at the end. Stated as a named function
 * because the difference would otherwise look like an off-by-one in the tests.
 */
export function unmodelledHeavyAtoms(residues: readonly Residue[]): number {
  return residues.length === 0 ? 0 : 1
}
