import { describe, expect, it } from 'vitest'

import { buildAtoms } from '../lib/chain.ts'
import { coordinateRows, formatCoordinate } from '../lib/coordinates.ts'
import { atomDisplayName, atomLabel } from '../lib/naming.ts'
import { vec3 } from '../lib/nerf.ts'
import { applyToAtoms, frameOn, IDENTITY_QUAT } from '../lib/transform.ts'
import type { Residue } from '../lib/types.ts'

/**
 * Tests for the coordinate readout and atom naming.
 *
 * Small modules, but the readout is the only place a user sees a number they can
 * check against another tool, so its correctness is load-bearing for whether the
 * whole thing looks trustworthy.
 */

const residues: Residue[] = [
  { id: 'a', aminoAcid: 'ALA', phi: -57, psi: -47, omega: 180, chi: [] },
  { id: 'b', aminoAcid: 'GLY', phi: -57, psi: -47, omega: 180, chi: [] },
]
const atoms = buildAtoms(residues)

describe('atomDisplayName', () => {
  it('renders Greek positions', () => {
    expect(atomDisplayName('CA')).toBe('Cα')
    expect(atomDisplayName('CB')).toBe('Cβ')
    expect(atomDisplayName('CG')).toBe('Cγ')
    expect(atomDisplayName('CD')).toBe('Cδ')
    expect(atomDisplayName('CE')).toBe('Cε')
    expect(atomDisplayName('CZ')).toBe('Cζ')
    expect(atomDisplayName('OH')).toBe('Oη')
  })

  it('keeps branch numbers', () => {
    expect(atomDisplayName('CG1')).toBe('Cγ1')
    expect(atomDisplayName('CD2')).toBe('Cδ2')
    expect(atomDisplayName('NH1')).toBe('Nη1')
    expect(atomDisplayName('OE2')).toBe('Oε2')
    expect(atomDisplayName('CH2')).toBe('Cη2')
  })

  it('leaves the backbone names alone', () => {
    expect(atomDisplayName('N')).toBe('N')
    expect(atomDisplayName('C')).toBe('C')
    expect(atomDisplayName('O')).toBe('O')
  })

  it('handles the sulfurs', () => {
    expect(atomDisplayName('SG')).toBe('Sγ')
    expect(atomDisplayName('SD')).toBe('Sδ')
  })

  it('does not mangle names that only look Greek', () => {
    // "XT" is "extra terminal", not ξ.
    expect(atomDisplayName('OXT')).toBe('OXT')
  })

  it('returns anything unrecognised unchanged', () => {
    for (const name of ['', 'ZZ9', 'FE', 'HETATM', '1HB']) {
      expect(atomDisplayName(name)).toBe(name)
    }
  })
})

describe('atomLabel', () => {
  it('names the atom and its residue, numbering from 1', () => {
    expect(atomLabel('CA', 'ALA', 3)).toBe('Cα · ALA 4')
    expect(atomLabel('N', 'GLY', 0)).toBe('N · GLY 1')
  })
})

describe('formatCoordinate', () => {
  it('is fixed-decimal so columns line up', () => {
    expect(formatCoordinate(0.5)).toBe('0.500')
    expect(formatCoordinate(-1)).toBe('-1.000')
    expect(formatCoordinate(12.3456)).toBe('12.346')
  })

  it('collapses negative zero, which otherwise reads as a real negative', () => {
    expect(formatCoordinate(-0.0001)).toBe('0.000')
    expect(formatCoordinate(-0)).toBe('0.000')
    expect(formatCoordinate(0)).toBe('0.000')
  })

  it('honours a decimal override', () => {
    expect(formatCoordinate(1.23456, 1)).toBe('1.2')
    expect(formatCoordinate(1.23456, 5)).toBe('1.23456')
  })
})

describe('coordinateRows', () => {
  it('emits one row per atom, in chain order', () => {
    const rows = coordinateRows(atoms)
    expect(rows).toHaveLength(atoms.length)
    // Alanine contributes a Cβ after its backbone; glycine contributes nothing.
    expect(rows.map((r) => r.atomName)).toEqual(['N', 'CA', 'C', 'O', 'CB', 'N', 'CA', 'C', 'O'])
    expect(rows.map((r) => r.residueNumber)).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2])
    expect(rows.map((r) => r.aminoAcid)).toEqual([
      'ALA', 'ALA', 'ALA', 'ALA', 'ALA', 'GLY', 'GLY', 'GLY', 'GLY',
    ])
  })

  it('reports the coordinates it is given, without transforming them', () => {
    const rows = coordinateRows(atoms)
    // N of residue 1 is at the canonical frame's origin.
    expect([rows[0]!.x, rows[0]!.y, rows[0]!.z]).toEqual(['0.000', '0.000', '0.000'])
  })

  it('reflects the current origin frame', () => {
    // Put Cα of residue 1 at the origin — the "pick" mode of the origin control.
    const ca1 = atoms[1]!.position
    const moved = applyToAtoms(frameOn(ca1, vec3(0, 0, 0), IDENTITY_QUAT), atoms)
    const rows = coordinateRows(moved)
    expect([rows[1]!.x, rows[1]!.y, rows[1]!.z]).toEqual(['0.000', '0.000', '0.000'])
    // ...and N is now off the origin, where it wasn't before.
    expect(rows[0]!.x).not.toBe('0.000')
  })

  it('uses display names', () => {
    expect(coordinateRows(atoms)[1]!.displayName).toBe('Cα')
  })

  it('handles an empty structure', () => {
    expect(coordinateRows([])).toEqual([])
  })
})
