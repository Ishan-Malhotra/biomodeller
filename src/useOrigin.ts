/**
 * The reference-frame / origin control's state.
 *
 * Sits *above* `useChain` and consumes its output: the chain hook stays purely
 * angles → atoms, and this hook moves the finished atoms. That layering is the
 * decoupling claude.md asks for, expressed as a dependency direction — this module
 * imports nothing from the chain builder, so it has no way to affect an angle even
 * by accident.
 *
 * One idea covers both things the panel offers. An origin is an *anchor* atom, a
 * *target* position that anchor should sit at, and an orientation. Then:
 *
 *   - "Put the structure at (3, 0, 0)"  → anchor = Cα of residue 1, target = typed
 *   - "Make this atom the origin"       → anchor = the clicked atom, target = (0,0,0)
 *
 * Both are `frameOn(anchor, target, rotation)`. The panel is two ways of choosing
 * an anchor, not two features.
 *
 * The anchor is resolved against the *canonical* (untransformed) atoms. Resolving
 * it against the transformed ones would feed the transform its own output and the
 * structure would walk away across renders.
 */

import { useCallback, useMemo, useState } from 'react'

import { atomLabel } from '../lib/naming.ts'
import { vec3, type Vec3 } from '../lib/nerf.ts'
import {
  applyToAtoms,
  frameOn,
  IDENTITY_TRANSFORM,
  quatFromEulerDegrees,
  type RigidTransform,
} from '../lib/transform.ts'
import type { Atom } from '../lib/types.ts'

/**
 * Which atom the frame is pinned to.
 *
 * `first-ca` is by name rather than by index so it survives editing: Cα of residue
 * 1 stays the anchor when residues are added, removed or reordered, which a stored
 * index would not.
 */
export type Anchor =
  | { readonly kind: 'first-ca' }
  | { readonly kind: 'atom'; readonly residueIndex: number; readonly atomName: string }

export interface OriginSpec {
  /** Whether the coordinate frame is being controlled at all. */
  readonly enabled: boolean
  readonly anchor: Anchor
  /** Where the anchor should sit, in ångströms. */
  readonly target: Vec3
  /** Euler degrees, extrinsic XYZ — see `quatFromEulerDegrees`. */
  readonly rotation: Vec3
  readonly showGrid: boolean
  /** Grid cell size in ångströms. */
  readonly gridSpacing: number
}

/** Å. One ångström per cell — roughly two thirds of a bond, so bonds span cells. */
const DEFAULT_GRID_SPACING = 1

export const DEFAULT_ORIGIN: OriginSpec = {
  enabled: false,
  anchor: { kind: 'first-ca' },
  target: vec3(0, 0, 0),
  rotation: vec3(0, 0, 0),
  showGrid: true,
  gridSpacing: DEFAULT_GRID_SPACING,
}

/** The atom an anchor refers to, or null if it refers to nothing (yet). */
function resolveAnchor(anchor: Anchor, atoms: readonly Atom[]): Atom | null {
  if (anchor.kind === 'first-ca') {
    return atoms.find((atom) => atom.residueIndex === 0 && atom.name === 'CA') ?? null
  }
  return (
    atoms.find(
      (atom) => atom.residueIndex === anchor.residueIndex && atom.name === anchor.atomName,
    ) ?? null
  )
}

export interface OriginFrame {
  readonly spec: OriginSpec
  /** The transform in force. Identity whenever the control is off. */
  readonly transform: RigidTransform
  /** The atoms to draw and to read coordinates from. */
  readonly atoms: readonly Atom[]
  /** The anchor's description for the panel, e.g. `'Cα · ALA 1'`. */
  readonly anchorLabel: string
  readonly setEnabled: (enabled: boolean) => void
  readonly setAnchor: (anchor: Anchor) => void
  readonly setTarget: (target: Vec3) => void
  readonly setRotation: (rotation: Vec3) => void
  readonly setShowGrid: (show: boolean) => void
  readonly setGridSpacing: (spacing: number) => void
  /** Back to the canonical frame, leaving the panel open. */
  readonly reset: () => void
}

export function useOrigin(canonicalAtoms: readonly Atom[]): OriginFrame {
  const [spec, setSpec] = useState<OriginSpec>(DEFAULT_ORIGIN)

  const anchorAtom = useMemo(
    () => resolveAnchor(spec.anchor, canonicalAtoms),
    [spec.anchor, canonicalAtoms],
  )

  const transform = useMemo<RigidTransform>(() => {
    // Nothing to pin to — an empty chain, or an anchor whose residue has since been
    // deleted. Fall back to the canonical frame rather than to a wrong one.
    if (!spec.enabled || !anchorAtom) return IDENTITY_TRANSFORM
    return frameOn(
      anchorAtom.position,
      spec.target,
      quatFromEulerDegrees(spec.rotation.x, spec.rotation.y, spec.rotation.z),
    )
  }, [spec.enabled, spec.target, spec.rotation, anchorAtom])

  // `applyToAtoms` returns its input unchanged for the identity, so the default
  // state costs nothing and the atoms stay referentially stable.
  const atoms = useMemo(() => applyToAtoms(transform, canonicalAtoms), [transform, canonicalAtoms])

  const anchorLabel = useMemo(() => {
    if (!anchorAtom) return spec.anchor.kind === 'first-ca' ? 'Cα of residue 1' : 'atom removed'
    return atomLabel(anchorAtom.name, anchorAtom.aminoAcid, anchorAtom.residueIndex)
  }, [anchorAtom, spec.anchor.kind])

  const patch = useCallback(
    (fields: Partial<OriginSpec>) => setSpec((current) => ({ ...current, ...fields })),
    [],
  )

  const actions = useMemo(
    () => ({
      setEnabled: (enabled: boolean) => patch({ enabled }),
      setAnchor: (anchor: Anchor) => patch({ anchor }),
      setTarget: (target: Vec3) => patch({ target }),
      setRotation: (rotation: Vec3) => patch({ rotation }),
      setShowGrid: (showGrid: boolean) => patch({ showGrid }),
      setGridSpacing: (gridSpacing: number) => patch({ gridSpacing }),
      reset: () =>
        patch({
          anchor: DEFAULT_ORIGIN.anchor,
          target: DEFAULT_ORIGIN.target,
          rotation: DEFAULT_ORIGIN.rotation,
        }),
    }),
    [patch],
  )

  return { spec, transform, atoms, anchorLabel, ...actions }
}
