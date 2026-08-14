/**
 * The 2D skeletal depiction: a chain's topology laid out on a plane.
 *
 * Pure and framework-free, and derived data in exactly the sense lib/bonds.ts is —
 * recomputed from the residue list, never stored. It emits abstract coordinates in
 * arbitrary units; turning those into pixels is the renderer's job.
 *
 * **This is a depiction, not a projection.** The layout is deterministic and
 * topological: it ignores the 3D coordinates entirely, and two structures with the
 * same sequence draw identically no matter what their φ/ψ/χ are. That is the point
 * — a chemical formula is supposed to show connectivity, and a flattened projection
 * of the real geometry would be a worse diagram *and* a redundant one, since the 3D
 * view is right there.
 *
 * Layout rules, in full:
 *
 *  - The main chain runs left to right as a zig-zag: N and C on the baseline, Cα
 *    raised. This is how peptides are conventionally drawn.
 *  - Each carbonyl O hangs below its C, with a double bond.
 *  - Side chains grow upward from Cα, one row per bond from Cβ.
 *  - Rings are laid out as regular polygons rather than as fans of a tree, because
 *    a phenylalanine drawn as a fan does not read as a benzene ring. Ring
 *    membership is found from the closure bonds the topology already declares.
 *  - The termini get the H₂N and OH groups that a drawn formula needs but the
 *    structure does not place.
 */

import { SIDE_CHAIN_TOPOLOGY } from './sidechainTopology.ts'
import { elementOf } from './sidechains.ts'
import type { AminoAcidCode, Element, Residue } from './types.ts'

/** Layout units. One unit is roughly one bond. */
const RESIDUE_WIDTH = 3
const ZIGZAG_RISE = 0.75
/** How far below its C the carbonyl O sits. */
const CARBONYL_DROP = 1
/** Vertical gap between one side-chain shell and the next. */
const SIDE_CHAIN_RISE = 1
/** Horizontal separation between two branches off the same atom. */
const BRANCH_SPREAD = 0.85

export interface DepictionNode {
  /** `${residueIndex}:${atomName}` — the key stage 10 highlights by. */
  readonly key: string
  readonly residueIndex: number
  /** The PDB atom name, or a synthetic name for a terminus cap. */
  readonly atomName: string
  /** What to draw: `'Cα'`, `'N'`, `'H₂N'`, `'OH'`. */
  readonly label: string
  /**
   * Whether to write the label, following skeletal-formula convention.
   *
   * A chemical structure labels heteroatoms and leaves carbons as bare vertices —
   * writing "C" on every corner of a benzene ring is what makes a hand-drawn
   * structure unreadable, and it is redundant besides. Two carbons are exceptions:
   * Cα and Cβ, whose Greek positions are the vocabulary this whole tool is about.
   */
  readonly showLabel: boolean
  readonly element: Element
  readonly x: number
  readonly y: number
  /**
   * False for the terminus caps, which stand for atoms the structure does not
   * place. Only real nodes can be highlighted from the 3D view.
   */
  readonly isRealAtom: boolean
}

export type DepictionEdgeKind = 'BACKBONE' | 'CARBONYL' | 'SIDECHAIN' | 'CAP'

export interface DepictionEdge {
  readonly from: string
  readonly to: string
  readonly kind: DepictionEdgeKind
  /** Drawn as a double line. The carbonyl C=O and the carboxylate. */
  readonly double: boolean
}

export interface Depiction {
  readonly nodes: readonly DepictionNode[]
  readonly edges: readonly DepictionEdge[]
  readonly width: number
  readonly height: number
}

const EMPTY: Depiction = { nodes: [], edges: [], width: 0, height: 0 }

/** Display label for an atom in the diagram. */
function labelFor(atomName: string): string {
  if (atomName === 'CA') return 'Cα'
  if (atomName === 'CB') return 'Cβ'
  return atomName
}

/** Carbons named for their Greek position that are worth labelling anyway. */
const ALWAYS_LABELLED = new Set(['CA', 'CB'])

function showLabelFor(atomName: string): boolean {
  return ALWAYS_LABELLED.has(atomName) || elementOf(atomName) !== 'C'
}

/**
 * The atoms of every ring in a side chain, keyed by the ring's entry atom.
 *
 * A ring closure joins two atoms already connected through the placement tree, so
 * the cycle is that tree path plus the closure bond. The entry atom is the one
 * nearest Cα — the ring's attachment point, and where the polygon gets anchored.
 */
function ringsOf(aminoAcid: AminoAcidCode): Map<string, string[]> {
  const topology = SIDE_CHAIN_TOPOLOGY[aminoAcid]
  const parent = new Map<string, string>()
  for (const atom of topology.atoms) parent.set(atom.name, atom.bondedTo)

  const rings = new Map<string, string[]>()

  for (const [a, b] of topology.ringClosures) {
    // Walk both endpoints back toward Cα and find where the paths meet.
    const pathOf = (start: string): string[] => {
      const path = [start]
      let current = start
      while (parent.has(current)) {
        current = parent.get(current)!
        path.push(current)
      }
      return path
    }
    const pathA = pathOf(a)
    const pathB = pathOf(b)
    const inB = new Set(pathB)
    const join = pathA.find((name) => inB.has(name))
    if (!join) continue

    const upA = pathA.slice(0, pathA.indexOf(join))
    const upB = pathB.slice(0, pathB.indexOf(join))
    // Ordered around the cycle: from the join outward along branch A, across the
    // closure bond, then back down branch B to the join. Both paths run outside-in,
    // so A is reversed and B is not — get this wrong and the polygon's vertices are
    // in the wrong order, which draws a ring with the right atoms and the wrong
    // bonds. Pinned by comparing the edge set against lib/bonds.ts.
    rings.set(join, [join, ...[...upA].reverse(), ...upB])
  }

  return rings
}

/**
 * Lay out one residue's side chain, growing upward from Cα.
 *
 * Returns the placed nodes and the bonds between them. Rings are placed as regular
 * polygons anchored at their entry atom; everything else is a simple tree walk
 * where siblings spread horizontally.
 */
function layOutSideChain(
  residue: Residue,
  residueIndex: number,
  caX: number,
  caY: number,
): { nodes: DepictionNode[]; edges: DepictionEdge[] } {
  const topology = SIDE_CHAIN_TOPOLOGY[residue.aminoAcid]
  if (topology.atoms.length === 0) return { nodes: [], edges: [] }

  const children = new Map<string, string[]>()
  for (const atom of topology.atoms) {
    const list = children.get(atom.bondedTo) ?? []
    list.push(atom.name)
    children.set(atom.bondedTo, list)
  }

  const rings = ringsOf(residue.aminoAcid)
  const position = new Map<string, { x: number; y: number }>([['CA', { x: caX, y: caY }]])
  const nodes: DepictionNode[] = []
  const edges: DepictionEdge[] = []
  const placedRings = new Set<string>()

  const key = (name: string) => `${residueIndex}:${name}`

  const emit = (name: string, x: number, y: number) => {
    position.set(name, { x, y })
    nodes.push({
      key: key(name),
      residueIndex,
      atomName: name,
      label: labelFor(name),
      showLabel: showLabelFor(name),
      element: elementOf(name),
      x,
      y,
      isRealAtom: true,
    })
  }

  const bond = (from: string, to: string) => {
    edges.push({ from: key(from), to: key(to), kind: 'SIDECHAIN', double: false })
  }

  /** Place `name` at (x, y), then everything hanging off it. */
  const walk = (name: string, x: number, y: number): void => {
    const ring = rings.get(name)
    if (ring && !placedRings.has(name)) {
      placedRings.add(name)
      placeRing(ring, x, y)
      return
    }

    emit(name, x, y)
    const kids = (children.get(name) ?? []).filter((kid) => !position.has(kid))
    const spread = ((kids.length - 1) * BRANCH_SPREAD) / 2
    kids.forEach((kid, i) => {
      const kidX = x - spread + i * BRANCH_SPREAD
      const kidY = y + SIDE_CHAIN_RISE
      walk(kid, kidX, kidY)
      bond(name, kid)
    })
  }

  /**
   * Place a ring's atoms on a regular polygon.
   *
   * The entry atom sits at the bottom vertex and the ring rises from it, which
   * keeps the whole side chain growing in one direction. Non-ring substituents on
   * ring atoms (tyrosine's Oη, tryptophan's second ring) are walked afterwards.
   */
  const placeRing = (ring: readonly string[], entryX: number, entryY: number): void => {
    const n = ring.length
    // Circumradius of a regular n-gon with unit sides.
    const radius = 0.5 / Math.sin(Math.PI / n)
    const centreX = entryX
    const centreY = entryY + radius
    // Start at the bottom vertex (pointing down from the centre) and go round.
    ring.forEach((name, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / n
      emit(name, centreX + radius * Math.cos(angle), centreY + radius * Math.sin(angle))
    })
    // Ring bonds, including the closure that makes it a ring.
    ring.forEach((name, i) => bond(name, ring[(i + 1) % n]!))

    // Substituents and fused rings hanging off ring atoms.
    for (const name of ring) {
      const here = position.get(name)!
      const kids = (children.get(name) ?? []).filter((kid) => !position.has(kid))
      const spread = ((kids.length - 1) * BRANCH_SPREAD) / 2
      kids.forEach((kid, i) => {
        // Push outward from the ring centre so a fused ring doesn't overlap it.
        const dx = here.x - centreX
        const dy = here.y - centreY
        const length = Math.hypot(dx, dy) || 1
        const outX = here.x + (dx / length) * SIDE_CHAIN_RISE - spread + i * BRANCH_SPREAD
        const outY = here.y + (dy / length) * SIDE_CHAIN_RISE
        walk(kid, outX, outY)
        bond(name, kid)
      })
    }
  }

  // Cβ, and everything above it.
  walk('CB', caX, caY + SIDE_CHAIN_RISE)
  edges.push({ from: key('CA'), to: key('CB'), kind: 'SIDECHAIN', double: false })

  // Any ring closure not already drawn. Two cases reach here:
  //
  //  - **Proline**, whose ring closes onto the backbone N. Its cycle includes N and
  //    Cα, so it cannot be a polygon anchored under Cα, and the tree walk places it
  //    with the closing bond drawn back to N — visibly cyclic without pretending to
  //    be a neat pentagon.
  //  - **Tryptophan's second ring**, fused to the first. The first is placed as a
  //    polygon; the second shares two of its atoms, so it comes out of the tree walk
  //    with its closure drawn.
  //
  // Without this the 2D view would silently have one fewer bond than the 3D one,
  // which is exactly what tests/depiction.test.ts checks against.
  const drawn = new Set(edges.map((edge) => [edge.from, edge.to].sort().join('|')))
  for (const [a, b] of topology.ringClosures) {
    const pair = [key(a), key(b)].sort().join('|')
    if (drawn.has(pair)) continue
    edges.push({ from: key(a), to: key(b), kind: 'SIDECHAIN', double: false })
  }

  return { nodes, edges }
}

/**
 * Lay out a whole chain.
 *
 * An empty residue list gives an empty depiction — the blank canvas, not an error.
 */
export function depict(residues: readonly Residue[]): Depiction {
  if (residues.length === 0) return EMPTY

  const nodes: DepictionNode[] = []
  const edges: DepictionEdge[] = []
  const key = (residueIndex: number, name: string) => `${residueIndex}:${name}`

  residues.forEach((residue, i) => {
    const baseX = i * RESIDUE_WIDTH
    const push = (name: string, x: number, y: number) => {
      nodes.push({
        key: key(i, name),
        residueIndex: i,
        atomName: name,
        label: labelFor(name),
        showLabel: showLabelFor(name),
        element: elementOf(name),
        x,
        y,
        isRealAtom: true,
      })
    }

    // Zig-zag: N and C on the baseline, Cα raised between them.
    push('N', baseX, 0)
    push('CA', baseX + 1, ZIGZAG_RISE)
    push('C', baseX + 2, 0)
    push('O', baseX + 2, -CARBONYL_DROP)

    edges.push({ from: key(i, 'N'), to: key(i, 'CA'), kind: 'BACKBONE', double: false })
    edges.push({ from: key(i, 'CA'), to: key(i, 'C'), kind: 'BACKBONE', double: false })
    edges.push({ from: key(i, 'C'), to: key(i, 'O'), kind: 'CARBONYL', double: true })

    if (i + 1 < residues.length) {
      edges.push({ from: key(i, 'C'), to: key(i + 1, 'N'), kind: 'BACKBONE', double: false })
    }

    const sideChain = layOutSideChain(residue, i, baseX + 1, ZIGZAG_RISE)
    nodes.push(...sideChain.nodes)
    edges.push(...sideChain.edges)
  })

  // Terminus caps: groups a drawn formula needs and the structure doesn't place.
  const last = residues.length - 1
  const capNodes: DepictionNode[] = [
    {
      key: 'cap:N',
      residueIndex: 0,
      atomName: 'H2N',
      label: 'H₂N',
      showLabel: true,
      element: 'N',
      x: -1,
      y: 0,
      isRealAtom: false,
    },
    {
      key: 'cap:C',
      residueIndex: last,
      atomName: 'OXT',
      label: 'OH',
      showLabel: true,
      element: 'O',
      x: last * RESIDUE_WIDTH + 3,
      y: 0,
      isRealAtom: false,
    },
  ]
  nodes.push(...capNodes)
  edges.push({ from: 'cap:N', to: key(0, 'N'), kind: 'CAP', double: false })
  edges.push({ from: key(last, 'C'), to: 'cap:C', kind: 'CAP', double: false })

  const xs = nodes.map((n) => n.x)
  const ys = nodes.map((n) => n.y)

  return {
    nodes,
    edges,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  }
}
