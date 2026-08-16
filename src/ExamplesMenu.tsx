/**
 * The Examples dropdown, in the top bar's button cluster.
 *
 * Moved out of the sidebar to sit alongside the other view-level controls (2D,
 * theme) rather than compete with the residue list for vertical space: loading an
 * example is an occasional action taken once at the start, not something referenced
 * while editing, so it doesn't need permanent real estate beside the rows it fills.
 */

import { useEffect, useRef, useState } from 'react'

import { EXAMPLE_CHAINS, type ExampleChain } from './sampleChains.ts'

export function ExamplesMenu({ onSelect }: { onSelect: (example: ExampleChain) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Closes on an outside click or Escape — the standard dropdown contract. Only
  // listens while open, so this costs nothing the rest of the time.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="examples-menu" ref={rootRef}>
      <button
        type="button"
        className="depiction-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Examples
      </button>

      {open && (
        <div className="examples-dropdown" role="menu">
          <p className="hint examples-hint">
            Loads into the residue list, where every angle stays editable.
          </p>
          {EXAMPLE_CHAINS.map((example) => (
            <button
              type="button"
              key={example.name}
              role="menuitem"
              className="example"
              title={example.description}
              onClick={() => {
                onSelect(example)
                setOpen(false)
              }}
            >
              <span className="example-name">{example.name}</span>
              <span className="example-detail">{example.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
