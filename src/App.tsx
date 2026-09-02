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
 * Both of those views are now children of `<main>`: the 2D depiction is a
 * floating card over the canvas rather than a strip in the top bar, so the
 * shared state no longer has to be threaded through TopBar, which never used
 * it. That reclaimed most of the bar's height for the 3D view.
 *
 * The camera is framed on explicit request rather than on every edit. Re-framing
 * per keystroke would fight the user's own orbiting, and it would also hide the
 * thing worth seeing: when you change φ of residue 5, everything before it stays
 * exactly where it was and the rest swings. A camera that recentred on each
 * change would make that look like the whole structure moved.
 */

import { useEffect, useRef, useState } from 'react'

import { atomKey } from '../lib/naming.ts'
import { exportToPDB } from '../lib/pdbExport.ts'
import './App.css'
import type { ExampleChain } from './sampleChains.ts'
import { TopBar } from './TopBar.tsx'
import { useTheme } from './theme.ts'
import { useChain } from './useChain.ts'
import { useOrigin } from './useOrigin.ts'
import { CoordinatePanel } from './editor/CoordinatePanel.tsx'
import { ResidueList } from './editor/ResidueList.tsx'
import { AtomTooltip, type HoverPoint } from './viewer/AtomTooltip.tsx'
import { Depiction2D } from './viewer/Depiction2D.tsx'
import type { AtomRef } from './viewer/BackboneStructure.tsx'
import { StructureViewport } from './viewer/StructureViewport.tsx'

/**
 * A chevron, pointing at the edge the panel will collapse toward.
 *
 * Inline rather than an icon dependency, matching TopBar.tsx's LightbulbIcon
 * and FeedbackDialog.tsx's MessageIcon.
 */
function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function App() {
  const editor = useChain()
  const frame = useOrigin(editor.atoms)
  const { theme, toggle: toggleTheme } = useTheme()
  const [fitToken, setFitToken] = useState(0)
  const [pickArmed, setPickArmed] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // Lifted out of TopBar now that the card it controls renders in the viewport.
  // Open by default, as it was there, so the feature stays discoverable.
  const [showDepiction, setShowDepiction] = useState(true)
  const [exportError, setExportError] = useState<string | null>(null)
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

  const selectExample = (example: ExampleChain) => {
    editor.replaceAll(example.residues)
    fit()
  }

  const exportPdb = () => {
    if (residues.length === 0) {
      setExportError('Nothing to export')
      return
    }
    setExportError(null)
    const blob = new Blob([exportToPDB(atoms, residues)], { type: 'chemical/x-pdb' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'biomodeller-export.pdb'
    anchor.click()
    URL.revokeObjectURL(url)
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
    <div className={sidebarCollapsed ? 'app sidebar-collapsed' : 'app'}>
      <TopBar
        theme={theme}
        onToggleTheme={toggleTheme}
        depictionOpen={showDepiction}
        onToggleDepiction={() => setShowDepiction((current) => !current)}
        onSelectExample={selectExample}
      />

      <aside className={sidebarCollapsed ? 'panel collapsed' : 'panel'}>
        <div className="panel-header">
          <button
            type="button"
            className="btn btn-icon btn-quiet"
            aria-expanded={!sidebarCollapsed}
            aria-label={`${sidebarCollapsed ? 'Show' : 'Hide'} the sidebar`}
            title={`${sidebarCollapsed ? 'Show' : 'Hide'} the sidebar`}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            <SidebarToggleIcon collapsed={sidebarCollapsed} />
          </button>
        </div>

        {!sidebarCollapsed && (
          <>
            <div>
              <button
                type="button"
                className="btn btn-block btn-primary"
                disabled={residues.length === 0}
                onClick={exportPdb}
              >
                Export PDB
              </button>
              {exportError && <p className="export-error">{exportError}</p>}
            </div>

            <ResidueList editor={editor} />

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
              <button type="button" className="btn btn-block" onClick={fit}>
                Fit view
              </button>
              <p className="hint">Drag to orbit · scroll to zoom · right-drag to pan</p>
            </section>
          </>
        )}
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
        {/* Before the tooltip in DOM order as well as below it in z-index, so
            hovering an atom inside this card still puts the label on top. */}
        {showDepiction && (
          <div className="depiction-overlay">
            <Depiction2D
              residues={residues}
              theme={theme}
              highlightKey={highlightKey}
              onHoverAtom={setHovered}
            />
          </div>
        )}
        {hoveredAtom && pointer && <AtomTooltip atom={hoveredAtom} at={pointer} />}
        {atoms.length === 0 && (
          <p className="empty">Blank canvas — add a residue to place the seed frame.</p>
        )}
      </main>
    </div>
  )
}

export default App
