/**
 * The top bar: the title and the view-level controls.
 *
 * The 2D depiction used to live here as a full-width strip, which cost the 3D
 * view roughly a seventh of the window even when nobody was looking at the
 * diagram. It is now a floating card inside the viewport (see App.tsx), so this
 * bar owns only the *toggle* for it and can be a single-line strip.
 *
 * That move also removed the last conditional element in this row, which is why
 * the buttons can no longer jump: they sit in a `.topbar-actions` container
 * pushed right by `margin-left: auto` rather than by a spacer that had to stay
 * mounted-but-empty to hold its width.
 */

import { ExamplesMenu } from './ExamplesMenu.tsx'
import { FeedbackDialog } from './FeedbackDialog.tsx'
import type { ExampleChain } from './sampleChains.ts'
import type { Theme } from './theme.ts'

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
  depictionOpen,
  onToggleDepiction,
  onSelectExample,
  onExportPdb,
  exportDisabled,
}: {
  theme: Theme
  onToggleTheme: () => void
  depictionOpen: boolean
  onToggleDepiction: () => void
  onSelectExample: (example: ExampleChain) => void
  onExportPdb: () => void
  exportDisabled: boolean
}) {
  const lit = theme === 'light'

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>Biomodeller</h1>
        <p>Protein Structure Builder</p>
      </div>

      {/* All controls share `.btn`, so they agree on height, radius, hover
          treatment and colour; only their widths differ. */}
      <div className="topbar-actions">
        <ExamplesMenu onSelect={onSelectExample} />

        <button
          type="button"
          className="btn"
          aria-expanded={depictionOpen}
          aria-label={`${depictionOpen ? 'Hide' : 'Show'} the 2D structural formula`}
          title={`${depictionOpen ? 'Hide' : 'Show'} the 2D formula`}
          onClick={onToggleDepiction}
        >
          2D
        </button>

        <button type="button" className="btn" disabled={exportDisabled} onClick={onExportPdb}>
          Export PDB
        </button>

        <button
          type="button"
          className="btn btn-icon"
          onClick={onToggleTheme}
          aria-pressed={!lit}
          // The accessible name says what the button does, not what it shows.
          aria-label={`Switch to ${lit ? 'dark' : 'light'} mode`}
          title={`Switch to ${lit ? 'dark' : 'light'} mode`}
        >
          <LightbulbIcon lit={lit} />
        </button>

        <FeedbackDialog />
      </div>
    </header>
  )
}
