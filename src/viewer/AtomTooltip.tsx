/**
 * The label shown when an atom is hovered.
 *
 * A DOM overlay rather than a WebGL label: text in the canvas would need a font
 * atlas and would resample as the camera moves, and this needs to be crisp and
 * selectable-looking at any zoom. It is positioned from the pointer event, so it
 * follows the cursor rather than the atom — which is what makes it readable while
 * orbiting.
 *
 * The coordinates shown are **in the current origin frame**, the same numbers the
 * coordinate panel lists, because a readout that disagreed with the panel would be
 * worse than no readout. That also satisfies product.md §5's "coordinate readout on
 * hover/click of any atom".
 */

import { coordinateRows } from '../../lib/coordinates.ts'
import { atomLabel } from '../../lib/naming.ts'
import type { Atom } from '../../lib/types.ts'

export interface HoverPoint {
  /** Client coordinates, relative to the viewport element. */
  readonly x: number
  readonly y: number
}

/** Distance in pixels from the cursor, so the label never sits under it. */
const CURSOR_OFFSET = 14

export function AtomTooltip({ atom, at }: { atom: Atom; at: HoverPoint }) {
  const [row] = coordinateRows([atom])

  return (
    <div
      className="atom-tooltip"
      style={{ left: at.x + CURSOR_OFFSET, top: at.y + CURSOR_OFFSET }}
      role="status"
      aria-live="polite"
    >
      <span className="tooltip-name">
        {atomLabel(atom.name, atom.aminoAcid, atom.residueIndex)}
      </span>
      {row && (
        <span className="tooltip-coords">
          {row.x} · {row.y} · {row.z} Å
        </span>
      )}
    </div>
  )
}
