/**
 * Step 5: the editable residue list.
 *
 * The app opens on a blank canvas — no molecule, no default chain — and the user
 * builds one row at a time. All of the state lives in `useChain`, which holds the
 * residue list and derives atoms from it; this component only wires that to the
 * list and the viewport.
 *
 * Note what is *not* stored here: atom positions. They are derived from the
 * residue list on render, as claude.md requires.
 *
 * The camera is framed on explicit request rather than on every edit. Re-framing
 * per keystroke would fight the user's own orbiting, and it would also hide the
 * thing worth seeing: when you change φ of residue 5, everything before it stays
 * exactly where it was and the rest swings. A camera that recentred on each
 * change would make that look like the whole structure moved.
 */

import { useEffect, useRef, useState } from 'react'

import './App.css'
import { EXAMPLE_CHAINS } from './sampleChains.ts'
import { TopBar } from './TopBar.tsx'
import { useTheme } from './theme.ts'
import { useChain } from './useChain.ts'
import { ResidueList } from './editor/ResidueList.tsx'
import { StructureViewport } from './viewer/StructureViewport.tsx'

function App() {
  const editor = useChain()
  const { theme, toggle: toggleTheme } = useTheme()
  const [fitToken, setFitToken] = useState(0)
  const fit = () => setFitToken((token) => token + 1)

  const { residues, atoms, stats } = editor

  // The one automatic framing: going from blank canvas to a first residue. The
  // camera has nothing to aim at while the list is empty, so it sits at its
  // default distance; without this, the seed frame would appear wherever that
  // default happened to point. Every subsequent edit leaves the camera alone.
  const wasEmpty = useRef(true)
  useEffect(() => {
    const empty = atoms.length === 0
    if (wasEmpty.current && !empty) setFitToken((token) => token + 1)
    wasEmpty.current = empty
  }, [atoms.length])

  return (
    <div className="app">
      <TopBar theme={theme} onToggleTheme={toggleTheme} />

      <aside className="panel">
        <ResidueList editor={editor} />

        <section className="examples">
          <h2>Examples</h2>
          <p className="hint examples-hint">
            Loads into the list above, where every angle stays editable.
          </p>
          {EXAMPLE_CHAINS.map((example) => (
            <button
              type="button"
              key={example.name}
              className="example"
              title={example.description}
              onClick={() => {
                editor.replaceAll(example.residues)
                fit()
              }}
            >
              <span className="example-name">{example.name}</span>
              <span className="example-detail">{example.description}</span>
            </button>
          ))}
        </section>

        <section className="readout">
          <h2>Derived</h2>
          <dl>
            <dt>Residues</dt>
            <dd>{residues.length}</dd>
            <dt>Atoms</dt>
            <dd>{atoms.length}</dd>
            <dt title="Residues whose atoms were reused by reference from the previous build, rather than recomputed. Residue i depends on every residue before it, so an edit at i invalidates exactly the suffix from i onward.">
              Last edit
            </dt>
            <dd>
              {stats.total === 0
                ? '—'
                : stats.recomputed === 0
                  ? `reused all ${stats.reused}`
                  : `recomputed ${stats.recomputed} of ${stats.total}, from residue ${stats.fromIndex + 1}`}
            </dd>
          </dl>
          <button type="button" className="fit" onClick={fit}>
            Fit view
          </button>
          <p className="hint">Drag to orbit · scroll to zoom · right-drag to pan</p>
        </section>
      </aside>

      <main className="viewport">
        <StructureViewport atoms={atoms} theme={theme} fitToken={fitToken} />
        {atoms.length === 0 && (
          <p className="empty">Blank canvas — add a residue to place the seed frame.</p>
        )}
      </main>
    </div>
  )
}

export default App
