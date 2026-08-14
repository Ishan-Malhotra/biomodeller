/**
 * The per-atom Cartesian coordinate readout.
 *
 * Pure formatting over derived data — the AutoCAD half of the interaction model
 * (product.md §5: "coordinate readout on hover/click of any atom"). The atoms
 * handed in are expected to have been through the origin transform already, so
 * these are the coordinates *in the user's current frame*; this module does no
 * transforming of its own.
 *
 * Formatting is fixed-decimal rather than significant-figures on purpose: a
 * column of numbers is read by comparing digits in the same place, and 0.5 next
 * to 0.500 defeats that.
 */

import { atomDisplayName } from './naming.ts'
import type { Atom } from './types.ts'

/** Ångströms, to the precision the PDB format itself carries. */
export const COORDINATE_DECIMALS = 3

/**
 * Round to fixed decimals, collapsing negative zero.
 *
 * `(-0.0001).toFixed(3)` is `"-0.000"`, which reads as a meaningfully negative
 * number in a table when it is really the origin. Anything that rounds to zero is
 * shown as unsigned zero.
 */
export function formatCoordinate(value: number, decimals = COORDINATE_DECIMALS): string {
  const fixed = value.toFixed(decimals)
  return Number(fixed) === 0 ? (0).toFixed(decimals) : fixed
}

export interface CoordinateRow {
  /** 0-based, matching `Atom.residueIndex`. */
  readonly residueIndex: number
  /** 1-based, matching the residue list on screen. */
  readonly residueNumber: number
  readonly aminoAcid: string
  readonly atomName: string
  /** `'Cα'` rather than `'CA'`. */
  readonly displayName: string
  readonly x: string
  readonly y: string
  readonly z: string
}

/** One row per atom, in chain order. */
export function coordinateRows(
  atoms: readonly Atom[],
  decimals = COORDINATE_DECIMALS,
): CoordinateRow[] {
  return atoms.map((atom) => ({
    residueIndex: atom.residueIndex,
    residueNumber: atom.residueIndex + 1,
    aminoAcid: atom.aminoAcid,
    atomName: atom.name,
    displayName: atomDisplayName(atom.name),
    x: formatCoordinate(atom.position.x, decimals),
    y: formatCoordinate(atom.position.y, decimals),
    z: formatCoordinate(atom.position.z, decimals),
  }))
}
