/**
 * Rendering style for atoms and bonds.
 *
 * Presentation only. Nothing here is chemistry the math depends on, which is why
 * it lives in src/ and not lib/constants.ts — those are the geometric constants
 * the reconstruction is defined by, and adding display radii to them would blur
 * a line worth keeping sharp. Changing anything in this file changes what you
 * see and never where an atom is.
 *
 * Colours are keyed by theme because WebGL materials take literal colours and
 * cannot read the CSS custom properties in index.css. Same two theme names, so
 * the two colour systems stay in step.
 */

import type { Element } from '../../lib/types.ts'
import type { Theme } from '../theme.ts'

/**
 * CPK-ish colours, the convention every structure viewer uses.
 *
 * The dark variants preserve each element's hue and lift only its luminance —
 * nitrogen stays blue and oxygen stays red, because those associations are
 * something a chemist reads rather than a design choice. Carbon is the exception
 * and has to invert: near-black on a light background, light grey on a dark one.
 */
export const ELEMENT_COLOR: Record<Theme, Record<Element, string>> = {
  light: {
    C: '#3f4652',
    N: '#3b6fd4',
    O: '#d9453c',
    S: '#c8961e',
  },
  dark: {
    C: '#aab2c0',
    N: '#5b8def',
    O: '#ef5f54',
    S: '#e0b13c',
  },
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
  // Sulfur is the largest of the four; drawn slightly bigger so Cys and Met read
  // at a glance, still far below its ~1.8 Å van der Waals radius.
  S: 0.36,
}

/** Bond stick radii in ångströms. */
export const BOND_RADIUS = {
  BACKBONE: 0.11,
  CARBONYL: 0.085,
  /** Thinner than the main chain, so the backbone's path stays readable through it. */
  SIDECHAIN: 0.075,
} as const

/**
 * Lighting per theme.
 *
 * A dark background reflects nothing back into the model, so the same intensities
 * that look right on white leave the structure looking sooty. Ambient and
 * hemisphere terms come up; the key light stays roughly put so the shading that
 * makes the balls read as spheres survives.
 */
export const SCENE_LIGHTING: Record<
  Theme,
  {
    readonly ambient: number
    readonly hemisphere: number
    readonly hemisphereGround: string
    readonly key: number
    readonly fill: number
  }
> = {
  light: {
    ambient: 0.55,
    hemisphere: 0.35,
    hemisphereGround: '#20242c',
    key: 1.6,
    fill: 0.4,
  },
  dark: {
    ambient: 0.75,
    hemisphere: 0.5,
    hemisphereGround: '#0b0d11',
    key: 1.5,
    fill: 0.55,
  },
}
