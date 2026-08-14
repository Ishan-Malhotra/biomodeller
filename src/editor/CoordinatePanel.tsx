/**
 * The Cartesian coordinate / origin control — AutoCAD's UCS, in a sidebar.
 *
 * Collapsed by default, because the canonical frame is a fine answer for most of
 * what the tool is for and an always-open coordinate table would bury the residue
 * list. Opening it does not change the structure; only editing does.
 *
 * The two ways of defining an origin are presented as two ways of choosing an
 * *anchor*, which is what they are — see `src/useOrigin.ts`. Everything else (the
 * target position, the orientation) applies identically to both.
 */

import { coordinateRows } from '../../lib/coordinates.ts'
import type { Atom } from '../../lib/types.ts'
import type { OriginFrame } from '../useOrigin.ts'
import { NumberField } from './NumberField.tsx'

/** Å. Grid spacings worth offering; finer than 0.5 Å is visual noise at bond scale. */
const GRID_SPACINGS = [0.5, 1, 2, 5] as const

const formatLength = (value: number): string => String(Math.round(value * 1000) / 1000)

export function CoordinatePanel({
  frame,
  atoms,
  pickArmed,
  onArmPick,
}: {
  frame: OriginFrame
  /** Already in the current frame — these are the numbers to show. */
  atoms: readonly Atom[]
  /** True while the viewport is waiting for the user to click an atom. */
  pickArmed: boolean
  onArmPick: (armed: boolean) => void
}) {
  const { spec } = frame
  const rows = spec.enabled ? coordinateRows(atoms) : []

  return (
    <section className="coords">
      <div className="coords-head">
        <h2>Cartesian coordinates</h2>
        <label className="switch">
          <input
            type="checkbox"
            checked={spec.enabled}
            onChange={(event) => {
              frame.setEnabled(event.target.checked)
              if (!event.target.checked) onArmPick(false)
            }}
          />
          <span>{spec.enabled ? 'on' : 'off'}</span>
        </label>
      </div>

      {!spec.enabled ? (
        <p className="hint">
          Off — atoms sit in the canonical frame, with N of residue 1 at (0, 0, 0). Turn on to
          define an origin and read every atom's x/y/z from it.
        </p>
      ) : (
        <>
          <div className="coords-field">
            <span className="coords-label">Origin</span>
            <div className="radios">
              <label>
                <input
                  type="radio"
                  name="anchor"
                  checked={spec.anchor.kind === 'first-ca'}
                  onChange={() => {
                    frame.setAnchor({ kind: 'first-ca' })
                    onArmPick(false)
                  }}
                />
                <span>Cα of residue 1</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="anchor"
                  checked={spec.anchor.kind === 'atom'}
                  onChange={() => onArmPick(true)}
                />
                <span>{spec.anchor.kind === 'atom' ? frame.anchorLabel : 'Pick an atom…'}</span>
              </label>
            </div>
            {pickArmed && <p className="hint armed">Click an atom in the viewport.</p>}
          </div>

          <div className="coords-field">
            <span className="coords-label" title="Where the anchor atom sits. The rest of the structure follows rigidly.">
              Anchor sits at
            </span>
            <div className="triple">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <NumberField
                  key={axis}
                  className="angle"
                  label={axis}
                  value={spec.target[axis]}
                  format={formatLength}
                  step={0.5}
                  suffix="Å"
                  ariaLabel={`Origin ${axis} in ångströms`}
                  onCommit={(value) => frame.setTarget({ ...spec.target, [axis]: value })}
                />
              ))}
            </div>
          </div>

          <div className="coords-field">
            <span className="coords-label" title="Rotation about the anchor, applied to the whole structure. Extrinsic XYZ: about world X, then Y, then Z.">
              Orientation
            </span>
            <div className="triple">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <NumberField
                  key={axis}
                  className="angle"
                  label={axis}
                  value={spec.rotation[axis]}
                  format={formatLength}
                  step={15}
                  suffix="°"
                  ariaLabel={`Rotation about ${axis} in degrees`}
                  onCommit={(value) => frame.setRotation({ ...spec.rotation, [axis]: value })}
                />
              ))}
            </div>
          </div>

          {/* Resets to this panel's default — Cα of residue 1 at (0, 0, 0),
              unrotated — which is *not* the canonical NeRF frame, where N of
              residue 1 is the atom at the origin. Turning the panel off is what
              returns to that. Saying "canonical frame" here would be wrong. */}
          <button
            type="button"
            className="fit"
            title="Cα of residue 1 back to (0, 0, 0) with no rotation. To return to the canonical NeRF frame instead, switch this panel off."
            onClick={() => {
              frame.reset()
              onArmPick(false)
            }}
          >
            Reset origin
          </button>

          <div className="coords-field">
            <label className="switch grid-switch">
              <input
                type="checkbox"
                checked={spec.showGrid}
                onChange={(event) => frame.setShowGrid(event.target.checked)}
              />
              <span>Gridlines</span>
            </label>
            {spec.showGrid && (
              <div className="spacings">
                {GRID_SPACINGS.map((spacing) => (
                  <button
                    type="button"
                    key={spacing}
                    className={spec.gridSpacing === spacing ? 'spacing selected' : 'spacing'}
                    aria-pressed={spec.gridSpacing === spacing}
                    onClick={() => frame.setGridSpacing(spacing)}
                  >
                    {spacing} Å
                  </button>
                ))}
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <div className="coord-table" role="region" aria-label="Atom coordinates">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Atom</th>
                    <th scope="col">x</th>
                    <th scope="col">y</th>
                    <th scope="col">z</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.residueIndex}-${row.atomName}`}>
                      <th scope="row">
                        <span className="coord-atom">{row.displayName}</span>
                        <span className="coord-residue">
                          {row.aminoAcid} {row.residueNumber}
                        </span>
                      </th>
                      <td>{row.x}</td>
                      <td>{row.y}</td>
                      <td>{row.z}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
