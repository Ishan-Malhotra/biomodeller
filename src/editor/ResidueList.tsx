/**
 * The Desmos-style expression list: one row per residue, live-updating, opening
 * on a blank canvas.
 *
 * There is no "generate" or "submit" control anywhere in here by design
 * (product.md §5.1). Adding a row extends the structure; typing in a field bends
 * it. Enter adds a row below the one being edited and moves the cursor there, so
 * a chain can be built without touching the mouse.
 */

import { useCallback, useEffect, useState } from 'react'

import type { Residue } from '../../lib/types.ts'
import type { ChainEditor } from '../useChain.ts'
import { ResidueRow } from './ResidueRow.tsx'

export function ResidueList({ editor }: { editor: ChainEditor }) {
  const { residues } = editor
  /** Index of a row created just now, which should receive the cursor. */
  const [focusIndex, setFocusIndex] = useState<number | null>(null)

  // Consume the focus request after one render. Child effects run before parent
  // effects, so the row has already taken focus by the time this clears it —
  // which keeps `autoFocus` a one-shot signal rather than a sticky flag that
  // would steal the cursor back on unrelated re-renders.
  useEffect(() => {
    if (focusIndex !== null) setFocusIndex(null)
  }, [focusIndex])

  const add = useCallback(() => {
    editor.add()
    setFocusIndex(residues.length)
  }, [editor, residues.length])

  const insertAfter = useCallback(
    (index: number) => {
      editor.insertAfter(index)
      setFocusIndex(index + 1)
    },
    [editor],
  )

  const duplicate = useCallback(
    (index: number) => {
      editor.duplicate(index)
      setFocusIndex(index + 1)
    },
    [editor],
  )

  const update = useCallback(
    (index: number, patch: Partial<Omit<Residue, 'id'>>) => editor.update(index, patch),
    [editor],
  )

  return (
    <section className="residues">
      <div className="residues-head">
        <h2>Residues</h2>
        {residues.length > 0 && (
          <button type="button" className="link" onClick={editor.clear}>
            Clear
          </button>
        )}
      </div>

      {residues.length === 0 ? (
        <p className="blank">
          Nothing built yet. Add a residue to place the first N, Cα, C and O from the canonical seed
          frame — then keep adding to watch φ and ψ bend the chain.
        </p>
      ) : (
        <ol className="rows">
          {residues.map((residue, index) => (
            <ResidueRow
              key={residue.id}
              residue={residue}
              index={index}
              isFirst={index === 0}
              isLast={index === residues.length - 1}
              autoFocus={focusIndex === index}
              onUpdate={update}
              onInsertAfter={insertAfter}
              onDuplicate={duplicate}
              onRemove={editor.remove}
              onMove={editor.move}
            />
          ))}
        </ol>
      )}

      <button type="button" className="add" onClick={add}>
        + Add residue
      </button>
      {residues.length > 0 && (
        <p className="hint">Enter inserts a residue below · new rows extend the C-terminus</p>
      )}
    </section>
  )
}
