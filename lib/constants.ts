/**
 * Ideal backbone geometry constants.
 *
 * Values are the standard Engh & Huber (1991, 2001) restraint targets used by
 * essentially every structure-refinement package, and match product.md §4.1.
 * These are *ideal* values: real deposited structures vary around them by
 * roughly ±0.02 Å in bond length and ±2° in bond angle. That variation is real
 * chemistry, not error, and this tool does not attempt to reproduce it — the
 * whole premise is deterministic reconstruction from angles alone.
 *
 * Nothing in lib/nerf.ts may inline a geometric magic number; it comes from here.
 */

/** Bond lengths in ångströms. */
export const BOND_LENGTH = {
  /** N–Cα, within a residue. */
  N_CA: 1.458,
  /** Cα–C, within a residue. */
  CA_C: 1.525,
  /** C–N, the peptide bond linking residue i to residue i+1. */
  C_N: 1.329,
  /** C=O, the carbonyl. */
  C_O: 1.231,
} as const

/** Bond angles in degrees. Named for the three atoms that define them. */
export const BOND_ANGLE = {
  /** N-Cα-C — the "tau" angle, within a residue. */
  N_CA_C: 111.2,
  /** Cα-C-N — spans the peptide bond into residue i+1. */
  CA_C_N: 116.2,
  /** C-N-Cα — spans the peptide bond into residue i+1. */
  C_N_CA: 121.7,
  /** Cα-C-O — places the carbonyl oxygen. */
  CA_C_O: 120.8,
} as const

/**
 * Default dihedrals in degrees.
 *
 * OMEGA_TRANS is the near-planar trans peptide bond that ~99.7% of non-proline
 * residues adopt. OMEGA_CIS (0°) occurs mainly at X-Pro bonds; both are valid
 * user input, so ω is a real per-residue degree of freedom, not a constant.
 */
export const OMEGA_TRANS = 180
export const OMEGA_CIS = 0

/**
 * Offset from ψ to the Cα-C-O dihedral (N-Cα-C-O).
 *
 * The carbonyl O sits anti to the next residue's N across the Cα–C bond, so it
 * carries no independent degree of freedom: O is placed at ψ + 180°. For the
 * C-terminal residue, where there is no next N, ψ still fixes O by the same rule.
 */
export const PSI_TO_O_DIHEDRAL_OFFSET = 180

// ---------------------------------------------------------------------------
// Side chains
// ---------------------------------------------------------------------------

/**
 * Provenance of everything below.
 *
 * These are *idealised* side-chain values, derived as robust medians over the
 * 0.95 Å structure 4LZT (hen egg-white lysozyme; Walsh et al., 1998) by
 * `scripts/build-sidechain-fixture.ts`. Medians rather than means: one disordered
 * arginine in that structure has a Cζ bond angle of 172° against a cluster at
 * 122–136°, and a mean would carry the outlier into the reference.
 *
 * Same status as the backbone constants above — ideal targets, not a claim about
 * any particular protein. `tests/sidechains.test.ts` holds each value to the
 * measured distribution with a stated tolerance, so the idealisation is bounded
 * and visible rather than assumed.
 */

/**
 * The N-C-Cα-Cβ dihedral, degrees.
 *
 * An *improper* dihedral: N and C are both bonded to Cα but not to each other, so
 * this is not a torsion about a bond. It is how Cβ gets placed at all — the
 * general "walk two bonds back" rule that gives every other side-chain atom its
 * reference frame would run off the end of the backbone here.
 *
 * Measured medians run 121°–127° across residue types (see the test), so a single
 * value costs up to ~0.13 Å in Cβ position. Within the ideal-geometry premise.
 */
export const CB_IMPROPER_DIHEDRAL = 122.5

/** Proline's, which the five-membered ring pulls ~8° away from every other. */
export const PRO_CB_IMPROPER_DIHEDRAL = 114.7

/**
 * Offset between the two substituents on a tetrahedral side-chain carbon, degrees.
 *
 * Valine's two methyls, leucine's two δ carbons, threonine's Oγ1 and Cγ2,
 * isoleucine's Cγ1 and Cγ2. One is placed by a χ and the other follows at this
 * offset, which is what keeps them rigid relative to each other as the χ turns.
 * The *sign* differs per residue and lives in the geometry table — it encodes
 * which branch the PDB naming convention calls "1".
 */
export const TETRAHEDRAL_BRANCH_OFFSET = 122.5

/** Dihedral for an atom cis across a planar centre or in a planar ring. */
export const PLANAR_CIS = 0

/** Dihedral for an atom trans across a planar centre, and every ring continuation. */
export const PLANAR_TRANS = 180

/** Bond length in Å, bond angle and (where fixed) dihedral in degrees. */
export interface SideChainAtomGeometry {
  readonly length: number
  readonly angle: number
  /**
   * Absent when a χ drives this atom, since the value then comes from the
   * residue's own state. Present as a fixed value or a χ offset otherwise.
   */
  readonly dihedral?: number
}

/**
 * Per-residue, per-atom side-chain geometry.
 *
 * Keyed by PDB atom name. Glycine is absent — it has no side chain.
 */
export const SIDE_CHAIN_GEOMETRY: Record<
  string,
  Readonly<Record<string, SideChainAtomGeometry>>
> = {
  ALA: {
    CB: { length: 1.517, angle: 110.1, dihedral: CB_IMPROPER_DIHEDRAL },
  },
  ARG: {
    CB: { length: 1.523, angle: 111.2, dihedral: CB_IMPROPER_DIHEDRAL },
    CG: { length: 1.504, angle: 114.1 },
    CD: { length: 1.517, angle: 112.8 },
    NE: { length: 1.448, angle: 112.3 },
    CZ: { length: 1.315, angle: 128.4 },
    NH1: { length: 1.329, angle: 121.4, dihedral: PLANAR_CIS },
    NH2: { length: 1.327, angle: 119.6, dihedral: PLANAR_TRANS },
  },
  ASN: {
    CB: { length: 1.534, angle: 110.2, dihedral: CB_IMPROPER_DIHEDRAL },
    CG: { length: 1.502, angle: 112.4 },
    OD1: { length: 1.227, angle: 121.8 },
    ND2: { length: 1.319, angle: 116.9, dihedral: PLANAR_TRANS },
  },
  ASP: {
    CB: { length: 1.538, angle: 110.6, dihedral: CB_IMPROPER_DIHEDRAL },
    CG: { length: 1.512, angle: 114.1 },
    OD1: { length: 1.239, angle: 120.0 },
    OD2: { length: 1.253, angle: 116.3, dihedral: PLANAR_TRANS },
  },
  CYS: {
    CB: { length: 1.530, angle: 109.2, dihedral: CB_IMPROPER_DIHEDRAL },
    SG: { length: 1.816, angle: 113.9 },
  },
  GLN: {
    CB: { length: 1.522, angle: 110.2, dihedral: CB_IMPROPER_DIHEDRAL },
    CG: { length: 1.532, angle: 109.0 },
    CD: { length: 1.500, angle: 119.7 },
    OE1: { length: 1.220, angle: 126.7 },
    NE2: { length: 1.327, angle: 114.9, dihedral: PLANAR_TRANS },
  },
  GLU: {
    CB: { length: 1.509, angle: 110.5, dihedral: CB_IMPROPER_DIHEDRAL },
    CG: { length: 1.516, angle: 114.6 },
    CD: { length: 1.503, angle: 117.2 },
    OE1: { length: 1.267, angle: 117.5 },
    OE2: { length: 1.250, angle: 119.3, dihedral: PLANAR_TRANS },
  },
  HIS: {
    CB: { length: 1.520, angle: 110.3, dihedral: CB_IMPROPER_DIHEDRAL },
    CG: { length: 1.489, angle: 114.7 },
    ND1: { length: 1.359, angle: 127.0 },
    CD2: { length: 1.329, angle: 126.7, dihedral: PLANAR_TRANS },
    CE1: { length: 1.334, angle: 108.9, dihedral: PLANAR_TRANS },
    NE2: { length: 1.369, angle: 108.4, dihedral: PLANAR_TRANS },
  },
  ILE: {
    CB: { length: 1.530, angle: 112.2, dihedral: CB_IMPROPER_DIHEDRAL },
    CG1: { length: 1.531, angle: 110.4 },
    CG2: { length: 1.510, angle: 111.3, dihedral: -TETRAHEDRAL_BRANCH_OFFSET },
    CD1: { length: 1.505, angle: 114.2 },
  },
  LEU: {
    CB: { length: 1.519, angle: 111.1, dihedral: CB_IMPROPER_DIHEDRAL },
    CG: { length: 1.526, angle: 114.5 },
    CD1: { length: 1.531, angle: 109.6 },
    CD2: { length: 1.506, angle: 111.4, dihedral: TETRAHEDRAL_BRANCH_OFFSET },
  },
  LYS: {
    CB: { length: 1.527, angle: 111.7, dihedral: CB_IMPROPER_DIHEDRAL },
    CG: { length: 1.519, angle: 114.0 },
    CD: { length: 1.520, angle: 110.8 },
    CE: { length: 1.513, angle: 113.2 },
    NZ: { length: 1.483, angle: 111.0 },
  },
  MET: {
    CB: { length: 1.523, angle: 111.2, dihedral: CB_IMPROPER_DIHEDRAL },
    CG: { length: 1.531, angle: 112.1 },
    SD: { length: 1.799, angle: 111.5 },
    CE: { length: 1.786, angle: 99.8 },
  },
  PHE: {
    CB: { length: 1.534, angle: 110.0, dihedral: CB_IMPROPER_DIHEDRAL },
    CG: { length: 1.497, angle: 114.7 },
    CD1: { length: 1.387, angle: 121.2 },
    CD2: { length: 1.371, angle: 120.2, dihedral: PLANAR_TRANS },
    CE1: { length: 1.366, angle: 119.9, dihedral: PLANAR_TRANS },
    CE2: { length: 1.375, angle: 120.5, dihedral: PLANAR_TRANS },
    CZ: { length: 1.367, angle: 119.8, dihedral: PLANAR_CIS },
  },
  PRO: {
    // Proline's Cβ improper is ring-constrained, ~8° off every other residue's.
    CB: { length: 1.540, angle: 111.1, dihedral: PRO_CB_IMPROPER_DIHEDRAL },
    CG: { length: 1.510, angle: 105.0 },
    CD: { length: 1.511, angle: 105.0 },
  },
  SER: {
    CB: { length: 1.528, angle: 109.3, dihedral: CB_IMPROPER_DIHEDRAL },
    OG: { length: 1.414, angle: 111.1 },
  },
  THR: {
    CB: { length: 1.518, angle: 109.6, dihedral: CB_IMPROPER_DIHEDRAL },
    OG1: { length: 1.437, angle: 108.2 },
    CG2: { length: 1.512, angle: 112.8, dihedral: -TETRAHEDRAL_BRANCH_OFFSET },
  },
  TRP: {
    CB: { length: 1.532, angle: 110.7, dihedral: CB_IMPROPER_DIHEDRAL },
    CG: { length: 1.488, angle: 112.3 },
    CD1: { length: 1.355, angle: 126.7 },
    CD2: { length: 1.432, angle: 126.9, dihedral: PLANAR_TRANS },
    NE1: { length: 1.367, angle: 110.2, dihedral: PLANAR_TRANS },
    CE2: { length: 1.403, angle: 106.8, dihedral: PLANAR_TRANS },
    CE3: { length: 1.394, angle: 133.9, dihedral: PLANAR_CIS },
    CZ2: { length: 1.393, angle: 121.4, dihedral: PLANAR_TRANS },
    CZ3: { length: 1.371, angle: 119.3, dihedral: PLANAR_TRANS },
    CH2: { length: 1.377, angle: 117.6, dihedral: PLANAR_CIS },
  },
  TYR: {
    CB: { length: 1.526, angle: 110.9, dihedral: CB_IMPROPER_DIHEDRAL },
    CG: { length: 1.509, angle: 113.2 },
    CD1: { length: 1.375, angle: 122.2 },
    CD2: { length: 1.368, angle: 121.5, dihedral: PLANAR_TRANS },
    CE1: { length: 1.383, angle: 123.2, dihedral: PLANAR_TRANS },
    CE2: { length: 1.372, angle: 122.8, dihedral: PLANAR_TRANS },
    CZ: { length: 1.370, angle: 118.0, dihedral: PLANAR_CIS },
    OH: { length: 1.388, angle: 119.0, dihedral: PLANAR_TRANS },
  },
  VAL: {
    CB: { length: 1.539, angle: 110.3, dihedral: CB_IMPROPER_DIHEDRAL },
    CG1: { length: 1.525, angle: 109.9 },
    CG2: { length: 1.513, angle: 111.8, dihedral: TETRAHEDRAL_BRANCH_OFFSET },
  },
}

/**
 * The χ angles a residue starts at, degrees.
 *
 * **Not measured** — unlike everything else in this section. These are the
 * canonical most-common rotamers: χ1 in the gauche− well (−60°), which dominates
 * for nearly every residue; χ2 trans (180°) for aliphatic chains; χ2 ≈ 90° for the
 * aromatics, whose ring sits roughly perpendicular to the Cα–Cβ bond; χ2 ≈ 0° for
 * the planar carboxyl/carboxamide groups, where the two oxygens are equivalent
 * enough that any value is as defensible as another; and trans for χ3 and χ4.
 *
 * Deliberately *not* the medians of the 4LZT structure the other constants come
 * from. With n=1 for histidine and n=2 for glutamate, those medians are one
 * protein's accidents — lysozyme's asparagines happen to sit near χ1 = −153°, a
 * minor rotamer, and a new residue should not start there.
 *
 * These exist so that *selecting* an amino acid immediately produces a plausible
 * side chain, rather than making the user type four numbers before seeing
 * anything. Every value stays editable; nothing here constrains the user.
 *
 * Proline is the exception on both counts: its ring fixes χ1 near +30° and χ2 near
 * −35° (the Cγ-endo pucker), and a gauche− χ1 would be geometrically absurd.
 */
export const DEFAULT_CHI: Record<string, readonly number[]> = {
  GLY: [],
  ALA: [],
  SER: [-60],
  CYS: [-60],
  THR: [-60],
  VAL: [-60],
  PRO: [30, -35],
  ILE: [-60, 180],
  LEU: [-60, 180],
  MET: [-60, 180, 180],
  LYS: [-60, 180, 180, 180],
  ARG: [-60, 180, 180, 180],
  ASP: [-60, 0],
  ASN: [-60, 0],
  GLU: [-60, 180, 0],
  GLN: [-60, 180, 0],
  HIS: [-60, 90],
  PHE: [-60, 90],
  TYR: [-60, 90],
  TRP: [-60, 90],
}
