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

import { SIDE_CHAIN_TOPOLOGY } from './sidechainTopology.ts'
import type { AminoAcidCode, Atom } from './types.ts'

/**
 * `BACKBONE` bonds form the continuous main chain (N–CA, CA–C, and the peptide
 * C–N); `CARBONYL` is the C=O branch hanging off it; `SIDECHAIN` is everything
 * beyond Cα. Separated so the renderer can style the main chain differently from
 * its substituents — a side chain drawn identically to the backbone makes the
 * chain's path much harder to follow.
 */
export type BondKind = 'BACKBONE' | 'CARBONYL' | 'SIDECHAIN'

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

    bonds.push(...sideChainBondsOf(residue, atoms))
  })

  return bonds
}

/**
 * One residue's side-chain bonds, including ring closures.
 *
 * The amino acid is read off the atoms rather than passed in, so this stays a
 * function of the atom list alone — the same property that lets the whole module
 * take flat `Atom[]` and nothing else.
 *
 * Ring closures are emitted here too. They are not placement relationships: both
 * atoms are already positioned by the time the ring closes, and with ideal
 * geometry the closing bond will not be exactly the right length. Drawing it
 * anyway is the point — the gap is a true consequence of ideal-geometry
 * reconstruction and should be visible rather than hidden by omitting the bond.
 */
function sideChainBondsOf(residue: ResidueIndexMap, atoms: readonly Atom[]): Bond[] {
  const anyAtom = [...residue.byName.values()][0]
  const aminoAcid = anyAtom === undefined ? undefined : atoms[anyAtom]?.aminoAcid
  const topology = aminoAcid ? SIDE_CHAIN_TOPOLOGY[aminoAcid as AminoAcidCode] : undefined
  if (!topology) return []

  const bonds: Bond[] = []
  const pairs: readonly (readonly [string, string])[] = [
    ...topology.atoms.map((atom) => [atom.bondedTo, atom.name] as const),
    ...topology.ringClosures,
  ]

  for (const [fromName, toName] of pairs) {
    const from = residue.byName.get(fromName)
    const to = residue.byName.get(toName)
    if (from !== undefined && to !== undefined) bonds.push({ a: from, b: to, kind: 'SIDECHAIN' })
  }

  return bonds
}
