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
