/**
 * Side-chain covalent topology for the 20 standard amino acids.
 *
 * Hand-written data, kept as small and checkable as possible: for each residue,
 * the heavy atoms in order outward from Cα, each naming the single already-listed
 * atom it is bonded to, plus any ring-closing bonds and the χ definitions.
 *
 * **Only the bond graph is written by hand.** Placement reference triples — which
 * three prior atoms NeRF extends from — are *derived* from this graph by
 * `lib/sidechains.ts`, not listed. Writing out ~100 triples by hand would be a
 * hundred chances to transpose two atom names, and a transposed triple produces a
 * plausible-looking structure rather than an obvious error. Deriving them means
 * this table is the only thing that can be wrong, and `tests/sidechains.test.ts`
 * checks it against deposited coordinates for all 20 residues.
 *
 * Atom names are PDB v3 conventions. Elements are implied by the first character,
 * which holds for every heavy atom in the standard set (C, N, O, S).
 */

import type { AminoAcidCode } from './types.ts'

/** One side-chain heavy atom and the atom nearer Cα that it is bonded to. */
export interface SideChainAtom {
  readonly name: string
  /** The atom this one hangs off. `'CA'` for Cβ; otherwise a side-chain atom. */
  readonly bondedTo: string
}

export interface SideChainTopology {
  /** Outward from Cβ. Every entry's `bondedTo` must appear earlier, or be `'CA'`. */
  readonly atoms: readonly SideChainAtom[]
  /**
   * Bonds that close a ring, as name pairs.
   *
   * These are *not* placement relationships — both atoms are already placed by the
   * time the ring closes. They exist so the renderer draws the ring and so the
   * 2D depiction knows the topology is cyclic. Proline's closure reaches back to
   * the backbone `N`.
   */
  readonly ringClosures: readonly (readonly [string, string])[]
  /**
   * χ angles, each as the four atoms whose dihedral it is (IUPAC definition).
   * χ1 first. Length is the number of rotatable heavy-atom dihedrals.
   */
  readonly chi: readonly (readonly [string, string, string, string])[]
}

const NO_SIDE_CHAIN: SideChainTopology = { atoms: [], ringClosures: [], chi: [] }

/** Cβ, which every residue except glycine has, and which carries no χ of its own. */
const CB: SideChainAtom = { name: 'CB', bondedTo: 'CA' }

export const SIDE_CHAIN_TOPOLOGY: Record<AminoAcidCode, SideChainTopology> = {
  GLY: NO_SIDE_CHAIN,

  ALA: { atoms: [CB], ringClosures: [], chi: [] },

  SER: {
    atoms: [CB, { name: 'OG', bondedTo: 'CB' }],
    ringClosures: [],
    chi: [['N', 'CA', 'CB', 'OG']],
  },

  CYS: {
    atoms: [CB, { name: 'SG', bondedTo: 'CB' }],
    ringClosures: [],
    chi: [['N', 'CA', 'CB', 'SG']],
  },

  THR: {
    atoms: [CB, { name: 'OG1', bondedTo: 'CB' }, { name: 'CG2', bondedTo: 'CB' }],
    ringClosures: [],
    chi: [['N', 'CA', 'CB', 'OG1']],
  },

  VAL: {
    atoms: [CB, { name: 'CG1', bondedTo: 'CB' }, { name: 'CG2', bondedTo: 'CB' }],
    ringClosures: [],
    chi: [['N', 'CA', 'CB', 'CG1']],
  },

  LEU: {
    atoms: [
      CB,
      { name: 'CG', bondedTo: 'CB' },
      { name: 'CD1', bondedTo: 'CG' },
      { name: 'CD2', bondedTo: 'CG' },
    ],
    ringClosures: [],
    chi: [
      ['N', 'CA', 'CB', 'CG'],
      ['CA', 'CB', 'CG', 'CD1'],
    ],
  },

  ILE: {
    atoms: [
      CB,
      { name: 'CG1', bondedTo: 'CB' },
      { name: 'CG2', bondedTo: 'CB' },
      { name: 'CD1', bondedTo: 'CG1' },
    ],
    ringClosures: [],
    chi: [
      ['N', 'CA', 'CB', 'CG1'],
      ['CA', 'CB', 'CG1', 'CD1'],
    ],
  },

  /**
   * Proline. Cδ bonds back to the backbone N, closing a five-membered ring.
   *
   * The ring is built outward like any other side chain and the closure bond is
   * simply drawn; with ideal parameters it will not close perfectly. That is left
   * visible rather than corrected — see claude.md on post-processing.
   */
  PRO: {
    atoms: [CB, { name: 'CG', bondedTo: 'CB' }, { name: 'CD', bondedTo: 'CG' }],
    ringClosures: [['CD', 'N']],
    chi: [
      ['N', 'CA', 'CB', 'CG'],
      ['CA', 'CB', 'CG', 'CD'],
    ],
  },

  MET: {
    atoms: [
      CB,
      { name: 'CG', bondedTo: 'CB' },
      { name: 'SD', bondedTo: 'CG' },
      { name: 'CE', bondedTo: 'SD' },
    ],
    ringClosures: [],
    chi: [
      ['N', 'CA', 'CB', 'CG'],
      ['CA', 'CB', 'CG', 'SD'],
      ['CB', 'CG', 'SD', 'CE'],
    ],
  },

  ASP: {
    atoms: [
      CB,
      { name: 'CG', bondedTo: 'CB' },
      { name: 'OD1', bondedTo: 'CG' },
      { name: 'OD2', bondedTo: 'CG' },
    ],
    ringClosures: [],
    chi: [
      ['N', 'CA', 'CB', 'CG'],
      ['CA', 'CB', 'CG', 'OD1'],
    ],
  },

  ASN: {
    atoms: [
      CB,
      { name: 'CG', bondedTo: 'CB' },
      { name: 'OD1', bondedTo: 'CG' },
      { name: 'ND2', bondedTo: 'CG' },
    ],
    ringClosures: [],
    chi: [
      ['N', 'CA', 'CB', 'CG'],
      ['CA', 'CB', 'CG', 'OD1'],
    ],
  },

  GLU: {
    atoms: [
      CB,
      { name: 'CG', bondedTo: 'CB' },
      { name: 'CD', bondedTo: 'CG' },
      { name: 'OE1', bondedTo: 'CD' },
      { name: 'OE2', bondedTo: 'CD' },
    ],
    ringClosures: [],
    chi: [
      ['N', 'CA', 'CB', 'CG'],
      ['CA', 'CB', 'CG', 'CD'],
      ['CB', 'CG', 'CD', 'OE1'],
    ],
  },

  GLN: {
    atoms: [
      CB,
      { name: 'CG', bondedTo: 'CB' },
      { name: 'CD', bondedTo: 'CG' },
      { name: 'OE1', bondedTo: 'CD' },
      { name: 'NE2', bondedTo: 'CD' },
    ],
    ringClosures: [],
    chi: [
      ['N', 'CA', 'CB', 'CG'],
      ['CA', 'CB', 'CG', 'CD'],
      ['CB', 'CG', 'CD', 'OE1'],
    ],
  },

  LYS: {
    atoms: [
      CB,
      { name: 'CG', bondedTo: 'CB' },
      { name: 'CD', bondedTo: 'CG' },
      { name: 'CE', bondedTo: 'CD' },
      { name: 'NZ', bondedTo: 'CE' },
    ],
    ringClosures: [],
    chi: [
      ['N', 'CA', 'CB', 'CG'],
      ['CA', 'CB', 'CG', 'CD'],
      ['CB', 'CG', 'CD', 'CE'],
      ['CG', 'CD', 'CE', 'NZ'],
    ],
  },

  ARG: {
    atoms: [
      CB,
      { name: 'CG', bondedTo: 'CB' },
      { name: 'CD', bondedTo: 'CG' },
      { name: 'NE', bondedTo: 'CD' },
      { name: 'CZ', bondedTo: 'NE' },
      { name: 'NH1', bondedTo: 'CZ' },
      { name: 'NH2', bondedTo: 'CZ' },
    ],
    ringClosures: [],
    chi: [
      ['N', 'CA', 'CB', 'CG'],
      ['CA', 'CB', 'CG', 'CD'],
      ['CB', 'CG', 'CD', 'NE'],
      ['CG', 'CD', 'NE', 'CZ'],
    ],
  },

  HIS: {
    atoms: [
      CB,
      { name: 'CG', bondedTo: 'CB' },
      { name: 'ND1', bondedTo: 'CG' },
      { name: 'CD2', bondedTo: 'CG' },
      { name: 'CE1', bondedTo: 'ND1' },
      { name: 'NE2', bondedTo: 'CD2' },
    ],
    ringClosures: [['CE1', 'NE2']],
    chi: [
      ['N', 'CA', 'CB', 'CG'],
      ['CA', 'CB', 'CG', 'ND1'],
    ],
  },

  PHE: {
    atoms: [
      CB,
      { name: 'CG', bondedTo: 'CB' },
      { name: 'CD1', bondedTo: 'CG' },
      { name: 'CD2', bondedTo: 'CG' },
      { name: 'CE1', bondedTo: 'CD1' },
      { name: 'CE2', bondedTo: 'CD2' },
      { name: 'CZ', bondedTo: 'CE1' },
    ],
    ringClosures: [['CZ', 'CE2']],
    chi: [
      ['N', 'CA', 'CB', 'CG'],
      ['CA', 'CB', 'CG', 'CD1'],
    ],
  },

  TYR: {
    atoms: [
      CB,
      { name: 'CG', bondedTo: 'CB' },
      { name: 'CD1', bondedTo: 'CG' },
      { name: 'CD2', bondedTo: 'CG' },
      { name: 'CE1', bondedTo: 'CD1' },
      { name: 'CE2', bondedTo: 'CD2' },
      { name: 'CZ', bondedTo: 'CE1' },
      { name: 'OH', bondedTo: 'CZ' },
    ],
    ringClosures: [['CZ', 'CE2']],
    chi: [
      ['N', 'CA', 'CB', 'CG'],
      ['CA', 'CB', 'CG', 'CD1'],
    ],
  },

  /** Tryptophan: a fused bicyclic indole, so two ring closures. */
  TRP: {
    atoms: [
      CB,
      { name: 'CG', bondedTo: 'CB' },
      { name: 'CD1', bondedTo: 'CG' },
      { name: 'CD2', bondedTo: 'CG' },
      { name: 'NE1', bondedTo: 'CD1' },
      { name: 'CE2', bondedTo: 'CD2' },
      { name: 'CE3', bondedTo: 'CD2' },
      { name: 'CZ2', bondedTo: 'CE2' },
      { name: 'CZ3', bondedTo: 'CE3' },
      { name: 'CH2', bondedTo: 'CZ2' },
    ],
    ringClosures: [
      ['NE1', 'CE2'],
      ['CH2', 'CZ3'],
    ],
    chi: [
      ['N', 'CA', 'CB', 'CG'],
      ['CA', 'CB', 'CG', 'CD1'],
    ],
  },
}

/** How many rotatable heavy-atom dihedrals each amino acid has. 0 for GLY and ALA. */
export const CHI_COUNT: Record<AminoAcidCode, number> = Object.fromEntries(
  Object.entries(SIDE_CHAIN_TOPOLOGY).map(([code, topology]) => [code, topology.chi.length]),
) as Record<AminoAcidCode, number>

/** Total heavy atoms per residue: N, CA, C, O plus the side chain. */
export function heavyAtomCount(aminoAcid: AminoAcidCode): number {
  return 4 + SIDE_CHAIN_TOPOLOGY[aminoAcid].atoms.length
}
