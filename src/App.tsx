/**
 * Wiring: the residue list, the coordinate frame, and the viewport.
 *
 * The app opens on a blank canvas — no molecule, no default chain — and the user
 * builds one row at a time.
 *
 * Two layers of derived state, in this order and only this order:
 *
 *   residues --useChain--> canonical atoms --useOrigin--> atoms in the user's frame
 *
 * `useChain` turns angles into coordinates; `useOrigin` moves those coordinates
 * rigidly. The second cannot reach the first, which is how claude.md's requirement
 * that origin edits never touch the NeRF inputs is enforced — by the direction of
 * the dependency rather than by discipline.
 *
 * Note what is *not* stored here: atom positions. They are derived on render, as
 * claude.md requires.
 *
 * The hovered atom lives here too, because two views share it: hovering in either
 * the 3D viewport or the 2D depiction highlights the same atom in both. It is
 * deliberately *not* in `useChain` — it is view state, and putting it there would
 * make a mouse movement capable of triggering a chain rebuild.
 *
 * The camera is framed on explicit request rather than on every edit. Re-framing
 * per keystroke would fight the user's own orbiting, and it would also hide the
 * thing worth seeing: when you change φ of residue 5, everything before it stays
 * exactly where it was and the rest swings. A camera that recentred on each
 * change would make that look like the whole structure moved.
 */

import { useEffect, useRef, useState } from 'react'

import { atomKey } from '../lib/naming.ts'
import './App.css'
import { EXAMPLE_CHAINS } from './sampleChains.ts'
import { TopBar } from './TopBar.tsx'
import { useTheme } from './theme.ts'
import { useChain } from './useChain.ts'
import { useOrigin } from './useOrigin.ts'
import { CoordinatePanel } from './editor/CoordinatePanel.tsx'
import { ResidueList } from './editor/ResidueList.tsx'
import { AtomTooltip, type HoverPoint } from './viewer/AtomTooltip.tsx'
import type { AtomRef } from './viewer/BackboneStructure.tsx'
import { StructureViewport } from './viewer/StructureViewport.tsx'

function App() {
  const editor = useChain()
  const frame = useOrigin(editor.atoms)
  const { theme, toggle: toggleTheme } = useTheme()
  const [fitToken, setFitToken] = useState(0)
  const [pickArmed, setPickArmed] = useState(false)
  const [hovered, setHovered] = useState<AtomRef | null>(null)
  const [pointer, setPointer] = useState<HoverPoint | null>(null)
  const fit = () => setFitToken((token) => token + 1)

  const { residues, stats } = editor
  // What the viewport draws and the coordinate table reports: the canonical atoms
  // after the origin transform. Identical to `editor.atoms` by reference while the
  // frame is untouched.
  const atoms = frame.atoms

  const pickAtom = (atom: AtomRef) => {
    frame.setAnchor({ kind: 'atom', residueIndex: atom.residueIndex, atomName: atom.atomName })
    setPickArmed(false)
  }

  const highlightKey = hovered ? atomKey(hovered.residueIndex, hovered.atomName) : null
  // Resolved against the transformed atoms, so the tooltip's coordinates are the
  // ones the coordinate panel shows rather than the canonical ones.
  const hoveredAtom = hovered
    ? (atoms.find(
        (atom) => atom.residueIndex === hovered.residueIndex && atom.name === hovered.atomName,
      ) ?? null)
    : null

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
      <TopBar
        theme={theme}
        onToggleTheme={toggleTheme}
        residues={residues}
        highlightKey={highlightKey}
        onHoverAtom={setHovered}
      />

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

        <CoordinatePanel
          frame={frame}
          atoms={atoms}
          pickArmed={pickArmed}
          onArmPick={setPickArmed}
        />

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

      <main
        className={pickArmed ? 'viewport picking' : 'viewport'}
        // Tracked on the container rather than per atom: the tooltip follows the
        // cursor, and an instanced mesh's own events don't fire on every move.
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setPointer({ x: event.clientX - box.left, y: event.clientY - box.top })
        }}
        onPointerLeave={() => setHovered(null)}
      >
        <StructureViewport
          atoms={atoms}
          theme={theme}
          fitToken={fitToken}
          grid={frame.spec.enabled && frame.spec.showGrid ? { spacing: frame.spec.gridSpacing } : undefined}
          onPickAtom={pickArmed ? pickAtom : undefined}
          onHoverAtom={setHovered}
          highlightKey={highlightKey}
        />
        {hoveredAtom && pointer && <AtomTooltip atom={hoveredAtom} at={pointer} />}
        {atoms.length === 0 && (
          <p className="empty">Blank canvas — add a residue to place the seed frame.</p>
        )}
      </main>
    </div>
  )
}

export default App
