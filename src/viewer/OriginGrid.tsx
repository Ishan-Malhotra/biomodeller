/**
 * Gridlines and an axis triad marking the coordinate frame.
 *
 * Purely a reference overlay. It draws where the origin *is*; it never moves an
 * atom and it is deliberately invisible to `lib/framing.ts`, which fits the camera
 * to atoms — grid lines are not atoms, so a large grid cannot pull the camera back
 * and shrink the structure.
 *
 * The grid sits on the world XZ plane through y = 0 rather than through the
 * structure, because the whole point of the feature is that the frame is fixed and
 * the molecule is placed *into* it.
 */

import { Grid, Line } from '@react-three/drei'

import type { Theme } from '../theme.ts'

/** Å. Every `SECTION_CELLS`-th line is drawn heavier, like graph paper. */
const SECTION_CELLS = 5

/** Å. How far the axis lines extend either side of the origin. */
const AXIS_HALF_LENGTH = 12

/**
 * Grid line colours per theme. Kept low-contrast on purpose: the grid is a
 * reference, and a grid that competes with the structure is a worse grid.
 */
const GRID_COLORS: Record<Theme, { cell: string; section: string }> = {
  light: { cell: '#d8dce3', section: '#b9c0cb' },
  dark: { cell: '#2b313c', section: '#3d4553' },
}

/** X red, Y green, Z blue — the convention every CAD and 3D tool shares. */
const AXIS_COLORS = {
  x: '#d9453c',
  y: '#3f9e4d',
  z: '#3b6fd4',
} as const

export function OriginGrid({
  spacing,
  theme,
  showAxes = true,
}: {
  spacing: number
  theme: Theme
  showAxes?: boolean
}) {
  const colors = GRID_COLORS[theme]

  return (
    <group>
      <Grid
        // Infinite and camera-following, so panning never runs off the edge of it.
        infiniteGrid
        followCamera={false}
        cellSize={spacing}
        sectionSize={spacing * SECTION_CELLS}
        cellThickness={0.6}
        sectionThickness={1}
        cellColor={colors.cell}
        sectionColor={colors.section}
        fadeDistance={90}
        fadeStrength={1.5}
      />

      {showAxes && (
        <>
          <Line
            points={[
              [-AXIS_HALF_LENGTH, 0, 0],
              [AXIS_HALF_LENGTH, 0, 0],
            ]}
            color={AXIS_COLORS.x}
            lineWidth={1.5}
          />
          <Line
            points={[
              [0, -AXIS_HALF_LENGTH, 0],
              [0, AXIS_HALF_LENGTH, 0],
            ]}
            color={AXIS_COLORS.y}
            lineWidth={1.5}
          />
          <Line
            points={[
              [0, 0, -AXIS_HALF_LENGTH],
              [0, 0, AXIS_HALF_LENGTH],
            ]}
            color={AXIS_COLORS.z}
            lineWidth={1.5}
          />
        </>
      )}
    </group>
  )
}
