/**
 * The 3D viewport: a camera, lights, orbit controls, and the structure.
 *
 * The camera adapts to the structure; the structure never adapts to the camera.
 * `frameCamera` (lib/framing.ts) computes where to stand to see everything, and
 * that is the full extent of the coupling — no atom is scaled, centred, or
 * re-oriented for the view's benefit. Moving the structure itself is a different
 * feature entirely (the reference-frame control, step 6).
 *
 * Framing is applied on mount and on explicit request, not on every edit: once
 * the residue list is editable, a camera that re-framed on each keystroke would
 * fight the user's own orbiting.
 */

import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect } from 'react'

import { frameCamera } from '../../lib/framing.ts'
import { vec3 } from '../../lib/nerf.ts'
import type { Atom } from '../../lib/types.ts'
import type { Theme } from '../theme.ts'
import { SCENE_LIGHTING } from './atomStyle.ts'
import { BackboneStructure, type AtomRef } from './BackboneStructure.tsx'
import { OriginGrid } from './OriginGrid.tsx'

/** Vertical field of view, degrees. Must match what `frameCamera` is told. */
const VERTICAL_FOV = 45

/**
 * Margin around the structure's bounding sphere. Small, because the sphere is
 * already a loose fit for an elongated molecule — a 27 Å helix is mostly empty
 * sphere, so generous padding on top of that reads as a tiny structure adrift in
 * the frame.
 */
const FRAME_PADDING = 1.08

/**
 * Slightly off-axis so the first thing you see reads as three-dimensional; a
 * dead-on view of a helix looks deceptively flat.
 */
const VIEW_DIRECTION = vec3(0.45, 0.3, 1)

/** Å. Keeps the camera outside a single residue, whose radius is ~1 Å. */
const MIN_CAMERA_DISTANCE = 9

/** The subset of OrbitControls this component drives. */
interface OrbitTarget {
  readonly target: { set(x: number, y: number, z: number): void }
  update(): void
}

/**
 * Points the camera at the whole structure.
 *
 * Re-runs when `fitToken` changes, so the parent can offer an explicit "fit
 * view" without the camera moving on its own.
 */
function FitCamera({ atoms, fitToken }: { atoms: readonly Atom[]; fitToken: number }) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as OrbitTarget | null

  useEffect(() => {
    const { position, target } = frameCamera(atoms, {
      verticalFovDeg: VERTICAL_FOV,
      padding: FRAME_PADDING,
      direction: VIEW_DIRECTION,
      minDistance: MIN_CAMERA_DISTANCE,
    })
    camera.position.set(position.x, position.y, position.z)
    camera.lookAt(target.x, target.y, target.z)
    controls?.target.set(target.x, target.y, target.z)
    controls?.update()
    // `atoms` is intentionally not a dependency: re-framing belongs to the user,
    // via fitToken, not to every geometry change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken, camera, controls])

  return null
}

export function StructureViewport({
  atoms,
  theme,
  fitToken = 0,
  grid,
  onPickAtom,
  onHoverAtom,
  highlightKey,
}: {
  atoms: readonly Atom[]
  theme: Theme
  fitToken?: number
  /** Gridlines and the axis triad, when the coordinate frame is being controlled. */
  grid?: { readonly spacing: number } | undefined
  onPickAtom?: ((atom: AtomRef) => void) | undefined
  onHoverAtom?: ((atom: AtomRef | null) => void) | undefined
  highlightKey?: string | null | undefined
}) {
  const lighting = SCENE_LIGHTING[theme]

  return (
    // The canvas is transparent, so the viewport's own --canvas token shows
    // through as the background and follows the theme for free.
    <Canvas camera={{ fov: VERTICAL_FOV, near: 0.1, far: 5000 }} dpr={[1, 2]}>
      <ambientLight intensity={lighting.ambient} />
      <hemisphereLight intensity={lighting.hemisphere} groundColor={lighting.hemisphereGround} />
      <directionalLight position={[1, 2, 3]} intensity={lighting.key} />
      <directionalLight position={[-2, -1, -2]} intensity={lighting.fill} />

      {grid && <OriginGrid spacing={grid.spacing} theme={theme} />}

      <BackboneStructure
        atoms={atoms}
        theme={theme}
        onPickAtom={onPickAtom}
        onHoverAtom={onHoverAtom}
        highlightKey={highlightKey}
      />

      <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
      <FitCamera atoms={atoms} fitToken={fitToken} />
    </Canvas>
  )
}
