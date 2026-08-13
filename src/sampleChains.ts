/**
 * Example chains: conformations whose shape is known in advance.
 *
 * These began as step 4 scaffolding for checking the render pipeline — if the
 * α-helix doesn't look right-handed on screen, something between
 * `buildBackbone` and the canvas is wrong — and they keep earning their place
 * for the same reason at every later step.
 *
 * They are examples, not presets: loading one drops its residues into the
 * editable list, where every angle is then just as editable as one typed by
 * hand. The app still opens empty (product.md §5.1); nothing here is a default.
 */

import { OMEGA_TRANS } from '../lib/constants.ts'
import type { AminoAcidCode, Residue } from '../lib/types.ts'

interface Segment {
  readonly length: number
  readonly phi: number
  readonly psi: number
  readonly aminoAcid: AminoAcidCode
}

/** Canonical φ/ψ for the two classic secondary structures. */
const ALPHA_HELIX = { phi: -57, psi: -47 } as const
const BETA_STRAND = { phi: -139, psi: 135 } as const

function chainOf(segments: readonly Segment[]): Residue[] {
  const residues: Residue[] = []
  for (const segment of segments) {
    for (let i = 0; i < segment.length; i++) {
      residues.push({
        id: `r${residues.length + 1}`,
        aminoAcid: segment.aminoAcid,
        phi: segment.phi,
        psi: segment.psi,
        omega: OMEGA_TRANS,
      })
    }
  }
  return residues
}

export interface ExampleChain {
  readonly name: string
  readonly description: string
  readonly residues: Residue[]
}

export const EXAMPLE_CHAINS: readonly ExampleChain[] = [
  {
    name: 'One residue',
    description: 'The canonical seed frame: N, Cα, C, O. Not derived from angles.',
    residues: chainOf([{ length: 1, ...ALPHA_HELIX, aminoAcid: 'GLY' }]),
  },
  {
    name: 'α-helix',
    description: '18 residues at φ −57°, ψ −47°. Should coil right-handed, 3.6 residues/turn.',
    residues: chainOf([{ length: 18, ...ALPHA_HELIX, aminoAcid: 'ALA' }]),
  },
  {
    name: 'β-strand',
    description: '12 residues at φ −139°, ψ 135°. Should run nearly straight and pleated.',
    residues: chainOf([{ length: 12, ...BETA_STRAND, aminoAcid: 'VAL' }]),
  },
  {
    name: 'Helix–turn–helix',
    description: 'Two helices joined by an extended linker — checks that segments hinge.',
    residues: chainOf([
      { length: 10, ...ALPHA_HELIX, aminoAcid: 'ALA' },
      { length: 4, ...BETA_STRAND, aminoAcid: 'GLY' },
      { length: 10, ...ALPHA_HELIX, aminoAcid: 'LEU' },
    ]),
  },
  {
    name: 'Polyproline II',
    description: 'φ −75°, ψ 145° — a left-handed extended helix, the collagen conformation.',
    residues: chainOf([{ length: 15, phi: -75, psi: 145, aminoAcid: 'PRO' }]),
  },
]
