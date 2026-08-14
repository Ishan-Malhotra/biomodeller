/**
 * The app's single piece of state: the residue list, plus the atoms derived from
 * it.
 *
 * `residues` is the source of truth and the only thing `useState` holds. `atoms`
 * is derived on every change and never settable — there is deliberately no
 * `setAtoms`, because an editable Cartesian coordinate is exactly the thing
 * claude.md forbids. The cache below is a memoisation detail, not a second copy
 * of the truth: throw it away and the next render reproduces it exactly.
 *
 * The derivation is incremental. Residue i's position depends on every residue
 * before it, so an edit at index i invalidates the suffix from i onward and
 * nothing before it. `firstChangedIndex` finds that index by comparing the
 * previous residue list to the new one, and `rebuildChainFrom` reuses the untouched
 * prefix *by reference*. Two things follow, both of which matter to the feel of the
 * app: long chains stay responsive keystroke-to-keystroke, and the part of the
 * structure the user didn't touch is byte-identical rather than recomputed to the
 * same value, so nothing shimmers as they type.
 *
 * The cache holds the per-residue groups, and the flat `atoms` array is flattened
 * from them. Flattening allocates a new array each render pass, but the `Atom`
 * objects inside it are the same ones — which is the identity the renderer and the
 * origin transform actually key on.
 *
 * Deriving the index from the two lists rather than having each edit declare it
 * is a deliberate trade. It costs an O(i) comparison and it means no editing
 * operation can get the invalidation boundary wrong — including reorders, where
 * the boundary is not the row the user dragged.
 */

import { useMemo, useRef, useState } from 'react'

import { firstChangedIndex, flattenAtoms, rebuildChainFrom, type ResidueAtoms } from '../lib/chain.ts'
import {
  appendResidue,
  duplicateResidue,
  insertResidue,
  moveResidue,
  newResidue,
  removeResidue,
  updateResidue,
} from '../lib/edits.ts'
import type { Atom, Residue } from '../lib/types.ts'

/**
 * What the last derivation actually did.
 *
 * Exposed because it is the most direct evidence that the suffix optimisation is
 * real, and product.md §3 asks for a "show your work" surface for grading. It is
 * a readout, not state anything depends on.
 */
export interface RebuildStats {
  /** First residue index recomputed. Equals `total` when nothing changed. */
  readonly fromIndex: number
  readonly reused: number
  readonly recomputed: number
  readonly total: number
}

export interface ChainEditor {
  readonly residues: readonly Residue[]
  /** Derived from `residues`. Never stored as independently-editable state. */
  readonly atoms: readonly Atom[]
  readonly stats: RebuildStats
  /** Append a residue with default angles to the C-terminal end. */
  readonly add: () => void
  readonly insertAfter: (index: number) => void
  readonly duplicate: (index: number) => void
  readonly remove: (index: number) => void
  readonly update: (index: number, patch: Partial<Omit<Residue, 'id'>>) => void
  readonly move: (index: number, to: number) => void
  /** Load a whole chain at once, e.g. an example. */
  readonly replaceAll: (residues: readonly Residue[]) => void
  readonly clear: () => void
}

interface Cache {
  residues: readonly Residue[]
  groups: readonly ResidueAtoms[]
  atoms: readonly Atom[]
  fromIndex: number
}

export function useChain(initial: readonly Residue[] = []): ChainEditor {
  const [residues, setResidues] = useState<readonly Residue[]>(initial)
  const cache = useRef<Cache>({ residues: [], groups: [], atoms: [], fromIndex: 0 })

  const { atoms, fromIndex } = useMemo(() => {
    // Same list as last time — including React re-invoking this memo in
    // StrictMode — must return the same atoms, not a re-derived copy.
    if (cache.current.residues === residues) {
      return { atoms: cache.current.atoms, fromIndex: cache.current.fromIndex }
    }
    const from = firstChangedIndex(cache.current.residues, residues)
    const groups = rebuildChainFrom(cache.current.groups, residues, from)
    const next = flattenAtoms(groups)
    cache.current = { residues, groups, atoms: next, fromIndex: from }
    return { atoms: next, fromIndex: from }
  }, [residues])

  // Every action is the pure operation from lib/edits.ts lifted into a functional
  // update, so this object never depends on the current residue list and stays
  // referentially stable across edits.
  const actions = useMemo(
    () => ({
      add: () => setResidues((current) => appendResidue(current)),
      insertAfter: (index: number) =>
        setResidues((current) => insertResidue(current, index + 1, newResidue(current))),
      duplicate: (index: number) => setResidues((current) => duplicateResidue(current, index)),
      remove: (index: number) => setResidues((current) => removeResidue(current, index)),
      update: (index: number, patch: Partial<Omit<Residue, 'id'>>) =>
        setResidues((current) => updateResidue(current, index, patch)),
      move: (index: number, to: number) => setResidues((current) => moveResidue(current, index, to)),
      replaceAll: (next: readonly Residue[]) => setResidues([...next]),
      clear: () => setResidues([]),
    }),
    [],
  )

  const stats = useMemo<RebuildStats>(
    () => ({
      fromIndex,
      reused: Math.min(fromIndex, residues.length),
      recomputed: Math.max(0, residues.length - fromIndex),
      total: residues.length,
    }),
    [fromIndex, residues.length],
  )

  return { residues, atoms, stats, ...actions }
}
