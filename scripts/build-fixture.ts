/**
 * Regenerates tests/fixtures/1ubq-backbone.json from the committed 1UBQ.pdb.
 *
 *   npm run fixture
 *
 * The tests never run this and never touch the network — they read the checked-in
 * JSON. This script exists so the fixture's provenance from the real deposited
 * structure is auditable and reproducible, rather than hand-transcribed.
 *
 * What it emits, per backbone atom, is both the deposited Cartesian position and
 * the internal coordinates *measured from that structure* (its real bond length,
 * bond angle and dihedral relative to three earlier atoms). Feeding those
 * measured internals back through placeAtom must reproduce the deposited
 * coordinates exactly — that is the primary correctness test for the NeRF math.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { bondAngle, dihedral, distance, type Vec3 } from '../lib/nerf.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const PDB_PATH = resolve(HERE, '../tests/fixtures/1UBQ.pdb')
const OUT_PATH = resolve(HERE, '../tests/fixtures/1ubq-backbone.json')
const CHAIN_ID = 'A'

/** Backbone atoms in the order this project places them within a residue. */
type BackboneName = 'N' | 'CA' | 'C' | 'O'

interface ParsedAtom {
  name: BackboneName
  residueSeq: number
  residueName: string
  position: Vec3
}

interface ParsedResidue {
  residueSeq: number
  residueName: string
  atoms: Record<BackboneName, Vec3>
}

// --- PDB parsing -----------------------------------------------------------
// Columns are fixed-width per the PDB format spec (v3.30), not whitespace-
// delimited: name 13-16, altLoc 17, resName 18-20, chainID 22, resSeq 23-26,
// x/y/z 31-38/39-46/47-54 (1-indexed, inclusive).

function parseBackboneAtoms(pdbText: string): ParsedAtom[] {
  const atoms: ParsedAtom[] = []

  for (const line of pdbText.split('\n')) {
    if (!line.startsWith('ATOM')) continue
    if (line.slice(21, 22) !== CHAIN_ID) continue

    // Skip alternate conformations other than the first.
    const altLoc = line.slice(16, 17)
    if (altLoc !== ' ' && altLoc !== 'A') continue

    const name = line.slice(12, 16).trim()
    if (name !== 'N' && name !== 'CA' && name !== 'C' && name !== 'O') continue

    atoms.push({
      name,
      residueSeq: Number.parseInt(line.slice(22, 26).trim(), 10),
      residueName: line.slice(17, 20).trim(),
      position: {
        x: Number.parseFloat(line.slice(30, 38)),
        y: Number.parseFloat(line.slice(38, 46)),
        z: Number.parseFloat(line.slice(46, 54)),
      },
    })
  }

  return atoms
}

/**
 * Group atoms into residues, keeping only residues with a complete N/CA/C/O set
 * and only the leading run of residues that are consecutively numbered — a
 * chain break would make the peptide-bond internal coordinates meaningless.
 */
function toResidues(atoms: ParsedAtom[]): ParsedResidue[] {
  const byResidue = new Map<number, Partial<Record<BackboneName, Vec3>> & { residueName?: string }>()

  for (const atom of atoms) {
    const entry = byResidue.get(atom.residueSeq) ?? {}
    entry[atom.name] = atom.position
    entry.residueName = atom.residueName
    byResidue.set(atom.residueSeq, entry)
  }

  const residues: ParsedResidue[] = []
  for (const [residueSeq, entry] of [...byResidue.entries()].sort((a, b) => a[0] - b[0])) {
    const { N, CA, C, O, residueName } = entry
    if (!N || !CA || !C || !O || !residueName) continue

    const previous = residues[residues.length - 1]
    if (previous && residueSeq !== previous.residueSeq + 1) break

    residues.push({ residueSeq, residueName, atoms: { N, CA, C, O } })
  }

  return residues
}

// --- Build-order flattening ------------------------------------------------

interface FixtureAtom {
  /** Index into this same array; stable, and what `parents` refers to. */
  index: number
  name: BackboneName
  residueIndex: number
  residueSeq: number
  residueName: string
  /** Deposited coordinates, straight from the PDB. */
  position: Vec3
  /**
   * The three already-placed atoms this one is built from, in NeRF (a, b, c)
   * order. Null for the three seed atoms, which have no predecessors.
   */
  parents: [number, number, number] | null
  /** Internal coordinates measured from the deposited structure. */
  internal: { bondLength: number; bondAngleDeg: number; dihedralDeg: number } | null
}

/**
 * Flatten residues into placement order: N, CA, C for each residue in sequence,
 * with each residue's O hung off its own (N, CA, C).
 *
 * The main chain walks N(i) -> CA(i) -> C(i) -> N(i+1) -> ..., so every main-chain
 * atom's parents are simply the three main-chain atoms before it. O is a branch:
 * it is not a parent of anything, and its own parents are N(i), CA(i), C(i).
 */
function buildFixtureAtoms(residues: ParsedResidue[]): FixtureAtom[] {
  const out: FixtureAtom[] = []
  const mainChain: number[] = [] // indices into `out`, in main-chain order

  const push = (
    name: BackboneName,
    residueIndex: number,
    residue: ParsedResidue,
    parents: [number, number, number] | null,
  ): number => {
    const index = out.length
    out.push({
      index,
      name,
      residueIndex,
      residueSeq: residue.residueSeq,
      residueName: residue.residueName,
      position: residue.atoms[name],
      parents,
      internal: null,
    })
    return index
  }

  residues.forEach((residue, residueIndex) => {
    for (const name of ['N', 'CA', 'C'] as const) {
      const parents =
        mainChain.length >= 3
          ? ([
              mainChain[mainChain.length - 3],
              mainChain[mainChain.length - 2],
              mainChain[mainChain.length - 1],
            ] as [number, number, number])
          : null
      mainChain.push(push(name, residueIndex, residue, parents))
    }

    // O branches off this residue's own N, CA, C — the three entries just pushed.
    const [nIndex, caIndex, cIndex] = mainChain.slice(-3) as [number, number, number]
    push('O', residueIndex, residue, [nIndex, caIndex, cIndex])
  })

  return out
}

function measureInternals(atoms: FixtureAtom[]): void {
  for (const atom of atoms) {
    if (!atom.parents) continue
    const [ai, bi, ci] = atom.parents
    const a = atoms[ai]!.position
    const b = atoms[bi]!.position
    const c = atoms[ci]!.position
    atom.internal = {
      bondLength: distance(c, atom.position),
      bondAngleDeg: bondAngle(b, c, atom.position),
      dihedralDeg: dihedral(a, b, c, atom.position),
    }
  }
}

// --- Backbone dihedrals ----------------------------------------------------

interface FixtureResidue {
  residueIndex: number
  residueSeq: number
  residueName: string
  /** C(i-1)-N(i)-CA(i)-C(i); null for the N-terminal residue. */
  phi: number | null
  /** N(i)-CA(i)-C(i)-N(i+1); null for the C-terminal residue. */
  psi: number | null
  /** CA(i)-C(i)-N(i+1)-CA(i+1); null for the C-terminal residue. */
  omega: number | null
}

function measureBackboneDihedrals(residues: ParsedResidue[]): FixtureResidue[] {
  return residues.map((residue, i) => {
    const previous = residues[i - 1]
    const next = residues[i + 1]
    return {
      residueIndex: i,
      residueSeq: residue.residueSeq,
      residueName: residue.residueName,
      phi: previous
        ? dihedral(previous.atoms.C, residue.atoms.N, residue.atoms.CA, residue.atoms.C)
        : null,
      psi: next
        ? dihedral(residue.atoms.N, residue.atoms.CA, residue.atoms.C, next.atoms.N)
        : null,
      omega: next
        ? dihedral(residue.atoms.CA, residue.atoms.C, next.atoms.N, next.atoms.CA)
        : null,
    }
  })
}

// --- Entry point -----------------------------------------------------------

const pdbText = readFileSync(PDB_PATH, 'utf8')
const residues = toResidues(parseBackboneAtoms(pdbText))
if (residues.length === 0) {
  throw new Error(`No complete backbone residues parsed from ${PDB_PATH}.`)
}

const atoms = buildFixtureAtoms(residues)
measureInternals(atoms)

const fixture = {
  source: {
    pdbId: '1UBQ',
    description: 'Ubiquitin, 1.8 A X-ray (Vijay-Kumar, Bugg & Cook, 1987)',
    chain: CHAIN_ID,
    url: 'https://files.rcsb.org/download/1UBQ.pdb',
    generatedBy: 'scripts/build-fixture.ts (npm run fixture)',
    note: 'Coordinates are as deposited. Internal coordinates are measured from them, not idealized.',
  },
  residueCount: residues.length,
  residues: measureBackboneDihedrals(residues),
  atoms,
}

writeFileSync(OUT_PATH, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(
  `Wrote ${OUT_PATH}: ${residues.length} residues, ${atoms.length} backbone atoms ` +
    `(${residues[0]!.residueSeq}-${residues[residues.length - 1]!.residueSeq}).`,
)
