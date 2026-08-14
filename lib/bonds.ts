/**
 * Bond topology: Atom[] -> Bond[].
 *
 * Pure and framework-free. This is *derived* data in exactly the same sense as
 * atom positions — it is recomputed from the atom list, never stored.
 *
 * Which atoms are bonded follows from the covalent structure of a polypeptide,
 * not from measured distances. Deliberately no distance cutoff: a bond exists
 * because the chain says so, and a reconstruction that drives two bonded atoms
 * far apart should look wrong on screen rather than silently lose its bond. That
 * is the same reason nothing here inspects geometry at all.
 *
 * Residues are found by reading `Atom.residueIndex` and atoms within a residue by
 * name, rather than by a fixed stride. Atom counts per residue vary — a glycine
 * contributes four atoms and a tryptophan fourteen — so any arithmetic of the form
 * `i * atomsPerResidue` would be wrong for every chain that isn't pure glycine.
 */

import type { Atom } from './types.ts'

/**
 * `BACKBONE` bonds form the continuous main chain (N–CA, CA–C, and the peptide
 * C–N); `CARBONYL` is the C=O branch hanging off it. Separated so the renderer
 * can style the main chain differently from its substituents.
 */
export type BondKind = 'BACKBONE' | 'CARBONYL'

/** A bond, as a pair of indices into the atom list it was derived from. */
export interface Bond {
  /** Index into the source `Atom[]`. */
  readonly a: number
  /** Index into the source `Atom[]`. */
  readonly b: number
  readonly kind: BondKind
}

/**
 * One residue's atoms, as flat indices keyed by atom name.
 *
 * Built by a single pass over the atom list, which is in chain order with each
 * residue's atoms contiguous.
 */
export interface ResidueIndexMap {
  readonly residueIndex: number
  readonly byName: ReadonlyMap<string, number>
}

/** Group a flat atom list by residue, preserving chain order. */
export function indexByResidue(atoms: readonly Atom[]): ResidueIndexMap[] {
  const groups: { residueIndex: number; byName: Map<string, number> }[] = []
  let current: { residueIndex: number; byName: Map<string, number> } | null = null

  atoms.forEach((atom, index) => {
    if (!current || current.residueIndex !== atom.residueIndex) {
      current = { residueIndex: atom.residueIndex, byName: new Map() }
      groups.push(current)
    }
    current.byName.set(atom.name, index)
  })

  return groups
}

/**
 * Every covalent bond in a backbone atom list.
 *
 * An empty or single-atom list yields no bonds. A residue missing an expected atom
 * simply contributes fewer bonds rather than throwing — this is a renderer input,
 * and a partially drawn residue is more useful than a blank screen.
 */
export function backboneBonds(atoms: readonly Atom[]): Bond[] {
  const residues = indexByResidue(atoms)
  const bonds: Bond[] = []

  residues.forEach((residue, i) => {
    const n = residue.byName.get('N')
    const ca = residue.byName.get('CA')
    const c = residue.byName.get('C')
    const o = residue.byName.get('O')

    if (n !== undefined && ca !== undefined) bonds.push({ a: n, b: ca, kind: 'BACKBONE' })
    if (ca !== undefined && c !== undefined) bonds.push({ a: ca, b: c, kind: 'BACKBONE' })
    if (c !== undefined && o !== undefined) bonds.push({ a: c, b: o, kind: 'CARBONYL' })

    // The peptide bond into the next residue, if there is one.
    const next = residues[i + 1]
    const nextN = next?.byName.get('N')
    if (c !== undefined && nextN !== undefined) {
      bonds.push({ a: c, b: nextN, kind: 'BACKBONE' })
    }
  })

  return bonds
}
