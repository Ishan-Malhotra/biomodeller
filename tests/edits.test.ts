import { describe, expect, it } from 'vitest'

import { buildBackbone, firstChangedIndex, rebuildFrom, ATOMS_PER_RESIDUE } from '../lib/chain.ts'
import { OMEGA_TRANS } from '../lib/constants.ts'
import {
  appendResidue,
  DEFAULT_ANGLES,
  duplicateResidue,
  insertResidue,
  moveResidue,
  newResidue,
  nextResidueId,
  removeResidue,
  updateResidue,
  wrapDegrees,
} from '../lib/edits.ts'
import { distance } from '../lib/nerf.ts'
import type { Residue } from '../lib/types.ts'
import fixture from './fixtures/1ubq-backbone.json' with { type: 'json' }

/**
 * Tests for the editing operations that drive the residue list.
 *
 * The operations themselves are small enough to be obvious, so the weight of
 * this file is on the property that actually matters for correctness of the app:
 * for every edit, `rebuildFrom` at the index `firstChangedIndex` reports must
 * produce byte-identical geometry to `buildBackbone` from scratch. That is the
 * optimisation claude.md asks for, and it is exactly the kind of thing that can
 * be silently wrong — a too-high index yields a structure that is subtly stale
 * rather than one that visibly breaks.
 *
 * Edits are exercised against 1UBQ's real backbone angles, not synthetic ones,
 * so the reused prefixes are real conformations.
 */

/** 1UBQ's real backbone angles, as in tests/chain.test.ts. */
const ubiquitin: Residue[] = fixture.residues.map((r) => ({
  id: `ubq-${r.residueSeq}`,
  aminoAcid: r.residueName as Residue['aminoAcid'],
  phi: r.phi ?? 0,
  psi: r.psi ?? 0,
  omega: r.omega ?? 180,
}))

/** A short prefix, for tests where 76 residues would only slow things down. */
const short = ubiquitin.slice(0, 8)

/**
 * Apply an edit incrementally and from scratch, and assert the two agree.
 *
 * Also asserts the incremental path genuinely reused a prefix — otherwise a
 * `firstChangedIndex` that always returned 0 would pass every equality check
 * while quietly making the optimisation do nothing.
 */
function expectIncrementalMatchesFullRebuild(
  before: readonly Residue[],
  after: readonly Residue[],
  expectedReusedResidues: number,
): void {
  const previousAtoms = buildBackbone(before)
  const fromIndex = firstChangedIndex(before, after)
  const incremental = rebuildFrom(previousAtoms, after, fromIndex)
  const fromScratch = buildBackbone(after)

  expect(incremental).toHaveLength(fromScratch.length)
  incremental.forEach((atom, i) => {
    const expected = fromScratch[i]!
    expect(atom.name).toBe(expected.name)
    expect(atom.residueId).toBe(expected.residueId)
    expect(atom.residueIndex).toBe(expected.residueIndex)
    // Identical inputs through identical float operations: exact, not approximate.
    expect(atom.position).toEqual(expected.position)
  })

  expect(fromIndex).toBe(expectedReusedResidues)
  // The reused prefix must be the *same objects*, not equal copies — downstream
  // memoisation relies on reference identity to skip work.
  for (let i = 0; i < expectedReusedResidues * ATOMS_PER_RESIDUE; i++) {
    expect(incremental[i]).toBe(previousAtoms[i])
  }
}

describe('wrapDegrees', () => {
  it('leaves angles already in range alone', () => {
    for (const angle of [-179, -90, -0.5, 0, 57, 179.9, 180]) {
      expect(wrapDegrees(angle)).toBeCloseTo(angle, 10)
    }
  })

  it('wraps past the discontinuity', () => {
    expect(wrapDegrees(200)).toBeCloseTo(-160, 10)
    expect(wrapDegrees(-200)).toBeCloseTo(160, 10)
    expect(wrapDegrees(540)).toBeCloseTo(180, 10)
    expect(wrapDegrees(-540)).toBeCloseTo(180, 10)
  })

  it('normalises -180 to +180 so a trans bond reads by convention', () => {
    expect(wrapDegrees(-180)).toBe(180)
    expect(wrapDegrees(OMEGA_TRANS)).toBe(180)
  })

  it('is idempotent', () => {
    for (const angle of [0, 200, -733, 180, -180, 359.5]) {
      expect(wrapDegrees(wrapDegrees(angle))).toBe(wrapDegrees(angle))
    }
  })

  it('preserves the conformation it wraps', () => {
    // 200° and −160° are the same dihedral, so they must build the same atom.
    const at = (omega: number) =>
      buildBackbone([
        { id: 'a', aminoAcid: 'ALA', phi: -57, psi: -47, omega },
        { id: 'b', aminoAcid: 'ALA', phi: -57, psi: -47, omega: 180 },
      ])
    const wrapped = at(wrapDegrees(200))
    const raw = at(200)
    wrapped.forEach((atom, i) => {
      expect(distance(atom.position, raw[i]!.position)).toBeLessThan(1e-12)
    })
  })

  it('rejects non-finite input rather than producing NaN geometry', () => {
    expect(() => wrapDegrees(Number.NaN)).toThrow(/finite/)
    expect(() => wrapDegrees(Number.POSITIVE_INFINITY)).toThrow(/finite/)
  })
})

describe('nextResidueId', () => {
  it('starts at r1 on an empty list', () => {
    expect(nextResidueId([])).toBe('r1')
  })

  it('avoids every id present, including after deletions from the middle', () => {
    const ids = ['r1', 'r7', 'r3'].map((id) => ({ ...short[0]!, id }))
    expect(nextResidueId(ids)).toBe('r8')
  })

  it('does not reuse an id when appending repeatedly', () => {
    let residues: Residue[] = []
    for (let i = 0; i < 20; i++) residues = appendResidue(residues)
    expect(new Set(residues.map((r) => r.id)).size).toBe(20)
  })

  it('copes with ids that are not of the rN form', () => {
    const residues = [{ ...short[0]!, id: 'seed' }]
    expect(nextResidueId(residues)).toBe('r1')
  })
})

describe('newResidue', () => {
  it('defaults to helical angles so a new chain visibly curls', () => {
    const residue = newResidue([])
    expect(residue.phi).toBe(DEFAULT_ANGLES.phi)
    expect(residue.psi).toBe(DEFAULT_ANGLES.psi)
    expect(residue.omega).toBe(OMEGA_TRANS)
  })

  it('applies overrides', () => {
    expect(newResidue([], { aminoAcid: 'PRO', omega: 0 })).toMatchObject({
      aminoAcid: 'PRO',
      omega: 0,
    })
  })
})

describe('edit operations do not mutate their input', () => {
  const operations: Array<[string, (r: readonly Residue[]) => Residue[]]> = [
    ['appendResidue', (r) => appendResidue(r)],
    ['insertResidue', (r) => insertResidue(r, 2, newResidue(r))],
    ['duplicateResidue', (r) => duplicateResidue(r, 3)],
    ['removeResidue', (r) => removeResidue(r, 3)],
    ['updateResidue', (r) => updateResidue(r, 3, { phi: 60 })],
    ['moveResidue', (r) => moveResidue(r, 5, 1)],
  ]

  for (const [name, operation] of operations) {
    it(name, () => {
      const snapshot = structuredClone(short)
      operation(short)
      expect(short).toEqual(snapshot)
    })
  }
})

describe('insertResidue', () => {
  it('appends at length', () => {
    const residue = newResidue(short)
    expect(insertResidue(short, short.length, residue).at(-1)).toBe(residue)
  })

  it('shifts the rest toward the C-terminus', () => {
    const residue = newResidue(short)
    const result = insertResidue(short, 2, residue)
    expect(result).toHaveLength(short.length + 1)
    expect(result[2]).toBe(residue)
    expect(result[3]).toBe(short[2])
  })

  it('rejects an index past the end', () => {
    expect(() => insertResidue(short, short.length + 1, newResidue(short))).toThrow(/out of range/)
    expect(() => insertResidue(short, -1, newResidue(short))).toThrow(/out of range/)
  })
})

describe('removeResidue', () => {
  it('closes the gap', () => {
    const result = removeResidue(short, 2)
    expect(result).toHaveLength(short.length - 1)
    expect(result[2]).toBe(short[3])
  })

  it('empties a one-residue list back to the blank canvas', () => {
    expect(removeResidue([short[0]!], 0)).toEqual([])
  })

  it('rejects an index that addresses nothing', () => {
    expect(() => removeResidue(short, short.length)).toThrow(/no residue at index/)
    expect(() => removeResidue([], 0)).toThrow(/no residue at index/)
  })
})

describe('duplicateResidue', () => {
  it('copies angles and identity but not the id', () => {
    const result = duplicateResidue(short, 2)
    const [original, copy] = [result[2]!, result[3]!]
    expect(copy).toMatchObject({
      aminoAcid: original.aminoAcid,
      phi: original.phi,
      psi: original.psi,
      omega: original.omega,
    })
    expect(copy.id).not.toBe(original.id)
  })
})

describe('updateResidue', () => {
  it('wraps angles the user typed out of range', () => {
    const result = updateResidue(short, 1, { phi: 200, psi: -400 })
    expect(result[1]!.phi).toBeCloseTo(-160, 10)
    expect(result[1]!.psi).toBeCloseTo(-40, 10)
  })

  it('leaves other fields and other residues untouched', () => {
    const result = updateResidue(short, 1, { phi: -60 })
    expect(result[1]!.id).toBe(short[1]!.id)
    expect(result[1]!.aminoAcid).toBe(short[1]!.aminoAcid)
    expect(result[0]).toBe(short[0])
    expect(result[2]).toBe(short[2])
  })

  it('changes identity without changing angles', () => {
    const result = updateResidue(short, 1, { aminoAcid: 'TRP' })
    expect(result[1]!.aminoAcid).toBe('TRP')
    expect(result[1]!.phi).toBe(wrapDegrees(short[1]!.phi))
  })
})

describe('moveResidue', () => {
  it('moves a residue later, closing the gap behind it', () => {
    const result = moveResidue(short, 1, 4)
    const order = [0, 2, 3, 4, 1, 5, 6, 7].map((i) => short[i]!.id)
    expect(result.map((r) => r.id)).toEqual(order)
    expect(result).toHaveLength(short.length)
  })

  it('swaps with the neighbour above', () => {
    const result = moveResidue(short, 3, 2)
    expect(result[2]).toBe(short[3])
    expect(result[3]).toBe(short[2])
  })

  it('swaps with the neighbour below', () => {
    const result = moveResidue(short, 3, 4)
    expect(result[3]).toBe(short[4])
    expect(result[4]).toBe(short[3])
  })

  it('clamps instead of throwing, so holding the up arrow on row 1 is a no-op', () => {
    expect(moveResidue(short, 0, -1)).toEqual(short)
    expect(moveResidue(short, short.length - 1, short.length)).toEqual(short)
  })

  it('preserves the multiset of residues', () => {
    const result = moveResidue(ubiquitin, 40, 3)
    expect([...result].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...ubiquitin].sort((a, b) => a.id.localeCompare(b.id)),
    )
  })
})

describe('incremental rebuild matches a full rebuild', () => {
  it('for an append (reuses the whole existing chain)', () => {
    expectIncrementalMatchesFullRebuild(ubiquitin, appendResidue(ubiquitin), ubiquitin.length)
  })

  it('for an insert in the middle', () => {
    const after = insertResidue(ubiquitin, 30, newResidue(ubiquitin))
    expectIncrementalMatchesFullRebuild(ubiquitin, after, 30)
  })

  it('for an insert at the N-terminus, where residue 1 changes identity', () => {
    // The inserted residue becomes the seed frame and the old residue 1 is now
    // derived by NeRF — nothing can be reused, and the whole chain must move.
    const after = insertResidue(ubiquitin, 0, newResidue(ubiquitin))
    expectIncrementalMatchesFullRebuild(ubiquitin, after, 0)
    const before = buildBackbone(ubiquitin)
    const rebuilt = buildBackbone(after)
    expect(distance(rebuilt[4]!.position, before[0]!.position)).toBeGreaterThan(0.1)
  })

  it('for a deletion in the middle', () => {
    expectIncrementalMatchesFullRebuild(ubiquitin, removeResidue(ubiquitin, 20), 20)
  })

  it('for a deletion at the C-terminus (nothing downstream to redo)', () => {
    const last = ubiquitin.length - 1
    expectIncrementalMatchesFullRebuild(ubiquitin, removeResidue(ubiquitin, last), last)
  })

  it('for a duplication', () => {
    expectIncrementalMatchesFullRebuild(ubiquitin, duplicateResidue(ubiquitin, 10), 11)
  })

  it('for a phi change', () => {
    expectIncrementalMatchesFullRebuild(ubiquitin, updateResidue(ubiquitin, 15, { phi: 60 }), 15)
  })

  it('for a psi change', () => {
    expectIncrementalMatchesFullRebuild(ubiquitin, updateResidue(ubiquitin, 15, { psi: 120 }), 15)
  })

  it('for an omega change to cis', () => {
    expectIncrementalMatchesFullRebuild(ubiquitin, updateResidue(ubiquitin, 15, { omega: 0 }), 15)
  })

  it('for an amino-acid substitution, which moves no atom but re-emits them', () => {
    const after = updateResidue(ubiquitin, 15, { aminoAcid: 'TRP' })
    expectIncrementalMatchesFullRebuild(ubiquitin, after, 15)
    // Identity does not affect backbone geometry — only the labels change.
    const before = buildBackbone(ubiquitin)
    buildBackbone(after).forEach((atom, i) => {
      expect(atom.position).toEqual(before[i]!.position)
    })
  })

  it('for a reorder, detected at the first moved position', () => {
    expectIncrementalMatchesFullRebuild(ubiquitin, moveResidue(ubiquitin, 40, 12), 12)
  })

  it('for a neighbour swap', () => {
    expectIncrementalMatchesFullRebuild(ubiquitin, moveResidue(ubiquitin, 30, 29), 29)
  })

  it('for building a chain up one residue at a time from empty', () => {
    // The blank-canvas flow: every append must leave the existing structure
    // exactly where it was, or the viewport would jitter as the user types.
    let residues: Residue[] = []
    let atoms = buildBackbone(residues)
    for (let i = 0; i < 12; i++) {
      const next = appendResidue(residues, { phi: -57, psi: -47 })
      const fromIndex = firstChangedIndex(residues, next)
      expect(fromIndex).toBe(residues.length)
      const grown = rebuildFrom(atoms, next, fromIndex)
      // Every previously placed atom is still the same object in the same place.
      atoms.forEach((atom, j) => expect(grown[j]).toBe(atom))
      expect(grown).toEqual(buildBackbone(next))
      residues = next
      atoms = grown
    }
  })

  it('for a long random sequence of edits', () => {
    // A deterministic pseudo-random walk: many small edits compounding, which is
    // what real use looks like and where a stale-prefix bug would surface.
    let seed = 12345
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    let residues: Residue[] = [...short]
    let atoms = buildBackbone(residues)

    for (let step = 0; step < 200; step++) {
      const pick = Math.floor(random() * 5)
      const index = Math.floor(random() * Math.max(1, residues.length))
      let next = residues
      if (pick === 0 || residues.length === 0) {
        next = appendResidue(residues)
      } else if (pick === 1) {
        next = insertResidue(residues, index, newResidue(residues))
      } else if (pick === 2 && residues.length > 1) {
        next = removeResidue(residues, index)
      } else if (pick === 3) {
        next = updateResidue(residues, index, { phi: random() * 720 - 360 })
      } else if (residues.length > 1) {
        next = moveResidue(residues, index, Math.floor(random() * residues.length))
      }

      const fromIndex = firstChangedIndex(residues, next)
      atoms = rebuildFrom(atoms, next, fromIndex)
      residues = next
      expect(atoms).toEqual(buildBackbone(residues))
    }
    expect(residues.length).toBeGreaterThan(0)
  })
})
