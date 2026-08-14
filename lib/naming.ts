/**
 * Human-readable atom names.
 *
 * PDB atom names encode position in the side chain with a Greek letter written as
 * a Latin one: CA is C-alpha, CB is C-beta, CG1 is C-gamma-1. Displaying them raw
 * is fine for a file format and poor for a pedagogical tool — someone learning
 * that φ is the C–N–Cα–C dihedral should see "Cα" on the atom, not "CA".
 *
 * This is naming, not geometry: nothing here affects a coordinate. It lives in
 * lib/ rather than src/ because it is derived from the chemistry (the Greek
 * position is part of the atom's identity, not a display preference) and because
 * three separate views need the same answer.
 */

import type { BackboneAtomName } from './types.ts'

/** The Greek letter each PDB position code stands for. */
const GREEK: Record<string, string> = {
  A: 'α',
  B: 'β',
  G: 'γ',
  D: 'δ',
  E: 'ε',
  Z: 'ζ',
  H: 'η',
}

/**
 * Names that look like they encode a Greek position but do not.
 *
 * `OXT` is the second oxygen of a C-terminal carboxylate — "XT" for "extra
 * terminal", nothing to do with ξ. Without this the parser below would render it
 * "OXT" anyway (X is not in the table), but stating it makes the intent explicit
 * rather than accidental.
 */
const LITERAL_NAMES = new Set(['N', 'C', 'O', 'OXT'])

/**
 * `'CA'` → `'Cα'`, `'CG1'` → `'Cγ1'`, `'N'` → `'N'`.
 *
 * Anything that doesn't match the element-then-Greek-then-branch shape is
 * returned unchanged, so an unrecognised name degrades to its raw form instead of
 * being mangled.
 */
export function atomDisplayName(name: string): string {
  if (LITERAL_NAMES.has(name)) return name

  const match = /^([CNOS])([A-Z])(\d*)$/.exec(name)
  if (!match) return name

  const [, element, position, branch] = match
  const greek = GREEK[position!]
  return greek ? `${element}${greek}${branch}` : name
}

/**
 * The key that identifies one atom across views: `'3:CG1'`.
 *
 * Shared by the 3D structure, the 2D depiction and the hover linking between them,
 * so it lives here rather than in either renderer. `residueIndex` is 0-based, as
 * everywhere in the code.
 */
export function atomKey(residueIndex: number, atomName: string): string {
  return `${residueIndex}:${atomName}`
}

/**
 * A label identifying one atom in one residue, e.g. `'Cα · ALA 4'`.
 *
 * Residue numbering is 1-based for display, matching the residue list, while
 * `residueIndex` is 0-based everywhere in the code.
 */
export function atomLabel(
  atomName: BackboneAtomName | string,
  aminoAcid: string,
  residueIndex: number,
): string {
  return `${atomDisplayName(atomName)} · ${aminoAcid} ${residueIndex + 1}`
}
