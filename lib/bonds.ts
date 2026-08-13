/**
 * Backbone bond topology: Atom[] -> Bond[].
 *
 * Pure and framework-free. This is *derived* data in exactly the same sense as
 * atom positions — it is recomputed from the atom list, never stored.
 *
 * Which atoms are bonded follows from the covalent structure of a polypeptide,
 * not from measured distances. Deliberately no distance cutoff: a bond exists
 * because the chain says so, and a reconstruction that drives two bonded atoms
 * far apart should look wrong on screen rather than silently lose its bond. That
 * is the same reason nothing here inspects geometry at all.
 */

import { ATOMS_PER_RESIDUE } from './chain.ts'
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
 * Every covalent bond in a backbone atom list.
 *
 * Assumes the layout the chain builder produces: N, CA, C, O per residue, in
 * chain order, with residue i+1 covalently continuing residue i. An empty or
 * single-atom list yields no bonds.
 */
export function backboneBonds(atoms: readonly Atom[]): Bond[] {
  const residueCount = Math.floor(atoms.length / ATOMS_PER_RESIDUE)
  const bonds: Bond[] = []

  for (let i = 0; i < residueCount; i++) {
    const n = i * ATOMS_PER_RESIDUE
    const ca = n + 1
    const c = n + 2
    const o = n + 3

    bonds.push({ a: n, b: ca, kind: 'BACKBONE' })
    bonds.push({ a: ca, b: c, kind: 'BACKBONE' })
    bonds.push({ a: c, b: o, kind: 'CARBONYL' })

    // The peptide bond into the next residue, if there is one.
    if (i + 1 < residueCount) {
      bonds.push({ a: c, b: (i + 1) * ATOMS_PER_RESIDUE, kind: 'BACKBONE' })
    }
  }

  return bonds
}
