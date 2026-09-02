/**
 * A collapsible sidebar section.
 *
 * There were four hand-rolled disclosures before this — the sidebar collapse,
 * the 2D toggle, the per-row chi expander, the coordinate panel's on/off switch
 * — each with its own class names and its own idea of where `aria-expanded`
 * belongs. This is the one for *sidebar sections*: a heading that is a button,
 * and a region it controls.
 *
 * The other three stay hand-rolled on purpose. None of them is a section — one
 * is a whole-panel strip, one is a top-bar control, one is a per-row expander
 * with a completely different footprint — and forcing them through this would
 * be the wrong kind of reuse.
 */

import { useId, useState, type ReactNode } from 'react'

/**
 * A chevron, pointing right when closed and rotated down when open by CSS
 * rather than by swapping the path. Inline, matching the convention in
 * TopBar.tsx and FeedbackDialog.tsx: one path is not worth an icon dependency.
 */
function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
      <path
        d="M9 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Accordion({
  title,
  defaultOpen = true,
  aside,
  children,
}: {
  title: string
  defaultOpen?: boolean
  /**
   * A control that belongs to the section header but is not the disclosure —
   * the residue list's "Clear", the coordinate panel's on/off switch. Rendered
   * as a *sibling* of the toggle button, never inside it: a button nested in a
   * button is invalid HTML and unreachable by keyboard.
   */
  aside?: ReactNode
  children: ReactNode
}) {
  // Uncontrolled. Neither call site needs to read or force this, and lifting it
  // would put two more booleans in App for nothing.
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()

  return (
    <section className={open ? 'accordion open' : 'accordion'}>
      <div className="accordion-head">
        {/* The <h2> wraps the <button>, not the other way round: the heading has
            to stay a heading for a screen reader's heading list, and the button
            has to be the whole interactive surface. */}
        <h2>
          <button
            type="button"
            className="accordion-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((current) => !current)}
          >
            <span className="accordion-chevron">
              <ChevronIcon />
            </span>
            {title}
          </button>
        </h2>
        {aside}
      </div>

      {/* The body element is always in the DOM so `aria-controls` always
          resolves, but its *children* are not: `{open && children}` keeps the
          coordinate table's several hundred rows unbuilt while collapsed
          rather than merely invisible. */}
      <div id={bodyId} className="accordion-body" hidden={!open}>
        {open && children}
      </div>
    </section>
  )
}
