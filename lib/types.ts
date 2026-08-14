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
  /**
   * Side-chain dihedrals χ1…, degrees, in order outward from Cβ.
   *
   * Length is the amino acid's `CHI_COUNT` — zero for glycine and alanine, four
   * for lysine and arginine. Changing `aminoAcid` resizes this (see
   * `lib/edits.ts`), which is what makes the atom count change when you pick a
   * different residue.
   *
   * Same status as φ/ψ/ω: source of truth, never derived from coordinates. A
   * missing or short array falls back to `DEFAULT_CHI`, so a residue built by hand
   * without χ values still places a complete side chain.
   */
  readonly chi: readonly number[]
}

/** Backbone atoms, in the order the builder places them within a residue. */
export type BackboneAtomName = 'N' | 'CA' | 'C' | 'O'

/**
 * Any heavy-atom name the builder can emit: the four backbone names, or a PDB
 * side-chain name such as `'CB'`, `'CG1'` or `'NE2'`.
 *
 * A string rather than a union of all ~170 possibilities. The authoritative list
 * is the bond graph in lib/sidechainTopology.ts, and duplicating it in the type
 * system would mean two places to keep in step for no checking that matters — the
 * names are data, and they are validated against real PDB atoms by the tests.
 */
export type AtomName = BackboneAtomName | string

/**
 * Heavy-atom elements in the 20 standard amino acids.
 *
 * Sulfur appears only in cysteine (Sγ) and methionine (Sδ). Hydrogens are not
 * modelled: this reconstruction places heavy atoms, and the 2D depiction shows
 * hydrogen counts implied by the residue rather than measured.
 */
export type Element = 'N' | 'C' | 'O' | 'S'

/**
 * A computed atom position. Derived output only — never stored as editable
 * state, never round-tripped back into a Residue.
 */
export interface Atom {
  readonly name: AtomName
  readonly element: Element
  readonly position: Vec3
  /** Index into the Residue[] this atom came from. */
  readonly residueIndex: number
  /** The `id` of that residue, stable across reordering. */
  readonly residueId: string
  readonly aminoAcid: AminoAcidCode
}
