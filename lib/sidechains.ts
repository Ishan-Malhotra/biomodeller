/**
 * Side-chain placement: turning the bond graph into NeRF instructions.
 *
 * Pure and framework-free. This module derives, for each side-chain atom, the
 * three already-placed atoms NeRF extends from and which dihedral drives it. It
 * derives them rather than storing them, from the hand-written bond graph in
 * lib/sidechainTopology.ts — see the note there on why.
 *
 * The rule is uniform. NeRF places D from (a, b, c) where c is bonded to D, so
 * walking two bonds back from the parent gives the triple:
 *
 *     refs(X) = (parent(parent(P)), parent(P), P)   where P is X's bonded parent
 *
 * with the parent chain continuing into the backbone as Cβ → Cα → N. The one atom
 * that can't use this is Cβ itself, which would need an atom before N: it is
 * placed from (N, C, Cα) instead, an improper dihedral about Cα's three other
 * substituents. Everything else falls out of the graph.
 *
 * Which dihedral drives an atom then follows from whether it is a χ's fourth atom:
 *
 *   - it is                → that χ, straight from the residue's state
 *   - a sibling of one     → that χ plus a fixed offset (±120° at a tetrahedral
 *                            centre, 180° at a planar one)
 *   - neither              → a fixed value (ring continuations, all 0° or 180°)
 *
 * Every numeric value comes from lib/constants.ts. The offsets and fixed values
 * were read off the 0.95 Å 4LZT structure rather than assumed, and
 * tests/sidechains.test.ts holds them to that measurement.
 */

import {
  CB_IMPROPER_DIHEDRAL,
  PLANAR_CIS,
  PLANAR_TRANS,
  SIDE_CHAIN_GEOMETRY,
  TETRAHEDRAL_BRANCH_OFFSET,
} from './constants.ts'
import { SIDE_CHAIN_TOPOLOGY } from './sidechainTopology.ts'
import type { AminoAcidCode, Element } from './types.ts'

/** How a side-chain atom's dihedral is determined. */
export type DihedralSource =
  /** The residue's χ at this 1-based index. */
  | { readonly kind: 'chi'; readonly index: number }
  /** That χ, plus a fixed offset — a second branch off the same centre. */
  | { readonly kind: 'offset'; readonly index: number; readonly degrees: number }
  /** A constant: ring continuations, which have no rotational freedom. */
  | { readonly kind: 'fixed'; readonly degrees: number }

/** Everything needed to place one side-chain atom by NeRF. */
export interface SideChainPlacement {
  readonly name: string
  readonly element: Element
  /** The three prior atoms, in NeRF (a, b, c) order; `c` is bonded to this atom. */
  readonly refs: readonly [string, string, string]
  /** Å, from `c` to this atom. */
  readonly length: number
  /** Degrees, the b–c–this angle. */
  readonly angle: number
  readonly dihedral: DihedralSource
}

/**
 * The element of a PDB heavy-atom name.
 *
 * The first character, which is unambiguous for every heavy atom in the 20
 * standard residues — there is no two-letter element among them.
 */
export function elementOf(atomName: string): Element {
  const first = atomName[0]
  if (first === 'C' || first === 'N' || first === 'O' || first === 'S') return first
  throw new Error(`Cannot infer element from atom name "${atomName}".`)
}

/** Cached, because this is derived on every chain rebuild and the input is fixed. */
const cache = new Map<AminoAcidCode, readonly SideChainPlacement[]>()

/**
 * The ordered placement instructions for one amino acid's side chain.
 *
 * Empty for glycine. Order is outward from Cβ, so every atom's references are
 * already placed by the time it is reached.
 */
export function sideChainPlacements(aminoAcid: AminoAcidCode): readonly SideChainPlacement[] {
  const cached = cache.get(aminoAcid)
  if (cached) return cached

  const topology = SIDE_CHAIN_TOPOLOGY[aminoAcid]
  // Glycine has no entry, and correctly needs none — it has no side chain, so the
  // loop below never runs and never reaches for geometry.
  const geometry = SIDE_CHAIN_GEOMETRY[aminoAcid] ?? {}

  /** The atom one bond nearer Cα, continuing into the backbone at Cβ. */
  const parentOf = (name: string): string | null => {
    if (name === 'CB') return 'CA'
    if (name === 'CA') return 'N'
    return topology.atoms.find((atom) => atom.name === name)?.bondedTo ?? null
  }

  /** χ index (1-based) whose fourth atom is `name`, or 0. */
  const chiEndingAt = (name: string): number => {
    const index = topology.chi.findIndex((quad) => quad[3] === name)
    return index + 1
  }

  const placements: SideChainPlacement[] = []

  for (const atom of topology.atoms) {
    const refs = referencesFor(atom.name, atom.bondedTo, parentOf)
    const measurements = geometry[atom.name]
    if (!measurements) {
      throw new Error(`No geometry for ${aminoAcid} ${atom.name} in SIDE_CHAIN_GEOMETRY.`)
    }

    placements.push({
      name: atom.name,
      element: elementOf(atom.name),
      refs,
      length: measurements.length,
      angle: measurements.angle,
      dihedral: dihedralSourceFor(atom.name, refs, topology, chiEndingAt, measurements.dihedral),
    })
  }

  cache.set(aminoAcid, placements)
  return placements
}

function referencesFor(
  name: string,
  bondedTo: string,
  parentOf: (name: string) => string | null,
): readonly [string, string, string] {
  // Cβ has no atom two bonds back along the chain — the walk would run off the end
  // of the backbone at N. It gets Cα's other two substituents instead, making this
  // an improper dihedral rather than a torsion about a bond.
  if (name === 'CB') return ['N', 'C', 'CA']

  const grandparent = parentOf(bondedTo)
  const greatGrandparent = grandparent ? parentOf(grandparent) : null
  if (!grandparent || !greatGrandparent) {
    throw new Error(`Cannot derive reference atoms for ${name}: the bond graph is too shallow.`)
  }
  return [greatGrandparent, grandparent, bondedTo]
}

function dihedralSourceFor(
  name: string,
  refs: readonly [string, string, string],
  topology: (typeof SIDE_CHAIN_TOPOLOGY)[AminoAcidCode],
  chiEndingAt: (name: string) => number,
  fixedDegrees: number | undefined,
): DihedralSource {
  const own = chiEndingAt(name)
  if (own > 0) return { kind: 'chi', index: own }

  // A sibling sharing all three reference atoms is a second substituent on the
  // same centre. If that sibling is χ-driven, this atom follows it at a fixed
  // offset — which is what keeps the two branches rigid relative to each other as
  // the χ turns.
  const sibling = topology.atoms.find(
    (candidate) => candidate.name !== name && candidate.bondedTo === refs[2] && chiEndingAt(candidate.name) > 0,
  )
  if (sibling) {
    const index = chiEndingAt(sibling.name)
    if (fixedDegrees === undefined) {
      throw new Error(`${name} is a branch off a χ atom but has no offset in SIDE_CHAIN_GEOMETRY.`)
    }
    return { kind: 'offset', index, degrees: fixedDegrees }
  }

  if (fixedDegrees === undefined) {
    throw new Error(`${name} has no χ, no χ-driven sibling and no fixed dihedral.`)
  }
  return { kind: 'fixed', degrees: fixedDegrees }
}

/** Re-exported so callers need only one import for the whole side-chain model. */
export {
  CHI_COUNT,
  heavyAtomCount,
  SIDE_CHAIN_TOPOLOGY,
  type SideChainTopology,
} from './sidechainTopology.ts'

export { CB_IMPROPER_DIHEDRAL, PLANAR_CIS, PLANAR_TRANS, TETRAHEDRAL_BRANCH_OFFSET }
