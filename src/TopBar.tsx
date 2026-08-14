/**
 * The top bar: the title, the 2D chemical depiction, and the theme toggle.
 *
 * The depiction lives here rather than beside the 3D view because it is a *second
 * reading of the same molecule* — a strip across the top that stays legible while
 * the 3D view is orbited, and the thing stage 10's hover highlights into.
 */

import { useState } from 'react'

import type { Residue } from '../lib/types.ts'
import type { Theme } from './theme.ts'
import { Depiction2D } from './viewer/Depiction2D.tsx'

/**
 * A lightbulb. Filled with rays when lit (light mode), outlined and dark when off.
 *
 * Inline rather than an icon dependency: it is one path, and a build-time
 * dependency for one glyph is a poor trade.
 */
function LightbulbIcon({ lit }: { lit: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      {/* Glass: a bulb over a screw base. */}
      <path
        d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8.9.9 1.5l.1.7h5.2l.1-.7c.1-.6.4-1.1.9-1.5A6 6 0 0 0 12 3Z"
        fill={lit ? 'currentColor' : 'none'}
        fillOpacity={lit ? 0.35 : 0}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 18.5h5M10.5 21h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {lit && (
        <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 1.2v-.001M20.5 8h1M2.5 8h-1M18.4 2.6l.7-.7M5.6 2.6l-.7-.7" />
        </g>
      )}
    </svg>
  )
}

export function TopBar({
  theme,
  onToggleTheme,
  residues,
}: {
  theme: Theme
  onToggleTheme: () => void
  residues: readonly Residue[]
}) {
  const lit = theme === 'light'
  // Collapsible, because a long chain's diagram is tall and the 3D view is the
  // main event. Open by default so the feature is discoverable.
  const [open, setOpen] = useState(true)

  return (
    <header className={open ? 'topbar open' : 'topbar'}>
      <div className="topbar-title">
        <h1>Protein Structure Builder</h1>
        <p>Structure reconstructed from φ/ψ/ω and χ by NeRF.</p>
      </div>

      {open && (
        <div className="topbar-depiction">
          <Depiction2D residues={residues} theme={theme} />
        </div>
      )}

      <button
        type="button"
        className="depiction-toggle"
        aria-expanded={open}
        aria-label={`${open ? 'Hide' : 'Show'} the 2D structural formula`}
        title={`${open ? 'Hide' : 'Show'} the 2D formula`}
        onClick={() => setOpen((current) => !current)}
      >
        2D
      </button>

      <button
        type="button"
        className="theme-toggle"
        onClick={onToggleTheme}
        aria-pressed={!lit}
        // The accessible name says what the button does, not what it shows.
        aria-label={`Switch to ${lit ? 'dark' : 'light'} mode`}
        title={`Switch to ${lit ? 'dark' : 'light'} mode`}
      >
        <LightbulbIcon lit={lit} />
      </button>
    </header>
  )
}
