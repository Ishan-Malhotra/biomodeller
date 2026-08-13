/**
 * Rendering style for backbone atoms and bonds.
 *
 * Presentation only. Nothing here is chemistry the math depends on, which is why
 * it lives in src/ and not lib/constants.ts — those are the geometric constants
 * the reconstruction is defined by, and adding display radii to them would blur
 * a line worth keeping sharp. Changing anything in this file changes what you
 * see and never where an atom is.
 */

import type { Element } from '../../lib/types.ts'

/** CPK-ish colours, the convention every structure viewer uses. */
export const ELEMENT_COLOR: Record<Element, string> = {
  C: '#3f4652',
  N: '#3b6fd4',
  O: '#d9453c',
}

/**
 * Ball radii in ångströms — deliberately far below the ~1.5 Å van der Waals
 * radii, so balls stay small enough to read the chain's path through them. Not
 * physical sizes and not used for anything but drawing.
 */
export const ELEMENT_RADIUS: Record<Element, number> = {
  C: 0.32,
  N: 0.3,
  O: 0.3,
}

/** Bond stick radii in ångströms. */
export const BOND_RADIUS = {
  BACKBONE: 0.11,
  CARBONYL: 0.085,
} as const
