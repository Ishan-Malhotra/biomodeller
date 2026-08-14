/**
 * Light/dark theme.
 *
 * The theme is written to `document.documentElement.dataset.theme` and every
 * colour follows from the custom properties in index.css. That indirection is the
 * whole design: adding a theme should mean adding a block of token values, not
 * touching a component. The one exception is the 3D scene, which cannot read CSS
 * variables — see `src/viewer/atomStyle.ts`.
 *
 * Resolution order: an explicit choice the user has made before (localStorage),
 * otherwise the OS preference. Storing only explicit choices means someone who has
 * never touched the toggle keeps following their system as it changes, rather than
 * being frozen into whatever it happened to be on their first visit.
 */

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'biomodeller.theme'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/** The user's stored choice, or null if they have never toggled. */
function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    // Private-browsing modes can throw on localStorage access. A theme is not
    // worth failing a render over.
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme())

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Follow the OS while the user has expressed no preference of their own.
  useEffect(() => {
    if (storedTheme() !== null) return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setTheme(event.matches ? 'dark' : 'light')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'light' ? 'dark' : 'light'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Non-persistent is an acceptable degradation; the toggle still works.
      }
      return next
    })
  }, [])

  return { theme, toggle }
}
