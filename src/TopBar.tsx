/**
 * The top bar.
 *
 * Currently the title and the theme toggle. Stage 9 fills the space between them
 * with the 2D chemical depiction, which is why this is its own component and its
 * own grid row rather than a header inside the sidebar.
 */

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

export function TopBar({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const lit = theme === 'light'

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>Protein Structure Builder</h1>
        <p>Backbone reconstructed from φ/ψ/ω by NeRF.</p>
      </div>

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
