/**
 * PDB-format text export.
 *
 * Pure and framework-free, like every other lib/ module: this only serializes
 * atoms that already exist, in the fixed-column ATOM record format every
 * PDB-consuming tool expects. No geometry, no rounding beyond the format's own
 * three-decimal coordinate precision, no filtering — the caller decides which
 * atoms to pass in, and every one of them is written.
 *
 * Deliberately does not emit a C-terminal OXT: lib/chain.ts never places one
 * (see logs.md, Stage 9, lib/formula.ts), so this serializer has no OXT
 * position to write. Inventing one here would mean guessing geometry this
 * module has no business guessing.
 */

import type { Atom, Residue } from './types.ts'

/** This project only ever builds one chain. */
const CHAIN_ID = 'A'

/** No per-atom occupancy or B-factor is modelled; every atom gets the same ones. */
const OCCUPANCY = 1.0
const TEMP_FACTOR = 0.0

function formatFixed(value: number, width: number, decimals: number): string {
  return value.toFixed(decimals).padStart(width)
}

/**
 * One ATOM record, 78 columns, matching the layout measured directly off
 * tests/fixtures/1UBQ.pdb (a real, independently-written PDB file) rather than
 * a from-memory guess at the spec.
 */
function formatAtomLine(atom: Atom, residue: Residue, serial: number): string {
  const record = 'ATOM'.padEnd(6)
  const serialField = String(serial).padStart(5)
  const atomName = (' ' + atom.name).padEnd(4)
  const altLoc = ' '
  const resName = residue.aminoAcid
  const chainId = CHAIN_ID
  const resSeq = String(atom.residueIndex + 1).padStart(4)
  const iCodeAndGap = '    '
  const x = formatFixed(atom.position.x, 8, 3)
  const y = formatFixed(atom.position.y, 8, 3)
  const z = formatFixed(atom.position.z, 8, 3)
  const occupancy = formatFixed(OCCUPANCY, 6, 2)
  const tempFactor = formatFixed(TEMP_FACTOR, 6, 2)
  const gap = ' '.repeat(10)
  const element = atom.element.padStart(2)

  return (
    record +
    serialField +
    ' ' +
    atomName +
    altLoc +
    resName +
    ' ' +
    chainId +
    resSeq +
    iCodeAndGap +
    x +
    y +
    z +
    occupancy +
    tempFactor +
    gap +
    element
  )
}

/**
 * Serialize a built structure to PDB text.
 *
 * `atoms` drives the output — every atom in it becomes one ATOM record, in the
 * order given, with a serial number sequential across the whole array. `residues`
 * is where the residue name comes from (`residues[atom.residueIndex].aminoAcid`),
 * read from the source of truth rather than each atom's own denormalized copy of
 * it. The residue sequence number is `atom.residueIndex + 1` — position in the
 * list, not `Residue.id`, which can have gaps after deletions.
 */
export function exportToPDB(atoms: readonly Atom[], residues: readonly Residue[]): string {
  const lines = atoms.map((atom, index) => {
    const residue = residues[atom.residueIndex]!
    return formatAtomLine(atom, residue, index + 1)
  })
  lines.push('END')
  return lines.join('\n') + '\n'
}
