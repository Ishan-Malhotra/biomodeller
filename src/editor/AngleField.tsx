/**
 * One dihedral input.
 *
 * Two behaviours make this worth its own component rather than a bare `<input>`:
 *
 *  1. It commits on every keystroke, with no submit step, because that live loop
 *     is the entire point of the tool (product.md §5). So it cannot round-trip
 *     its value through state naively — the moment the user's text is not yet a
 *     number ("-", "", "-1.") committing would either throw or snap the field to
 *     something they didn't type. It keeps an uncommitted draft string for
 *     exactly those in-between keystrokes and shows the canonical value again on
 *     blur.
 *
 *  2. Angles are periodic, so 200° is committed as −160°. The field keeps
 *     showing "200" while focused: correcting someone's arithmetic under their
 *     cursor mid-word is hostile, and the 3D view already shows them the answer.
 *
 * The draft must never outlive the value it was typed against. Blur alone is not
 * enough to guarantee that — a row can have its value replaced underneath it
 * (loading an example, a reorder moving a different residue into this position)
 * without the field ever being focused, and a draft left over from before would
 * then display a number that contradicts the actual state. So the field also
 * tracks the value its own last commit should have produced, and discards the
 * draft the moment the incoming value disagrees.
 */

import { useState, type KeyboardEvent, type RefObject } from 'react'

import { wrapDegrees } from '../../lib/edits.ts'

/** Round for display without showing a pointless trailing zero. */
function formatAngle(value: number): string {
  return String(Math.round(value * 10) / 10)
}

/** True if the text is a complete number, rather than a prefix of one. */
function isCommittable(text: string): boolean {
  return text.trim() !== '' && Number.isFinite(Number(text))
}

export function AngleField({
  label,
  value,
  onCommit,
  onEnter,
  inputRef,
  inert = false,
  inertReason,
}: {
  /** The symbol shown in the field's prefix: φ, ψ or ω. */
  label: string
  value: number
  onCommit: (degrees: number) => void
  onEnter?: () => void
  inputRef?: RefObject<HTMLInputElement | null>
  /**
   * The angle is stored and editable but has no effect on this residue's
   * geometry. Shown muted with an explanation rather than disabled — the value
   * becomes meaningful the moment a residue is inserted next to it, so throwing
   * it away or refusing the edit would be worse than marking it.
   */
  inert?: boolean
  inertReason?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  /**
   * The value this field's own last commit should have produced. `wrapDegrees`
   * here is the same normalisation `updateResidue` applies, so the prediction is
   * exact rather than a tolerance check.
   */
  const [expected, setExpected] = useState(value)

  // Derived-state-from-props: the value changed for a reason other than this
  // field's own commit, so any draft is stale. React re-renders immediately
  // rather than committing this pass, so there is no flash of the old text.
  if (value !== expected) {
    setExpected(value)
    setDraft(null)
  }

  return (
    <label className={inert ? 'angle inert' : 'angle'} title={inert ? inertReason : undefined}>
      <span className="angle-label" aria-hidden="true">
        {label}
      </span>
      <input
        ref={inputRef}
        type="number"
        step={1}
        className="angle-input"
        aria-label={`${label}, degrees${inert && inertReason ? ` — ${inertReason}` : ''}`}
        value={draft ?? formatAngle(value)}
        onChange={(event) => {
          const text = event.target.value
          setDraft(text)
          if (isCommittable(text)) {
            const degrees = Number(text)
            setExpected(wrapDegrees(degrees))
            onCommit(degrees)
          }
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') {
            setDraft(null)
            onEnter?.()
          }
        }}
      />
      <span className="angle-unit" aria-hidden="true">
        °
      </span>
    </label>
  )
}
