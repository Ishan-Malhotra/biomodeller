/**
 * One dihedral input.
 *
 * A thin specialisation of `NumberField`: degrees, a `°` suffix, and `wrapDegrees`
 * as the normaliser so the field can predict that typing 200 will be stored as
 * −160. All of the draft/commit behaviour — and the reasoning behind it — lives in
 * `NumberField`.
 */

import type { RefObject } from 'react'

import { wrapDegrees } from '../../lib/edits.ts'
import { NumberField } from './NumberField.tsx'

/** Round for display without showing a pointless trailing zero. */
function formatAngle(value: number): string {
  return String(Math.round(value * 10) / 10)
}

export function AngleField({
  label,
  value,
  onCommit,
  onEnter,
  inputRef,
  inert = false,
  inertReason,
  title,
}: {
  /** The symbol shown in the field's prefix: φ, ψ, ω or χ. */
  label: string
  value: number
  onCommit: (degrees: number) => void
  onEnter?: () => void
  inputRef?: RefObject<HTMLInputElement | null>
  inert?: boolean
  inertReason?: string
  title?: string
}) {
  return (
    <NumberField
      className="angle"
      label={label}
      value={value}
      format={formatAngle}
      normalize={wrapDegrees}
      suffix="°"
      onCommit={onCommit}
      {...(onEnter ? { onEnter } : {})}
      {...(inputRef ? { inputRef } : {})}
      inert={inert}
      {...(inertReason ? { inertReason } : {})}
      {...(title ? { title } : {})}
      ariaLabel={`${label}, degrees${inert && inertReason ? ` — ${inertReason}` : title ? ` — ${title}` : ''}`}
    />
  )
}
