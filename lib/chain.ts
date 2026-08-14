/**
 * Chain builder: Residue[] (angles) -> ResidueAtoms[] (Cartesian).
 *
 * Pure and framework-free, like lib/nerf.ts. This module only sequences NeRF
 * placements; all the geometry lives in placeAtom.
 *
 * Three properties shape the API:
 *
 *  1. Residue i's position depends on every residue before it, so an edit at
 *     index i invalidates exactly the suffix from i onward. `rebuildChainFrom`
 *     does that recompute, reusing the untouched prefix *by reference*.
 *
 *  2. Residue 1 has no preceding atoms for NeRF to extend from, so it is seeded
 *     from a fixed canonical frame rather than derived from angles.
 *
 *  3. **Residues contribute different numbers of atoms.** A glycine backbone
 *     contributes four; a tryptophan with its side chain contributes fourteen. So
 *     the output is grouped per residue rather than being a flat array with a
 *     fixed stride. This is not only about side chains: grouping makes the suffix
 *     reuse in (1) a `slice`, with no index arithmetic that could be off by one,
 *     which turns an invariant that used to be *computed* into one that is
 *     *structural*.
 *
 * Everything is built in the canonical frame. Repositioning the structure is a
 * rigid transform applied afterwards (lib/transform.ts) and never enters this file.
 */

import { BOND_ANGLE, BOND_LENGTH, PSI_TO_O_DIHEDRAL_OFFSET } from './constants.ts'
import { add, degToRad, placeAtom, scale, vec3, type Vec3 } from './nerf.ts'
import type { Atom, BackboneAtomName, Element, Residue } from './types.ts'

/** N, CA, C, O — the backbone atoms every residue contributes, before side chains. */
export const BACKBONE_ATOM_COUNT = 4

/**
 * One residue's placed atoms.
 *
 * Backbone first, in placement order (N, CA, C, O), with side-chain atoms after it
 * in template order once those exist.
 */
export interface ResidueAtoms {
  readonly residueIndex: number
  readonly residueId: string
  readonly atoms: readonly Atom[]
}

const ELEMENT_OF: Record<BackboneAtomName, Element> = { N: 'N', CA: 'C', C: 'C', O: 'O' }

/**
 * The three main-chain atoms of the preceding residue, plus the angles of that
 * residue that reach across the peptide bond. This is the complete state needed
 * to continue the chain — which is what makes suffix-only recomputation possible.
 */
export interface ChainTip {
  readonly n: Vec3
  readonly ca: Vec3
  readonly c: Vec3
  /** ψ of the residue this tip belongs to; places the next residue's N. */
  readonly psi: number
  /** ω of the residue this tip belongs to; places the next residue's CA. */
  readonly omega: number
}

/**
 * The canonical seed frame for residue 1: N at the origin, CA along +x, C in
 * the xy-plane at the ideal N-CA-C angle.
 *
 * Arbitrary but fixed — any choice is equally valid because the whole structure
 * is repositioned by a rigid transform later, and NeRF geometry is invariant
 * under one.
 */
export function canonicalSeedFrame(): readonly [Vec3, Vec3, Vec3] {
  const n = vec3(0, 0, 0)
  const ca = vec3(BOND_LENGTH.N_CA, 0, 0)
  const tau = degToRad(BOND_ANGLE.N_CA_C)
  const c = add(ca, scale(vec3(-Math.cos(tau), Math.sin(tau), 0), BOND_LENGTH.CA_C))
  return [n, ca, c]
}

function toAtoms(
  positions: readonly [Vec3, Vec3, Vec3, Vec3],
  residue: Residue,
  residueIndex: number,
): Atom[] {
  const names: readonly BackboneAtomName[] = ['N', 'CA', 'C', 'O']
  return names.map((name, i) => ({
    name,
    element: ELEMENT_OF[name],
    position: positions[i]!,
    residueIndex,
    residueId: residue.id,
    aminoAcid: residue.aminoAcid,
  }))
}

/**
 * Place the carbonyl O of a residue. It has no independent degree of freedom:
 * it sits anti to the next residue's N across the CA–C bond, i.e. at ψ + 180°.
 */
function placeCarbonylOxygen(n: Vec3, ca: Vec3, c: Vec3, psi: number): Vec3 {
  return placeAtom(n, ca, c, BOND_LENGTH.C_O, BOND_ANGLE.CA_C_O, psi + PSI_TO_O_DIHEDRAL_OFFSET)
}

/**
 * Build the first residue from the canonical seed frame.
 *
 * Its φ is ignored — there is no preceding C to rotate about, so the angle has
 * no geometric meaning here. Its ψ still orients the carbonyl O.
 */
export function seedFirstResidue(residue: Residue): Atom[] {
  const [n, ca, c] = canonicalSeedFrame()
  return toAtoms([n, ca, c, placeCarbonylOxygen(n, ca, c, residue.psi)], residue, 0)
}

/**
 * Extend the chain by one residue.
 *
 * Three NeRF placements, each driven by exactly one dihedral:
 *   N(i)  <- ψ(i-1), rotating about the CA(i-1)–C(i-1) bond
 *   CA(i) <- ω(i-1), rotating about the peptide bond C(i-1)–N(i)
 *   C(i)  <- φ(i),   rotating about the N(i)–CA(i) bond
 * ...then O(i), which follows from ψ(i).
 */
export function extendChain(tip: ChainTip, residue: Residue, residueIndex: number): Atom[] {
  const n = placeAtom(tip.n, tip.ca, tip.c, BOND_LENGTH.C_N, BOND_ANGLE.CA_C_N, tip.psi)
  const ca = placeAtom(tip.ca, tip.c, n, BOND_LENGTH.N_CA, BOND_ANGLE.C_N_CA, tip.omega)
  const c = placeAtom(tip.c, n, ca, BOND_LENGTH.CA_C, BOND_ANGLE.N_CA_C, residue.phi)
  return toAtoms([n, ca, c, placeCarbonylOxygen(n, ca, c, residue.psi)], residue, residueIndex)
}

/**
 * Read the chain tip back off a residue's placed atoms.
 *
 * Looks the three main-chain atoms up **by name** rather than by position, so it
 * keeps working when a residue's atom list also contains side-chain atoms.
 */
export function tipFromAtoms(atoms: readonly Atom[], residue: Residue): ChainTip {
  const n = atoms.find((atom) => atom.name === 'N')
  const ca = atoms.find((atom) => atom.name === 'CA')
  const c = atoms.find((atom) => atom.name === 'C')
  if (!n || !ca || !c) {
    throw new Error('A chain tip needs the N, CA and C atoms of the preceding residue.')
  }
  return { n: n.position, ca: ca.position, c: c.position, psi: residue.psi, omega: residue.omega }
}

/**
 * Build the whole chain from scratch, grouped by residue.
 *
 * An empty residue list yields an empty result — the blank-canvas initial state,
 * not an error.
 */
export function buildChain(residues: readonly Residue[]): ResidueAtoms[] {
  return rebuildChainFrom([], residues, 0)
}

/**
 * Recompute the chain from `fromIndex` onward, reusing the residues before it.
 *
 * This is the update path for every edit: changing, inserting, deleting or
 * reordering a residue at index i invalidates residue i and everything after it,
 * and nothing before it. Groups in the reused prefix are returned **by reference**,
 * unchanged, so downstream memoisation and React reconciliation can rely on
 * identity to skip work.
 *
 * The reuse is a `slice` of whole residues, with no atom-index arithmetic. That is
 * deliberate: the old flat version multiplied `fromIndex` by a fixed atoms-per-
 * residue, which was both a place to be off by one and an assumption that stopped
 * being true the moment residues could differ in size.
 *
 * @param previous  groups from the last build; only the first `fromIndex` are read
 * @param residues  the current (already-edited) residue list
 * @param fromIndex first residue index whose geometry may have changed
 */
export function rebuildChainFrom(
  previous: readonly ResidueAtoms[],
  residues: readonly Residue[],
  fromIndex: number,
): ResidueAtoms[] {
  if (fromIndex < 0) {
    throw new Error(`fromIndex must be non-negative, got ${fromIndex}.`)
  }

  const start = Math.min(fromIndex, previous.length, residues.length)
  const groups: ResidueAtoms[] = previous.slice(0, start)

  for (let i = start; i < residues.length; i++) {
    const residue = residues[i]!
    const atoms =
      i === 0
        ? seedFirstResidue(residue)
        : extendChain(tipFromAtoms(groups[i - 1]!.atoms, residues[i - 1]!), residue, i)
    groups.push({ residueIndex: i, residueId: residue.id, atoms })
  }

  return groups
}

/** Flatten grouped residues into the single ordered atom list renderers want. */
export function flattenAtoms(groups: readonly ResidueAtoms[]): Atom[] {
  const atoms: Atom[] = []
  for (const group of groups) atoms.push(...group.atoms)
  return atoms
}

/**
 * The flat index at which each residue's atoms begin.
 *
 * The replacement for `residueIndex * ATOMS_PER_RESIDUE`, for callers that need to
 * address a residue's atoms inside the flattened list. Has one more entry than
 * there are residues: the last is the total atom count.
 */
export function atomOffsets(groups: readonly ResidueAtoms[]): number[] {
  const offsets = [0]
  for (const group of groups) offsets.push(offsets[offsets.length - 1]! + group.atoms.length)
  return offsets
}

/** Build a chain and flatten it in one step. */
export function buildAtoms(residues: readonly Residue[]): Atom[] {
  return flattenAtoms(buildChain(residues))
}

/**
 * The lowest residue index whose geometry can differ between two residue lists.
 *
 * Callers that don't track which edit happened can derive `fromIndex` from the
 * old and new lists directly. Comparison is by value on the fields that affect
 * geometry plus `id`, so a reorder is correctly detected at the first moved
 * position. Returns `residues.length` when nothing geometric changed.
 */
export function firstChangedIndex(
  previous: readonly Residue[],
  next: readonly Residue[],
): number {
  const shared = Math.min(previous.length, next.length)
  for (let i = 0; i < shared; i++) {
    const a = previous[i]!
    const b = next[i]!
    if (a.id !== b.id || a.phi !== b.phi || a.psi !== b.psi || a.omega !== b.omega) {
      return i
    }
    // A residue's identity doesn't move its backbone atoms, but the atoms carry
    // it, so a substitution still has to re-emit them.
    if (a.aminoAcid !== b.aminoAcid) return i
  }
  // Truncation invalidates nothing that remains; extension starts at the join,
  // where the new residue depends on the previous one's ψ/ω.
  return next.length > previous.length ? shared : Math.min(shared, next.length)
}
