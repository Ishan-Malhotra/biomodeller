/**
 * Regenerates tests/fixtures/4lzt-sidechains.json from the committed 4LZT.pdb.
 *
 *   npm run fixture:sidechains
 *
 * 4LZT is hen egg-white lysozyme at 0.95 Å (Walsh et al., 1998). Two reasons for
 * this structure specifically:
 *
 *  1. It contains all 20 standard amino acids, which 1UBQ does not — 1UBQ has no
 *     cysteine and no tryptophan, so it cannot validate those two side chains.
 *  2. At 0.95 Å the geometry is tight enough to be a reference: bond lengths
 *     scatter by ~0.01–0.03 Å. The obvious alternative, 1LYZ, is a 1975
 *     real-space refinement at 2.0 Å whose bond lengths scatter by ±0.18 Å — the
 *     measurement error there is an order of magnitude larger than the effect
 *     being measured, so it was rejected after being tried.
 *
 * What this emits, per side-chain atom, is the deposited position, the three
 * already-placed atoms it is built from (derived from the bond graph in
 * lib/sidechainTopology.ts, never hand-listed), and its internal coordinates
 * *measured from that structure*. Feeding those measured internals back through
 * placeAtom must reproduce the deposited coordinates — which is what validates the
 * topology for all 20 residues.
 *
 * It also emits a robust statistical summary (median, MAD, n) per atom type, which
 * tests/sidechains.test.ts uses to bound how far the idealised constants in
 * lib/constants.ts sit from real geometry. Medians rather than means: one
 * disordered arginine in this structure has a Cζ bond angle of 172° against a
 * cluster at 122–136°, and a mean would carry that outlier into the reference.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { bondAngle, dihedral, distance, normalizeDegrees, type Vec3 } from '../lib/nerf.ts'
import { sideChainPlacements } from '../lib/sidechains.ts'
import { SIDE_CHAIN_TOPOLOGY } from '../lib/sidechainTopology.ts'
import type { AminoAcidCode } from '../lib/types.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const PDB_PATH = resolve(HERE, '../tests/fixtures/4LZT.pdb')
const OUT_PATH = resolve(HERE, '../tests/fixtures/4lzt-sidechains.json')
const CHAIN_ID = 'A'

// --- PDB parsing -----------------------------------------------------------
// Same fixed-width columns as scripts/build-fixture.ts: name 13-16, altLoc 17,
// resName 18-20, chainID 22, resSeq 23-26, x/y/z 31-38/39-46/47-54 (1-indexed).

interface ParsedResidue {
  residueSeq: number
  residueName: string
  atoms: Map<string, Vec3>
}

function parseResidues(pdbText: string): ParsedResidue[] {
  const byResidue = new Map<number, ParsedResidue>()

  for (const line of pdbText.split('\n')) {
    if (!line.startsWith('ATOM')) continue
    if (line.slice(21, 22) !== CHAIN_ID) continue

    // Skip alternate conformations other than the first.
    const altLoc = line.slice(16, 17)
    if (altLoc !== ' ' && altLoc !== 'A') continue

    const name = line.slice(12, 16).trim()
    // Heavy atoms only. At 0.95 A this file has riding hydrogens, which this
    // project does not model.
    if (name.startsWith('H') || name.startsWith('D')) continue

    const residueSeq = Number.parseInt(line.slice(22, 26).trim(), 10)
    let residue = byResidue.get(residueSeq)
    if (!residue) {
      residue = { residueSeq, residueName: line.slice(17, 20).trim(), atoms: new Map() }
      byResidue.set(residueSeq, residue)
    }
    residue.atoms.set(name, {
      x: Number.parseFloat(line.slice(30, 38)),
      y: Number.parseFloat(line.slice(38, 46)),
      z: Number.parseFloat(line.slice(46, 54)),
    })
  }

  return [...byResidue.values()].sort((a, b) => a.residueSeq - b.residueSeq)
}

// --- measurement -----------------------------------------------------------

interface FixtureSideChainAtom {
  name: string
  /** The three prior atoms, by name, in NeRF (a, b, c) order. */
  refs: [string, string, string]
  position: Vec3
  /** Measured from the deposited coordinates, not idealised. */
  internal: { bondLength: number; bondAngleDeg: number; dihedralDeg: number }
}

interface FixtureResidue {
  residueSeq: number
  residueName: string
  /** Backbone positions, needed to place Cβ and to define χ1. */
  backbone: { N: Vec3; CA: Vec3; C: Vec3; O: Vec3 }
  sideChain: FixtureSideChainAtom[]
  /** χ1… measured from the deposited coordinates. */
  chi: number[]
  /** True when every heavy atom the topology expects is present. */
  complete: boolean
}

function measureResidue(residue: ParsedResidue): FixtureResidue | null {
  const code = residue.residueName as AminoAcidCode
  const topology = SIDE_CHAIN_TOPOLOGY[code]
  if (!topology) return null

  const { N, CA, C, O } = {
    N: residue.atoms.get('N'),
    CA: residue.atoms.get('CA'),
    C: residue.atoms.get('C'),
    O: residue.atoms.get('O'),
  }
  if (!N || !CA || !C || !O) return null

  const sideChain: FixtureSideChainAtom[] = []
  let complete = true

  for (const placement of sideChainPlacements(code)) {
    const own = residue.atoms.get(placement.name)
    const [aName, bName, cName] = placement.refs
    const a = residue.atoms.get(aName)
    const b = residue.atoms.get(bName)
    const c = residue.atoms.get(cName)
    if (!own || !a || !b || !c) {
      complete = false
      continue
    }
    sideChain.push({
      name: placement.name,
      refs: [aName, bName, cName],
      position: own,
      internal: {
        bondLength: distance(c, own),
        bondAngleDeg: bondAngle(b, c, own),
        dihedralDeg: dihedral(a, b, c, own),
      },
    })
  }

  const chi: number[] = []
  for (const quad of topology.chi) {
    const points = quad.map((name) => residue.atoms.get(name))
    if (points.some((p) => !p)) {
      complete = false
      break
    }
    const [p, q, r, s] = points as [Vec3, Vec3, Vec3, Vec3]
    chi.push(dihedral(p, q, r, s))
  }

  return { residueSeq: residue.residueSeq, residueName: code, backbone: { N, CA, C, O }, sideChain, chi, complete }
}

// --- robust statistics -----------------------------------------------------

const median = (values: number[]): number => {
  const sorted = [...values].sort((x, y) => x - y)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

/** Median absolute deviation — a spread measure one outlier cannot inflate. */
const mad = (values: number[]): number => {
  const m = median(values)
  return median(values.map((v) => Math.abs(v - m)))
}

/** Median of a set of angles, taken on the circle so ±180 doesn't split. */
const circularMedian = (degrees: number[]): number => {
  const reference = degrees[0]!
  const unwrapped = degrees.map((d) => reference + normalizeDegrees(d - reference))
  return normalizeDegrees(median(unwrapped))
}

interface AtomStats {
  n: number
  lengthMedian: number
  lengthMad: number
  angleMedian: number
  angleMad: number
  dihedralMedian: number
}

function summarise(residues: FixtureResidue[]): Record<string, AtomStats> {
  const buckets = new Map<string, { length: number[]; angle: number[]; dihedral: number[] }>()

  for (const residue of residues) {
    for (const atom of residue.sideChain) {
      const key = `${residue.residueName}.${atom.name}`
      const bucket = buckets.get(key) ?? { length: [], angle: [], dihedral: [] }
      bucket.length.push(atom.internal.bondLength)
      bucket.angle.push(atom.internal.bondAngleDeg)
      bucket.dihedral.push(atom.internal.dihedralDeg)
      buckets.set(key, bucket)
    }
  }

  const out: Record<string, AtomStats> = {}
  for (const [key, bucket] of [...buckets.entries()].sort()) {
    out[key] = {
      n: bucket.length.length,
      lengthMedian: median(bucket.length),
      lengthMad: mad(bucket.length),
      angleMedian: median(bucket.angle),
      angleMad: mad(bucket.angle),
      dihedralMedian: circularMedian(bucket.dihedral),
    }
  }
  return out
}

// --- entry point -----------------------------------------------------------

const parsed = parseResidues(readFileSync(PDB_PATH, 'utf8'))
const measured = parsed.map(measureResidue).filter((r): r is FixtureResidue => r !== null)
const complete = measured.filter((r) => r.complete)

if (complete.length === 0) {
  throw new Error(`No complete residues parsed from ${PDB_PATH}.`)
}

const presentCodes = [...new Set(complete.map((r) => r.residueName))].sort()

const fixture = {
  source: {
    pdbId: '4LZT',
    description: 'Hen egg-white lysozyme, 0.95 A X-ray (Walsh, Schneider, Sieker, Dauter, Lamzin & Wilson, 1998)',
    chain: CHAIN_ID,
    url: 'https://files.rcsb.org/download/4LZT.pdb',
    generatedBy: 'scripts/build-sidechain-fixture.ts (npm run fixture:sidechains)',
    note:
      'Coordinates are as deposited; hydrogens and alternate conformations are dropped. ' +
      'Internal coordinates are measured from the deposited positions, not idealised. ' +
      'Reference triples come from the bond graph in lib/sidechainTopology.ts.',
    aminoAcidsPresent: presentCodes,
  },
  residueCount: complete.length,
  /** Per-atom-type robust summary, for bounding the idealised constants. */
  statistics: summarise(complete),
  residues: complete,
}

writeFileSync(OUT_PATH, `${JSON.stringify(fixture, null, 2)}\n`)

const sideChainAtoms = complete.reduce((sum, r) => sum + r.sideChain.length, 0)
console.log(
  `Wrote ${OUT_PATH}: ${complete.length} complete residues covering ${presentCodes.length} ` +
    `amino acids, ${sideChainAtoms} side-chain atoms ` +
    `(${measured.length - complete.length} residues incomplete and skipped).`,
)
