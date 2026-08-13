/**
 * Core data model.
 *
 * The invariant that governs everything here (see claude.md): per-residue
 * dihedral angles are the source of truth. `Atom` positions are DERIVED — they
 * are produced by the chain builder on demand and are never independently
 * editable state.
 */

import type { Vec3 } from './nerf.ts'

/** The 20 standard amino acids, PDB three-letter codes. */
export type AminoAcidCode =
  | 'ALA' | 'ARG' | 'ASN' | 'ASP' | 'CYS'
  | 'GLN' | 'GLU' | 'GLY' | 'HIS' | 'ILE'
  | 'LEU' | 'LYS' | 'MET' | 'PHE' | 'PRO'
  | 'SER' | 'THR' | 'TRP' | 'TYR' | 'VAL'

export const AMINO_ACID_CODES: readonly AminoAcidCode[] = [
  'ALA', 'ARG', 'ASN', 'ASP', 'CYS',
  'GLN', 'GLU', 'GLY', 'HIS', 'ILE',
  'LEU', 'LYS', 'MET', 'PHE', 'PRO',
  'SER', 'THR', 'TRP', 'TYR', 'VAL',
]

/**
 * One residue's editable state — the source of truth.
 *
 * All three angles are always present, but note what they can and cannot
 * affect. φ of the first residue has no geometric effect: φ is the
 * C(i-1)-N(i)-CA(i)-C(i) dihedral, and residue 1 has no preceding C, so its
 * N/CA/C come from the canonical seed frame instead. Likewise ψ and ω of the
 * last residue only orient its own carbonyl O — there is no next residue for
 * them to place. Both are kept in state anyway so that adding a residue at
 * either end doesn't lose a value the user already typed.
 */
export interface Residue {
  /** Stable identity, so React keys and selection survive reordering. */
  readonly id: string
  readonly aminoAcid: AminoAcidCode
  /** C(i-1)-N(i)-CA(i)-C(i), degrees. */
  readonly phi: number
  /** N(i)-CA(i)-C(i)-N(i+1), degrees. */
  readonly psi: number
  /** CA(i)-C(i)-N(i+1)-CA(i+1), degrees. ~180 (trans), or ~0 for cis-proline. */
  readonly omega: number
}

/** Backbone atoms, in the order the builder places them within a residue. */
export type BackboneAtomName = 'N' | 'CA' | 'C' | 'O'

export type Element = 'N' | 'C' | 'O'

/**
 * A computed atom position. Derived output only — never stored as editable
 * state, never round-tripped back into a Residue.
 */
export interface Atom {
  readonly name: BackboneAtomName
  readonly element: Element
  readonly position: Vec3
  /** Index into the Residue[] this atom came from. */
  readonly residueIndex: number
  /** The `id` of that residue, stable across reordering. */
  readonly residueId: string
  readonly aminoAcid: AminoAcidCode
}
