/**
 * The 2D chemical depiction, as SVG.
 *
 * Renders the layout `lib/depiction.ts` computes. All the thinking is in that
 * module; this places circles and lines and picks colours, in the same
 * relationship the 3D viewport has to `lib/chain.ts`.
 *
 * Atom colours are the same CPK palette the 3D view uses, so an atom is the same
 * colour in both places — which is what makes hovering one and finding the other
 * (stage 10) work without a legend.
 */

import { useMemo } from 'react'

import { depict, type DepictionEdge, type DepictionNode } from '../../lib/depiction.ts'
import { formatFormula, molecularFormula } from '../../lib/formula.ts'
import type { Residue } from '../../lib/types.ts'
import type { Theme } from '../theme.ts'
import { ELEMENT_COLOR, HIGHLIGHT_COLOR } from './atomStyle.ts'

/**
 * The diagram is scaled to fit this height, rather than being clipped to it.
 *
 * Chains grow *horizontally*, so horizontal scrolling is natural and vertical
 * scrolling is not: side chains grow upward from the backbone, so a vertical scroll
 * hides the main chain — the most important row — while showing the substituents.
 * Scaling to fit keeps the backbone visible at any composition. Arginine is the
 * tallest residue at 7.75 layout units; glycine is 1.75.
 */
const TARGET_HEIGHT_PX = 132
/** Below this, labels stop being legible; above it, a short chain looks cartoonish. */
const MIN_SCALE = 11
const MAX_SCALE = 24
/** Pixels of margin around the diagram, enough for the outermost atom labels. */
const PADDING = 14
/** Offset of the two lines of a double bond, as a fraction of the scale. */
const DOUBLE_BOND_OFFSET = 0.08

interface Placed {
  readonly node: DepictionNode
  readonly cx: number
  readonly cy: number
}

export function Depiction2D({
  residues,
  theme,
  highlightKey,
  onHoverAtom,
}: {
  residues: readonly Residue[]
  theme: Theme
  /** `residueIndex:atomName` to emphasise — set by a hover in either view. */
  highlightKey?: string | null | undefined
  /** Reports the atom under the pointer so the 3D view can highlight it too. */
  onHoverAtom?: ((atom: { residueIndex: number; atomName: string } | null) => void) | undefined
}) {
  const { placed, byKey, edges, width, height, scale, formula, atomCount } = useMemo(() => {
    const depiction = depict(residues)
    const unitScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, TARGET_HEIGHT_PX / Math.max(depiction.height, 1)),
    )
    const xs = depiction.nodes.map((node) => node.x)
    const ys = depiction.nodes.map((node) => node.y)
    const minX = Math.min(...xs, 0)
    // SVG y grows downward and the layout's grows upward, so the sign flips here.
    const maxY = Math.max(...ys, 0)

    const list: Placed[] = depiction.nodes.map((node) => ({
      node,
      cx: PADDING + (node.x - minX) * unitScale,
      cy: PADDING + (maxY - node.y) * unitScale,
    }))

    return {
      placed: list,
      byKey: new Map(list.map((entry) => [entry.node.key, entry])),
      edges: depiction.edges,
      width: PADDING * 2 + depiction.width * unitScale,
      height: PADDING * 2 + depiction.height * unitScale,
      scale: unitScale,
      formula: formatFormula(molecularFormula(residues)),
      atomCount: depiction.nodes.filter((node) => node.isRealAtom).length,
    }
  }, [residues])

  if (residues.length === 0) {
    return (
      <div className="depiction empty-depiction">
        <span className="hint">2D formula appears as you add residues.</span>
      </div>
    )
  }

  const colorOf = ELEMENT_COLOR[theme]
  const highlightColor = HIGHLIGHT_COLOR[theme]
  // Everything sized off the scale, so the diagram stays proportioned as it shrinks.
  const nodeRadius = scale * 0.35
  /** Bare vertices need less clearance than a labelled circle. */
  const insetFor = (labelled: boolean) => (labelled ? nodeRadius + 1 : nodeRadius * 0.4 + 1)
  const labelSize = scale * 0.32
  const doubleOffset = scale * DOUBLE_BOND_OFFSET

  /** One bond, inset at both ends and doubled if the layout says so. */
  const renderEdge = (edge: DepictionEdge, index: number) => {
    const from = byKey.get(edge.from)
    const to = byKey.get(edge.to)
    if (!from || !to) return null

    const dx = to.cx - from.cx
    const dy = to.cy - from.cy
    const length = Math.hypot(dx, dy) || 1
    const ux = dx / length
    const uy = dy / length
    const fromInset = insetFor(from.node.showLabel)
    const toInset = insetFor(to.node.showLabel)
    const x1 = from.cx + ux * fromInset
    const y1 = from.cy + uy * fromInset
    const x2 = to.cx - ux * toInset
    const y2 = to.cy - uy * toInset

    if (!edge.double) {
      return (
        <line
          key={`${edge.from}-${edge.to}-${index}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          className={`bond bond-${edge.kind.toLowerCase()}`}
        />
      )
    }

    // Perpendicular offset for the second line of a double bond.
    const px = -uy * doubleOffset
    const py = ux * doubleOffset
    return (
      <g key={`${edge.from}-${edge.to}-${index}`}>
        <line x1={x1 + px} y1={y1 + py} x2={x2 + px} y2={y2 + py} className="bond bond-carbonyl" />
        <line x1={x1 - px} y1={y1 - py} x2={x2 - px} y2={y2 - py} className="bond bond-carbonyl" />
      </g>
    )
  }

  return (
    <div className="depiction">
      <div className="depiction-head">
        <span className="formula">{formula}</span>
        <span className="depiction-tally">
          {residues.length} {residues.length === 1 ? 'residue' : 'residues'} · {atomCount} atoms
        </span>
      </div>

      <div className="depiction-scroll">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`2D structural formula: ${formula}, ${residues.length} residues`}
        >
          <g className="bonds">{edges.map(renderEdge)}</g>
          <g className="atoms">
            {placed.map(({ node, cx, cy }) => {
              const highlighted = node.isRealAtom && highlightKey === node.key
              const radius = node.showLabel ? nodeRadius : nodeRadius * 0.4
              return (
                <g
                  key={node.key}
                  className={node.isRealAtom ? 'atom' : 'atom cap'}
                  {...(onHoverAtom && node.isRealAtom
                    ? {
                        onPointerEnter: () =>
                          onHoverAtom({
                            residueIndex: node.residueIndex,
                            atomName: node.atomName,
                          }),
                        onPointerLeave: () => onHoverAtom(null),
                      }
                    : {})}
                >
                  {/* A ring around the hovered atom rather than a colour swap: the
                      2D view is small, and recolouring a 3 px vertex is invisible
                      where a halo around it is not. */}
                  {highlighted && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius + Math.max(3, scale * 0.18)}
                      className="atom-halo"
                      stroke={highlightColor}
                    />
                  )}
                  {/* Unlabelled carbons are bare vertices, drawn small — the skeletal
                      convention, and what keeps an aromatic ring legible. */}
                  <circle cx={cx} cy={cy} r={radius} fill={colorOf[node.element]} />
                  {/* An invisible, larger hit area: a 3 px vertex is not a target. */}
                  {onHoverAtom && node.isRealAtom && (
                    <circle cx={cx} cy={cy} r={Math.max(radius, scale * 0.42)} className="atom-hit" />
                  )}
                  {node.showLabel && (
                    <text x={cx} y={cy} fontSize={labelSize} className="atom-label">
                      {node.label}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </svg>
      </div>
    </div>
  )
}
