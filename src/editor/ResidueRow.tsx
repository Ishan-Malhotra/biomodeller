/**
 * One row of the residue list: identity, three dihedrals, and row actions.
 *
 * The row also carries the pedagogy about which angles do nothing. Two of them
 * genuinely have no geometric effect and the tool should say so rather than let
 * a user wonder why typing in a field changes nothing:
 *
 *  - φ of residue 1. φ is the C(i−1)–N(i)–Cα(i)–C(i) dihedral, and residue 1 has
 *    no preceding C. Its N/Cα/C come from the canonical seed frame instead.
 *  - ω of the last residue. ω places the *next* residue's Cα, and there isn't
 *    one.
 *
 * ψ of the last residue is not in that list: it still orients that residue's own
 * carbonyl O, so it is a live control.
 *
 * χ angles live behind a per-row expander. A chain of lysines would otherwise put
 * seven numeric fields on every row and make the list unreadable, and χ is a
 * second-order control — most of the time the question is what φ and ψ do.
 */

import { memo, useEffect, useRef, useState } from 'react'

import { atomDisplayName } from '../../lib/naming.ts'
import { SIDE_CHAIN_TOPOLOGY } from '../../lib/sidechainTopology.ts'
import { AMINO_ACID_CODES, type AminoAcidCode, type Residue } from '../../lib/types.ts'
import { AngleField } from './AngleField.tsx'

export interface ResidueRowProps {
  residue: Residue
  index: number
  isFirst: boolean
  isLast: boolean
  /** Focus this row's φ field on mount — set for a row the user just created. */
  autoFocus: boolean
  onUpdate: (index: number, patch: Partial<Omit<Residue, 'id'>>) => void
  onUpdateChi: (index: number, chiIndex: number, degrees: number) => void
  onInsertAfter: (index: number) => void
  onDuplicate: (index: number) => void
  onRemove: (index: number) => void
  onMove: (index: number, to: number) => void
}

function ResidueRowImpl({
  residue,
  index,
  isFirst,
  isLast,
  autoFocus,
  onUpdate,
  onUpdateChi,
  onInsertAfter,
  onDuplicate,
  onRemove,
  onMove,
}: ResidueRowProps) {
  const phiRef = useRef<HTMLInputElement>(null)
  const [showChi, setShowChi] = useState(false)

  useEffect(() => {
    if (autoFocus) phiRef.current?.focus()
  }, [autoFocus])

  const topology = SIDE_CHAIN_TOPOLOGY[residue.aminoAcid]
  const chiCount = topology.chi.length

  return (
    <li className="row">
      <span className="row-index" aria-hidden="true">
        {index + 1}
      </span>

      <select
        className="row-acid"
        aria-label={`Residue ${index + 1} amino acid`}
        value={residue.aminoAcid}
        onChange={(event) => onUpdate(index, { aminoAcid: event.target.value as AminoAcidCode })}
      >
        {AMINO_ACID_CODES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>

      <div className="row-angles">
        <AngleField
          label="φ"
          value={residue.phi}
          inputRef={phiRef}
          inert={isFirst}
          inertReason="φ of residue 1 has no effect: there is no preceding C to rotate about, so N/Cα/C come from the canonical seed frame."
          onCommit={(phi) => onUpdate(index, { phi })}
          onEnter={() => onInsertAfter(index)}
        />
        <AngleField
          label="ψ"
          value={residue.psi}
          onCommit={(psi) => onUpdate(index, { psi })}
          onEnter={() => onInsertAfter(index)}
        />
        <AngleField
          label="ω"
          value={residue.omega}
          inert={isLast}
          inertReason="ω of the last residue has no effect: it places the next residue's Cα, and there is no next residue."
          onCommit={(omega) => onUpdate(index, { omega })}
          onEnter={() => onInsertAfter(index)}
        />
      </div>

      {chiCount > 0 && showChi && (
        <div className="row-chi">
          {residue.chi.map((value, i) => {
            const quad = topology.chi[i]
            return (
              <AngleField
                key={i}
                label={`χ${i + 1}`}
                value={value}
                onCommit={(degrees) => onUpdateChi(index, i + 1, degrees)}
                onEnter={() => onInsertAfter(index)}
                {...(quad
                  ? {
                      // Naming the four atoms is the explanation: it says which bond
                      // this number rotates about. These fields are fully live, so
                      // this is a title rather than an inert-reason.
                      title: `χ${i + 1} = ${quad.map(atomDisplayName).join('–')}`,
                    }
                  : {})}
              />
            )
          })}
        </div>
      )}

      {/* The χ disclosure sits outside `.row-actions` on purpose: those fade in on
          hover, and this must not — it is the only indication that a residue *has*
          side-chain angles, so hiding it would hide the feature. */}
      <div className="row-controls">
        {chiCount > 0 && (
          <button
            type="button"
            className={showChi ? 'chi-toggle open' : 'chi-toggle'}
            aria-expanded={showChi}
            aria-label={`${showChi ? 'Hide' : 'Show'} the ${chiCount} χ ${chiCount === 1 ? 'angle' : 'angles'} of residue ${index + 1}`}
            title={`${chiCount} side-chain dihedral${chiCount === 1 ? '' : 's'}`}
            onClick={() => setShowChi((open) => !open)}
          >
            χ{chiCount}
          </button>
        )}

        <div className="row-actions">
        <button
          type="button"
          aria-label={`Move residue ${index + 1} toward the N-terminus`}
          title="Move up"
          disabled={isFirst}
          onClick={() => onMove(index, index - 1)}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move residue ${index + 1} toward the C-terminus`}
          title="Move down"
          disabled={isLast}
          onClick={() => onMove(index, index + 1)}
        >
          ↓
        </button>
        <button
          type="button"
          aria-label={`Duplicate residue ${index + 1}`}
          title="Duplicate"
          onClick={() => onDuplicate(index)}
        >
          ⧉
        </button>
        <button
          type="button"
          className="danger"
          aria-label={`Delete residue ${index + 1}`}
          title="Delete"
          onClick={() => onRemove(index)}
        >
          ✕
        </button>
        </div>
      </div>
    </li>
  )
}

/**
 * Memoised on the residue and its position flags.
 *
 * An edit to residue i re-renders the list, but the rows before it are
 * unchanged by value and their props are referentially stable (the editor's
 * actions never change identity), so they skip re-rendering entirely. This is
 * the DOM-side counterpart of the suffix-only geometry recompute.
 */
export const ResidueRow = memo(ResidueRowImpl)
