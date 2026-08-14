/**
 * A numeric input that commits on every keystroke.
 *
 * Extracted from `AngleField`, which is now a thin wrapper over it, because the
 * coordinate panel needs the same three behaviours and they are subtle enough that
 * a second copy would drift:
 *
 *  1. **It commits per keystroke, with no submit step** — the live loop is the
 *     whole point (product.md §5). So it cannot round-trip its value through state
 *     naively: the moment the text is not yet a number ("-", "", "-1.") committing
 *     would either throw or snap the field to something the user didn't type. It
 *     keeps an uncommitted draft string for exactly those in-between keystrokes.
 *
 *  2. **The committed value may differ from the text** — an angle of 200° is stored
 *     as −160°. The field keeps showing "200" while focused, because correcting
 *     someone's arithmetic under their cursor mid-word is hostile and the 3D view
 *     already shows them the answer. `normalize` is how the caller declares that
 *     transformation so the field can predict its own result.
 *
 *  3. **The draft must never outlive the value it was typed against.** Blur alone
 *     doesn't guarantee that — a row can have its value replaced underneath it
 *     (loading an example, a reorder moving a different residue into this position)
 *     without ever being focused, and a stale draft would then display a number
 *     contradicting the actual state. This was a real bug, found in stage 5 by
 *     looking at a screenshot. So the field tracks the value its own last commit
 *     should have produced and discards the draft the moment reality disagrees.
 */

import { useState, type KeyboardEvent, type RefObject } from 'react'

/** True if the text is a complete number, rather than a prefix of one. */
function isCommittable(text: string): boolean {
  return text.trim() !== '' && Number.isFinite(Number(text))
}

export function NumberField({
  label,
  value,
  onCommit,
  normalize = (n) => n,
  format,
  step = 1,
  suffix,
  onEnter,
  inputRef,
  className = 'numfield',
  inert = false,
  inertReason,
  title,
  ariaLabel,
}: {
  /** Short prefix shown in the field, e.g. `φ` or `x`. */
  label: string
  value: number
  onCommit: (value: number) => void
  /**
   * What the caller will actually store for a given input. Used to predict this
   * field's own commit so an external change can be told apart from its own.
   */
  normalize?: (value: number) => number
  format: (value: number) => string
  step?: number
  /** Unit shown after the number, e.g. `°` or `Å`. */
  suffix?: string
  onEnter?: () => void
  inputRef?: RefObject<HTMLInputElement | null>
  className?: string
  /**
   * The value is stored and editable but has no effect. Shown muted with an
   * explanation rather than disabled — it may become meaningful at any moment, so
   * throwing the edit away would be worse than marking it.
   */
  inert?: boolean
  inertReason?: string
  /** Explanatory tooltip for a field that is perfectly live — e.g. what a χ rotates. */
  title?: string
  ariaLabel?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [expected, setExpected] = useState(value)

  // Derived-state-from-props: the value changed for a reason other than this
  // field's own commit, so any draft is stale. React re-renders immediately rather
  // than committing this pass, so there is no flash of the old text.
  if (value !== expected) {
    setExpected(value)
    setDraft(null)
  }

  return (
    <label
      className={inert ? `${className} inert` : className}
      title={(inert ? inertReason : undefined) ?? title}
    >
      <span className={`${className}-label`} aria-hidden="true">
        {label}
      </span>
      <input
        ref={inputRef}
        type="number"
        step={step}
        className={`${className}-input`}
        aria-label={
          ariaLabel ?? `${label}${suffix ? ` in ${suffix}` : ''}${inert && inertReason ? ` — ${inertReason}` : ''}`
        }
        value={draft ?? format(value)}
        onChange={(event) => {
          const text = event.target.value
          setDraft(text)
          if (isCommittable(text)) {
            const parsed = Number(text)
            setExpected(normalize(parsed))
            onCommit(parsed)
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
      {suffix && (
        <span className={`${className}-unit`} aria-hidden="true">
          {suffix}
        </span>
      )}
    </label>
  )
}
