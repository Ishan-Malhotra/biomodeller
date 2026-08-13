/**
 * Residue-list editing: the operations behind the Desmos-style expression list.
 *
 * Pure and framework-free, like the rest of lib/. Every function takes a residue
 * list and returns a new one; nothing mutates its input, and nothing here knows
 * that atoms or a renderer exist.
 *
 * Why this is a separate module from the UI: these are the operations whose
 * correctness the suffix-recompute optimisation depends on. If `moveResidue`
 * quietly changed a residue it shouldn't have, `firstChangedIndex` would still
 * find the right index and the structure would still be correct — but the
 * reverse matters more, and the invariant worth testing is that every operation
 * followed by an incremental rebuild equals a rebuild from scratch. That is a
 * statement about pure functions, so it belongs in pure functions.
 *
 * Angles are stored in degrees, normalised to (−180°, 180°].
 */

import { OMEGA_TRANS } from './constants.ts'
import type { AminoAcidCode, Residue } from './types.ts'

/**
 * Angles a freshly added residue starts at.
 *
 * α-helical, rather than a neutral 180/180/180. An extended chain of straight
 * residues is the least informative thing a new user can be shown: adding rows
 * makes a line get longer. Helical defaults mean the third or fourth residue
 * already visibly curls, which is the behaviour the tool exists to demonstrate.
 * Every value stays editable, so this is a starting point, not a constraint.
 */
export const DEFAULT_ANGLES = { phi: -57, psi: -47, omega: OMEGA_TRANS } as const

/** The amino acid a new row starts as — glycine, the one with no side chain. */
export const DEFAULT_AMINO_ACID: AminoAcidCode = 'GLY'

/**
 * Normalise a dihedral to (−180°, 180°].
 *
 * Dihedrals are periodic, so 200° and −160° are the same conformation, and a
 * user typing either should get the same structure. The half-open interval is
 * chosen to include +180 rather than −180 so that a trans peptide bond reads as
 * ω = 180°, the convention every table uses.
 */
export function wrapDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) {
    throw new Error(`Angle must be finite, got ${degrees}.`)
  }
  // Exact identity for angles already in range. The modulo arithmetic below is
  // mathematically the identity there too, but not in floating point: it would
  // perturb −60.5 by an ulp, which is enough to make an unrelated field edit
  // register as an angle change and needlessly recompute the chain's suffix.
  if (degrees > -180 && degrees <= 180) return degrees
  const shifted = (((degrees + 180) % 360) + 360) % 360
  return shifted === 0 ? 180 : shifted - 180
}

/**
 * A fresh residue id that no residue in `residues` holds.
 *
 * Ids exist so that React keys and selection survive reordering, so they must
 * not be positional. Derived from the highest existing number rather than a
 * module-level counter: a counter would make this module stateful and its tests
 * order-dependent.
 */
export function nextResidueId(residues: readonly Residue[]): string {
  let highest = 0
  for (const residue of residues) {
    const parsed = Number.parseInt(residue.id.replace(/^r/, ''), 10)
    if (Number.isFinite(parsed) && parsed > highest) highest = parsed
  }
  return `r${highest + 1}`
}

/** A new residue with default angles and an id unused in `residues`. */
export function newResidue(
  residues: readonly Residue[],
  overrides: Partial<Omit<Residue, 'id'>> = {},
): Residue {
  return {
    id: nextResidueId(residues),
    aminoAcid: DEFAULT_AMINO_ACID,
    ...DEFAULT_ANGLES,
    ...overrides,
  }
}

/** True if `index` addresses an existing residue. */
export function isValidIndex(residues: readonly Residue[], index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < residues.length
}

function requireIndex(residues: readonly Residue[], index: number, operation: string): void {
  if (!isValidIndex(residues, index)) {
    throw new Error(`${operation}: no residue at index ${index} (length ${residues.length}).`)
  }
}

/**
 * Insert a residue at `index`, shifting the rest toward the C-terminus.
 *
 * `index === residues.length` appends, which is the common case: new rows go on
 * the C-terminal end by default (product.md §5.1).
 */
export function insertResidue(
  residues: readonly Residue[],
  index: number,
  residue: Residue,
): Residue[] {
  if (!Number.isInteger(index) || index < 0 || index > residues.length) {
    throw new Error(`insertResidue: index ${index} out of range (length ${residues.length}).`)
  }
  return [...residues.slice(0, index), residue, ...residues.slice(index)]
}

/** Append a residue with default angles to the C-terminal end. */
export function appendResidue(
  residues: readonly Residue[],
  overrides: Partial<Omit<Residue, 'id'>> = {},
): Residue[] {
  return insertResidue(residues, residues.length, newResidue(residues, overrides))
}

/**
 * Insert a copy of residue `index` directly after it.
 *
 * The fastest way to build a run of one conformation by hand, and the copy gets
 * a fresh id so the two rows stay independently selectable.
 */
export function duplicateResidue(residues: readonly Residue[], index: number): Residue[] {
  requireIndex(residues, index, 'duplicateResidue')
  const source = residues[index]!
  return insertResidue(residues, index + 1, { ...source, id: nextResidueId(residues) })
}

/** Remove residue `index`, shifting the rest toward the N-terminus. */
export function removeResidue(residues: readonly Residue[], index: number): Residue[] {
  requireIndex(residues, index, 'removeResidue')
  return [...residues.slice(0, index), ...residues.slice(index + 1)]
}

/**
 * Replace fields of residue `index`.
 *
 * Angles in the patch are wrapped, so a caller can pass whatever the user typed
 * without pre-validating it.
 */
export function updateResidue(
  residues: readonly Residue[],
  index: number,
  patch: Partial<Omit<Residue, 'id'>>,
): Residue[] {
  requireIndex(residues, index, 'updateResidue')
  const current = residues[index]!
  const updated: Residue = {
    ...current,
    ...patch,
    phi: wrapDegrees(patch.phi ?? current.phi),
    psi: wrapDegrees(patch.psi ?? current.psi),
    omega: wrapDegrees(patch.omega ?? current.omega),
  }
  return [...residues.slice(0, index), updated, ...residues.slice(index + 1)]
}

/**
 * Move residue `from` to position `to`, closing the gap it leaves behind.
 *
 * `to` is interpreted against the list *after* removal, which is what makes
 * `moveResidue(list, i, i + 1)` and `moveResidue(list, i, i - 1)` behave as
 * "swap with neighbour" — the operations the row's up/down buttons need.
 * Out-of-range destinations clamp to the ends rather than throwing, so holding
 * the up arrow on the first row is a no-op instead of an error.
 */
export function moveResidue(residues: readonly Residue[], from: number, to: number): Residue[] {
  requireIndex(residues, from, 'moveResidue')
  const target = Math.max(0, Math.min(residues.length - 1, Math.trunc(to)))
  if (target === from) return [...residues]
  const without = removeResidue(residues, from)
  return insertResidue(without, target, residues[from]!)
}
