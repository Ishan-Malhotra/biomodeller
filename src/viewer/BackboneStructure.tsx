/**
 * Ball-and-stick rendering of a computed backbone.
 *
 * Read-only in the strictest sense: this component takes the derived `Atom[]`
 * and draws it. It holds no state, and it neither transforms nor rounds a single
 * coordinate — atoms are drawn exactly where the chain builder put them, in the
 * canonical frame.
 *
 * Everything is instanced: one draw call for all the balls, one for all the
 * sticks, regardless of chain length. That matters for step 5, where this
 * re-renders on every keystroke in the residue list.
 */

import { Instance, Instances } from '@react-three/drei'
import { useMemo } from 'react'
import { Quaternion, Vector3 } from 'three'

import { backboneBonds } from '../../lib/bonds.ts'
import { add, distance, scale, sub, type Vec3 } from '../../lib/nerf.ts'
import type { Atom } from '../../lib/types.ts'
import type { Theme } from '../theme.ts'
import { BOND_RADIUS, ELEMENT_COLOR, ELEMENT_RADIUS } from './atomStyle.ts'

/** Three.js cylinders are built along +Y; bond orientations are measured from it. */
const CYLINDER_AXIS = new Vector3(0, 1, 0)

const toTuple = (v: Vec3): [number, number, number] => [v.x, v.y, v.z]

/** One half of a bond, coloured by the atom it grows out of. */
interface Stick {
  readonly key: string
  readonly position: [number, number, number]
  readonly quaternion: Quaternion
  readonly length: number
  readonly radius: number
  readonly color: string
}

/**
 * Split each bond at its midpoint so each half takes its own atom's colour —
 * the standard ball-and-stick convention, and it makes the N/C/O alternation
 * along the chain legible without labels.
 */
function sticksOf(atoms: readonly Atom[], theme: Theme): Stick[] {
  const sticks: Stick[] = []
  const colorOf = ELEMENT_COLOR[theme]

  for (const bond of backboneBonds(atoms)) {
    const a = atoms[bond.a]
    const b = atoms[bond.b]
    if (!a || !b) continue

    const length = distance(a.position, b.position)
    if (length === 0) continue

    const direction = scale(sub(b.position, a.position), 1 / length)
    const quaternion = new Quaternion().setFromUnitVectors(
      CYLINDER_AXIS,
      new Vector3(direction.x, direction.y, direction.z),
    )
    const half = length / 2
    const radius = BOND_RADIUS[bond.kind]

    for (const [end, from] of [
      [a, 0.25],
      [b, 0.75],
    ] as const) {
      sticks.push({
        key: `${bond.a}-${bond.b}-${end.name}`,
        position: toTuple(add(a.position, scale(sub(b.position, a.position), from))),
        quaternion,
        length: half,
        radius,
        color: colorOf[end.element],
      })
    }
  }

  return sticks
}

/** What an atom click reports. Enough to address the atom, not its position. */
export interface AtomRef {
  readonly residueIndex: number
  readonly atomName: string
}

export function BackboneStructure({
  atoms,
  theme,
  onPickAtom,
}: {
  atoms: readonly Atom[]
  theme: Theme
  /**
   * Set while the coordinate panel is waiting for an anchor. Only wired up when
   * non-null, so the raycaster does no work in the normal case.
   */
  onPickAtom?: ((atom: AtomRef) => void) | undefined
}) {
  const sticks = useMemo(() => sticksOf(atoms, theme), [atoms, theme])

  // The blank canvas: nothing computed, nothing drawn.
  if (atoms.length === 0) return null

  return (
    <group>
      <Instances key={`atoms-${atoms.length}`} limit={atoms.length}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial roughness={0.35} metalness={0.05} />
        {atoms.map((atom, i) => (
          <Instance
            key={`${atom.residueId}-${atom.name}-${i}`}
            position={toTuple(atom.position)}
            scale={ELEMENT_RADIUS[atom.element]}
            color={ELEMENT_COLOR[theme][atom.element]}
            {...(onPickAtom
              ? {
                  onClick: (event: { stopPropagation: () => void }) => {
                    // Without this the click also reaches whatever is behind the
                    // atom, and the furthest atom along the ray would win.
                    event.stopPropagation()
                    onPickAtom({ residueIndex: atom.residueIndex, atomName: atom.name })
                  },
                }
              : {})}
          />
        ))}
      </Instances>

      <Instances key={`bonds-${sticks.length}`} limit={Math.max(sticks.length, 1)}>
        {/* Unit cylinder: radius 1, height 1, scaled per instance. */}
        <cylinderGeometry args={[1, 1, 1, 12, 1, false]} />
        <meshStandardMaterial roughness={0.45} metalness={0.05} />
        {sticks.map((stick) => (
          <Instance
            key={stick.key}
            position={stick.position}
            quaternion={stick.quaternion}
            scale={[stick.radius, stick.length, stick.radius]}
            color={stick.color}
          />
        ))}
      </Instances>
    </group>
  )
}
