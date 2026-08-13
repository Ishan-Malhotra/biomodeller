/**
 * Step 4: a static viewport over the chain builder.
 *
 * The only state here is which fixed sample chain to show and when to re-fit the
 * camera. There is deliberately no residue editing yet — this screen exists to
 * confirm that angles → `buildBackbone` → `Atom[]` → canvas renders correctly
 * end to end. The Desmos-style editable residue list is step 5, and it replaces
 * the preset picker entirely.
 *
 * Note what is *not* stored: atom positions. They are derived from the residue
 * list on render, exactly as claude.md requires, and thrown away afterwards.
 */

import { useMemo, useState } from 'react'

import { buildBackbone } from '../lib/chain.ts'
import './App.css'
import { SAMPLE_PRESETS } from './sampleChains.ts'
import { StructureViewport } from './viewer/StructureViewport.tsx'

function App() {
  const [presetIndex, setPresetIndex] = useState(2)
  const [fitToken, setFitToken] = useState(0)

  const preset = SAMPLE_PRESETS[presetIndex] ?? SAMPLE_PRESETS[0]!
  // Cartesian coordinates are derived, never stored. Memoised on the residue
  // list only so an unrelated re-render doesn't rebuild the chain.
  const atoms = useMemo(() => buildBackbone(preset.residues), [preset.residues])

  const selectPreset = (index: number) => {
    setPresetIndex(index)
    setFitToken((token) => token + 1)
  }

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>Protein Structure Builder</h1>
          <p className="subtitle">Backbone reconstructed from φ/ψ/ω by NeRF.</p>
        </header>

        <section className="presets">
          <h2>Sample chains</h2>
          {SAMPLE_PRESETS.map((option, index) => (
            <button
              type="button"
              key={option.name}
              className={index === presetIndex ? 'preset selected' : 'preset'}
              aria-pressed={index === presetIndex}
              onClick={() => selectPreset(index)}
            >
              <span className="preset-name">{option.name}</span>
              <span className="preset-detail">{option.description}</span>
            </button>
          ))}
        </section>

        <section className="readout">
          <h2>Derived</h2>
          <dl>
            <dt>Residues</dt>
            <dd>{preset.residues.length}</dd>
            <dt>Atoms</dt>
            <dd>{atoms.length}</dd>
          </dl>
          <button type="button" className="fit" onClick={() => setFitToken((t) => t + 1)}>
            Fit view
          </button>
          <p className="hint">Drag to orbit · scroll to zoom · right-drag to pan</p>
        </section>
      </aside>

      <main className="viewport">
        <StructureViewport atoms={atoms} fitToken={fitToken} />
        {atoms.length === 0 && <p className="empty">No residues — nothing to build.</p>}
      </main>
    </div>
  )
}

export default App
