import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { buildAtoms } from '../lib/chain.ts'
import { chiFor } from '../lib/edits.ts'
import { exportToPDB } from '../lib/pdbExport.ts'
import { SIDE_CHAIN_TOPOLOGY } from '../lib/sidechainTopology.ts'
import type { Residue } from '../lib/types.ts'
import fixture from './fixtures/1ubq-backbone.json' with { type: 'json' }

/**
 * exportToPDB tests, in the two tiers the geometry tests already use (see
 * tests/nerf.test.ts): a round trip through the format can be self-consistent
 * and still misaligned, so the format itself is checked separately against a
 * real, independently-written PDB file.
 */

/** 1UBQ's real backbone angles as a Residue[] — same shape tests/chain.test.ts uses. */
const ubiquitin: Residue[] = fixture.residues.map((r) => ({
  id: `ubq-${r.residueSeq}`,
  aminoAcid: r.residueName as Residue['aminoAcid'],
  phi: r.phi ?? 0,
  psi: r.psi ?? 0,
  omega: r.omega ?? 180,
  chi: chiFor(r.residueName as Residue['aminoAcid']),
}))

// --- A small local parser, independent of exportToPDB's own formatting code ---

interface ParsedAtomLine {
  record: string
  serial: number
  atomName: string
  altLoc: string
  resName: string
  chainId: string
  resSeq: number
  x: number
  y: number
  z: number
  occupancy: number
  tempFactor: number
  element: string
}

function parseAtomLine(line: string): ParsedAtomLine {
  return {
    record: line.slice(0, 6),
    serial: Number.parseInt(line.slice(6, 11), 10),
    atomName: line.slice(12, 16).trim(),
    altLoc: line[16]!,
    resName: line.slice(17, 20).trim(),
    chainId: line[21]!,
    resSeq: Number.parseInt(line.slice(22, 26), 10),
    x: Number.parseFloat(line.slice(30, 38)),
    y: Number.parseFloat(line.slice(38, 46)),
    z: Number.parseFloat(line.slice(46, 54)),
    occupancy: Number.parseFloat(line.slice(54, 60)),
    tempFactor: Number.parseFloat(line.slice(60, 66)),
    element: line.slice(76, 78).trim(),
  }
}

describe('exportToPDB — round-trip correctness', () => {
  const atoms = buildAtoms(ubiquitin)
  const text = exportToPDB(atoms, ubiquitin)
  const lines = text.split('\n').filter((line) => line.length > 0)
  const atomLines = lines.filter((line) => line.startsWith('ATOM'))

  it('emits exactly one ATOM line per atom, terminated by END', () => {
    expect(atomLines).toHaveLength(atoms.length)
    expect(lines[lines.length - 1]).toBe('END')
  })

  it('round-trips every coordinate to the format precision (3 decimals)', () => {
    for (const [i, line] of atomLines.entries()) {
      const parsed = parseAtomLine(line)
      const atom = atoms[i]!
      expect(parsed.x).toBeCloseTo(atom.position.x, 3)
      expect(parsed.y).toBeCloseTo(atom.position.y, 3)
      expect(parsed.z).toBeCloseTo(atom.position.z, 3)
    }
  })

  it('numbers serials sequentially from 1, regardless of backbone/side-chain mix', () => {
    const serials = atomLines.map((line) => parseAtomLine(line).serial)
    expect(serials).toEqual(Array.from({ length: atoms.length }, (_, i) => i + 1))
  })

  it('takes the residue sequence number from list position, not Residue.id', () => {
    for (const [i, line] of atomLines.entries()) {
      const parsed = parseAtomLine(line)
      const atom = atoms[i]!
      expect(parsed.resSeq).toBe(atom.residueIndex + 1)
    }
  })

  it('follows list position even when ids have gaps after deletion', () => {
    // Ids that skip a number, as a real residue list does after removing one.
    const gappy: Residue[] = [
      { id: 'r1', aminoAcid: 'ALA', phi: -57, psi: -47, omega: 180, chi: [] },
      { id: 'r5', aminoAcid: 'GLY', phi: -57, psi: -47, omega: 180, chi: [] },
      { id: 'r9', aminoAcid: 'SER', phi: -57, psi: -47, omega: 180, chi: [] },
    ]
    const gappyAtoms = buildAtoms(gappy)
    const gappyText = exportToPDB(gappyAtoms, gappy)
    const gappyLines = gappyText.split('\n').filter((line) => line.startsWith('ATOM'))
    for (const [i, line] of gappyLines.entries()) {
      const atom = gappyAtoms[i]!
      expect(parseAtomLine(line).resSeq).toBe(atom.residueIndex + 1)
    }
    // In particular: none of the exported resSeq values are 5 or 9, the numbers
    // baked into the ids — position (1, 2, 3) is what must appear, and every
    // value present is one of those three.
    const resSeqs = new Set(gappyLines.map((line) => parseAtomLine(line).resSeq))
    expect(resSeqs).toEqual(new Set([1, 2, 3]))
  })

  it('exports every atom of a ring-containing residue (tryptophan)', () => {
    const trp: Residue[] = [{ id: 'r1', aminoAcid: 'TRP', phi: -57, psi: -47, omega: 180, chi: [] }]
    const trpAtoms = buildAtoms(trp)
    const trpText = exportToPDB(trpAtoms, trp)
    const trpLines = trpText.split('\n').filter((line) => line.startsWith('ATOM'))

    const expectedSideChainNames = SIDE_CHAIN_TOPOLOGY.TRP!.atoms.map((atom) => atom.name)
    expect(expectedSideChainNames).toHaveLength(10)

    const exportedNames = trpLines.map((line) => parseAtomLine(line).atomName)
    expect(exportedNames).toEqual(['N', 'CA', 'C', 'O', ...expectedSideChainNames])
  })

  it('emits just an END record for an empty structure', () => {
    expect(exportToPDB([], [])).toBe('END\n')
  })
})

describe('exportToPDB — byte-level format, checked against a real PDB file', () => {
  const HERE = dirname(fileURLToPath(import.meta.url))
  const realText = readFileSync(resolve(HERE, 'fixtures/1UBQ.pdb'), 'utf-8')
  const realLines = realText.split('\n').filter((line) => line.startsWith('ATOM'))

  /** The first real ATOM line naming `resSeq` and `atomName` exactly. */
  function realLine(resSeq: number, atomName: string): string {
    const line = realLines.find((candidate) => {
      const parsed = parseAtomLine(candidate)
      return parsed.resSeq === resSeq && parsed.atomName === atomName
    })
    if (!line) throw new Error(`No real ATOM line for residue ${resSeq} atom ${atomName}.`)
    return line
  }

  const atoms = buildAtoms(ubiquitin)
  const text = exportToPDB(atoms, ubiquitin)
  const exportedLines = text.split('\n').filter((line) => line.startsWith('ATOM'))

  /** The exported line for a given (1-based residue, atom name) pair. */
  function exportedLine(resSeq: number, atomName: string): string {
    const line = exportedLines.find((candidate) => {
      const parsed = parseAtomLine(candidate)
      return parsed.resSeq === resSeq && parsed.atomName === atomName
    })
    if (!line) throw new Error(`No exported ATOM line for residue ${resSeq} atom ${atomName}.`)
    return line
  }

  const cases: Array<[number, string]> = [
    [1, 'N'], // Met1 backbone
    [1, 'CA'],
    [1, 'CB'], // a side-chain atom
    [76, 'N'], // near the end of the sequence
    [76, 'CA'],
    [76, 'C'],
    [76, 'O'],
  ]

  it.each(cases)('matches the real file\'s column layout for residue %i atom %s', (resSeq, atomName) => {
    const real = realLine(resSeq, atomName)
    const exported = exportedLine(resSeq, atomName)

    // Columns that don't depend on the coordinate values: byte-identical.
    expect(exported.slice(0, 6)).toBe(real.slice(0, 6)) // record type
    expect(exported.slice(11, 16)).toBe(real.slice(11, 16)) // gap + atom name field
    expect(exported[16]).toBe(real[16]) // altLoc, blank
    expect(exported.slice(17, 20)).toBe(real.slice(17, 20)) // residue name
    expect(exported[20]).toBe(real[20]) // blank
    expect(exported[21]).toBe(real[21]) // chain id
    expect(exported.slice(26, 30)).toBe(real.slice(26, 30)) // iCode + gap
    expect(exported.slice(66, 76)).toBe(real.slice(66, 76)) // trailing gap

    // Numeric columns: same field width and shape, not the same value — our
    // coordinates are a NeRF reconstruction from ideal geometry, not the
    // deposited structure.
    expect(exported.slice(30, 38)).toHaveLength(8)
    expect(real.slice(30, 38)).toHaveLength(8)
    expect(exported.slice(30, 38)).toMatch(/^\s*-?\d+\.\d{3}$/)
    expect(exported.slice(38, 46)).toMatch(/^\s*-?\d+\.\d{3}$/)
    expect(exported.slice(46, 54)).toMatch(/^\s*-?\d+\.\d{3}$/)
    expect(exported.slice(54, 60)).toHaveLength(6)
    expect(exported.slice(54, 60)).toMatch(/^\s*\d+\.\d{2}$/)
    expect(exported.slice(60, 66)).toHaveLength(6)
    expect(exported.slice(60, 66)).toMatch(/^\s*\d+\.\d{2}$/)

    // Element: right-justified single letter, same shape as the real file's.
    expect(exported.slice(76, 78)).toMatch(/^\s?[A-Z]$/)
    expect(real.slice(76, 78)).toMatch(/^\s?[A-Z]$/)
  })
})
