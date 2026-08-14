# Build Log

A running record of what was built at each stage, why, and what was learned.
Stages follow the build order in `claude.md`.

Read this section to pick the work back up; the stage entries below are the
reasoning behind each decision, in the order they were made.

---

## Where things stand

**Last completed:** Stage 7 — Cartesian coordinates, origin control, gridlines.
**Next:** Stage 8 — side chains and χ angles. Plan at the bottom.

**Steps 1–6 of the `claude.md` build order are done**, plus a theme. The math is
validated against real PDB data, the chain builder recomputes only the affected
suffix, the app is a working Desmos-style editor over a live 3D viewport, and the
coordinate frame is user-definable.

Stages 6–10 implement a five-feature request; the full plan is in
`~/.claude/plans/compressed-shimmying-hinton.md`.

```
npm run dev        # http://localhost:5173 (no port is configured; --port 5273 was used ad hoc)
npm test           # 160 tests, all passing
npm run typecheck  # tsc -b, strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
npm run lint       # oxlint
npm run build      # tsc -b && vite build
npm run fixture    # regenerate tests/fixtures from tests/fixtures/1UBQ.pdb
```

### File map

Pure, framework-free, unit-tested — no React or Three.js imports anywhere in `lib/`:

| File | What it owns |
| --- | --- |
| `lib/constants.ts` | Engh & Huber ideal bond lengths/angles. The only place geometric numbers live. |
| `lib/nerf.ts` | Vector helpers and `placeAtom` — the NeRF placement itself. |
| `lib/types.ts` | `Residue` (the source of truth) and `Atom` (derived output). |
| `lib/chain.ts` | `buildBackbone`, `rebuildFrom`, `firstChangedIndex`, the canonical seed frame. |
| `lib/bonds.ts` | `backboneBonds` — bond topology from an atom list, by index, no distance cutoff. |
| `lib/framing.ts` | `boundingSphere`, `fitDistance`, `frameCamera` — moves the camera, never the structure. |
| `lib/edits.ts` | Residue-list edit operations, `wrapDegrees`, id generation. |
| `lib/transform.ts` | Rigid transforms (quaternion + translation). `frameOn` is both origin modes. |
| `lib/naming.ts` | `'CA'` → `'Cα'`. Naming, not geometry; three views need the same answer. |
| `lib/coordinates.ts` | The per-atom x/y/z readout rows. Fixed-decimal formatting. |

React layer:

| File | What it owns |
| --- | --- |
| `src/theme.ts` | `useTheme` — light/dark resolution, persistence, and the `data-theme` attribute. |
| `src/TopBar.tsx` | Title strip and the lightbulb toggle. Stage 9 fills the middle with the 2D view. |
| `src/useChain.ts` | The chain state. Holds `residues`; derives canonical `atoms` incrementally. |
| `src/useOrigin.ts` | The origin frame. Consumes `useChain`'s atoms and moves them rigidly. |
| `src/editor/NumberField.tsx` | The draft/commit numeric input. `AngleField` is a wrapper over it. |
| `src/editor/CoordinatePanel.tsx` | Origin anchor, target, orientation, gridlines, coordinate table. |
| `src/viewer/OriginGrid.tsx` | Gridlines and the X/Y/Z axis triad. Reference overlay only. |
| `src/editor/ResidueList.tsx` | The expression list: rows, add button, blank state, Enter-to-insert. |
| `src/editor/ResidueRow.tsx` | One row. Memoised. Marks the angles that have no geometric effect. |
| `src/editor/AngleField.tsx` | One dihedral input. Commits per keystroke; holds an uncommitted draft. |
| `src/viewer/StructureViewport.tsx` | Canvas, lights, `OrbitControls`, `FitCamera`. |
| `src/viewer/BackboneStructure.tsx` | Instanced ball-and-stick. Two draw calls at any chain length. |
| `src/viewer/atomStyle.ts` | CPK colours and display radii. Render-only; deliberately not in `lib/`. |
| `src/sampleChains.ts` | Example chains, loaded into the editable list. |
| `src/App.tsx` | Wires the editor to the viewport. Owns `fitToken`. |

Tests: `nerf.test.ts` (25), `render-data.test.ts` (22), `chain.test.ts` (21),
`edits.test.ts` (47), `transform.test.ts` (30), `coordinates.test.ts` (15).
Fixture: `tests/fixtures/1ubq-backbone.json`, generated from the deposited
`1UBQ.pdb` by `scripts/build-fixture.ts`.

### Invariants a later change must not break

These are the load-bearing rules. Each one has tests behind it; if a change makes
a test fail, the test is probably right.

1. **Angles are the source of truth; coordinates are derived.** There is no
   `setAtoms` anywhere and no atom position is ever written back into a `Residue`.
2. **No geometry post-processing.** No energy minimisation, clash relaxation, or
   smoothing — deterministic reconstruction from angles is the entire premise. If
   output should "look better", the fix is rendering or camera, never geometry.
3. **`lib/` imports no framework.** Verified structurally by `tsconfig.lib.json`,
   which typechecks `lib/` with no DOM lib at all.
4. **Residue 1 is seeded from the canonical frame, not derived by NeRF.** NeRF
   needs three prior atoms and residue 1 has none.
5. **An edit at residue *i* recomputes exactly the suffix from *i* onward**, and
   the reused prefix is the *same atom objects*, not equal copies.
6. **Framing moves the camera; the origin transform moves the structure.** Two
   separate code paths. `lib/framing.ts` only reads atoms; `lib/transform.ts` only
   writes positions, and imports nothing from the chain builder, so it has no way
   to reach an angle.
7. **Derived state flows one way:** `residues → useChain → canonical atoms →
   useOrigin → atoms in the user's frame`. The origin layer cannot invalidate the
   chain's suffix cache, and a test asserts it doesn't.
8. **Side chains hang off Cα as leaves** and never enter `ChainTip`, so they
   cannot affect backbone geometry (stage 8 onward).

### Known rough edges

- The fixed view direction in `StructureViewport.tsx` (0.45, 0.3, 1) happens to
  look close to along the helix axis, so a from-scratch α-helix reads as a tangle
  until you orbit. A framing fix (e.g. a direction perpendicular to the
  structure's longest axis), never a geometry one.
- No React component tests. The editor's logic lives in pure modules that are
  well covered, and the UI was verified by driving a real browser over CDP, but
  there is no automated regression net on the components themselves. Adding one
  means `@testing-library/react` + jsdom.
- `dist/` bundle is ~1.1 MB (305 kB gzipped), almost entirely Three.js. Fine for
  now; code-splitting is the fix if it ever matters.

---

## Stage 0 — Project scaffolding

**Date:** 2026-08-13

Set up the toolchain once so no later step needs re-tooling.

- Scaffolded Vite + React + TypeScript (`npm create vite@latest . -- --template react-ts`).
  React 19, Vite 8, TypeScript 6.
- Added Vitest (test runner) and tsx (to run the fixture generator as a script).
- `tsconfig.lib.json` — a third project reference covering `lib/`, `tests/`, and
  `scripts/`, node-targeted with no DOM lib, so the math module is typechecked
  independently of the React app. Strictness beyond the template default:
  `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. The same
  three flags were added to `tsconfig.app.json`. This code is heavily
  index-based, so unchecked indexing is a real source of silent bugs.
- Vitest configured in `vite.config.ts` with `include: ['tests/**/*.test.ts']`
  and a node environment.
- Scripts: `npm test`, `npm run test:watch`, `npm run typecheck`, `npm run fixture`.
- `git init` — the project was not under version control before this.

**Incident:** the Vite scaffolder cleared the directory despite `--overwrite ignore`,
deleting `claude.md` and `product.md`. Both were restored verbatim from the copies
read at the start of the session, and git was initialised immediately afterwards so
that class of loss can't recur. No content was lost.

**No UI code was written.** The React template files in `src/` are untouched
placeholders; the viewport is step 4.

---

## Stage 1 — `lib/constants.ts` and `lib/nerf.ts`

**Date:** 2026-08-13

### `lib/constants.ts`

Ideal backbone geometry as named constants — Engh & Huber restraint targets,
matching `product.md` §4.1:

- `BOND_LENGTH`: `N_CA` 1.458 Å, `CA_C` 1.525 Å, `C_N` 1.329 Å, `C_O` 1.231 Å
- `BOND_ANGLE`: `N_CA_C` 111.2°, `CA_C_N` 116.2°, `C_N_CA` 121.7°, `CA_C_O` 120.8°
- `OMEGA_TRANS` 180°, `OMEGA_CIS` 0° (ω stays a real per-residue degree of
  freedom — cis is legitimate input at X-Pro bonds, not an error)
- `PSI_TO_O_DIHEDRAL_OFFSET` 180° — the carbonyl O sits anti to the next
  residue's N, so it carries no independent degree of freedom

No geometric magic number appears anywhere outside this file.

### `lib/nerf.ts`

Pure and framework-free: no React, no Three.js, no DOM. Deliberately defines its
own minimal `Vec3` rather than importing `THREE.Vector3`, so the math stays
independently testable.

Exports, all small and referentially transparent:

- vector helpers — `vec3`, `add`, `sub`, `scale`, `dot`, `cross`, `norm`,
  `normalize`, `distance`
- angle helpers — `degToRad`, `radToDeg`, `normalizeDegrees` (wraps into (-180, 180])
- measurement (Cartesian → internal) — `bondAngle`, `dihedral`
- placement (internal → Cartesian) — `placeAtom`, the NeRF core

`placeAtom(a, b, c, bondLength, bondAngleDeg, dihedralDeg)` builds an orthonormal
frame at C from the three prior atoms, expresses D's offset in that frame in
spherical form, and rotates it into world space. Closed form, no iteration.

`bondAngle` and `dihedral` use `atan2` rather than `acos(dot(...))`, which loses
precision near collinearity. Degenerate input (zero-length bonds, collinear
A-B-C, non-finite or non-positive arguments) throws with a specific message
rather than silently producing `NaN` that would propagate down the chain.

No energy minimisation, clash relaxation, or smoothing — per `claude.md`, that
would defeat the point of the tool.

---

## Stage 2 — Fixture generation and validation

**Date:** 2026-08-13

### The fixture

`tests/fixtures/1UBQ.pdb` — ubiquitin, 1.8 Å X-ray (Vijay-Kumar, Bugg & Cook,
1987), downloaded once from RCSB and committed. Chosen because its 76 residues
contain an α-helix, a β-sheet, and loops, so the fixture spans a wide swathe of
Ramachandran space rather than one conformation.

`scripts/build-fixture.ts` (`npm run fixture`) parses that PDB by fixed-width
columns — chain A, blank/A altLocs, N/CA/C/O only — and emits
`tests/fixtures/1ubq-backbone.json`: 76 residues, 304 atoms, each with its
deposited coordinates, its NeRF parent atoms, its internal coordinates *measured
from the deposited structure*, and per-residue measured φ/ψ/ω.

Tests read the committed JSON. They never hit the network and never re-parse the
PDB, so they are offline and deterministic; the script exists so the fixture's
provenance from the real structure is auditable and re-runnable.

Atom ordering matches the order this project places atoms: N, CA, C per residue
along the main chain, with each residue's O branching off its own (N, CA, C).

### The tests — `tests/nerf.test.ts`, 25 cases

Two tiers, because reconstructing a real protein from *ideal* bond lengths and
angles cannot reproduce its deposited coordinates. Real structures vary around
the ideal values, and that error compounds along the chain. A loose-RMSD test
alone would therefore pass even with a sign or convention bug — which is exactly
the bug that showed up (below).

1. **Exact round-trip (the real gate).** Seeded only with the deposited N, CA, C
   of Met1, all 301 remaining atoms are rebuilt by `placeAtom` from measured
   internal coordinates. Every atom matches its deposited position to **< 1e-9 Å**
   (max and RMS both). A companion test asserts only three atoms are seeds, so
   the reconstruction can't be trivially correct by copying deposited values.
2. **Inverse consistency.** For every placed atom, `distance`/`bondAngle`/
   `dihedral` recover the exact inputs given to `placeAtom`, to 9 decimals.
   Plus: per-residue φ agrees with the per-atom dihedral for C; ω is trans
   (|ω| > 160°) for all 75 peptide bonds; φ/ψ genuinely span both helical and
   extended regions.
3. **Ideal-constants drift (bounded, documented).** Rebuilding from real φ/ψ/ω
   with ideal geometry, seeded on the deposited first residue:

   | window | max deviation | RMS |
   |---|---|---|
   | first 5 residues | 0.63 Å | 0.24 Å |
   | first 10 residues | 1.41 Å | 0.68 Å |
   | all 75 residues | 28.0 Å | 8.4 Å |

   This is the expected lever-arm effect of ideal-vs-real bond geometry, not a
   bug, and must not be "fixed" by smoothing. Alongside it, stricter assertions
   confirm the rebuilt structure reproduces every requested bond length, bond
   angle, and φ/ψ/ω *exactly* (9 decimals) — the deterministic contract holds
   regardless of how far it drifts from the deposited coordinates.
4. **Carbonyl O placement.** Validated `PSI_TO_O_DIHEDRAL_OFFSET` against reality
   rather than assuming it: across 1UBQ, the deposited N-CA-C-O dihedral differs
   from ψ + 180° by a median of 2.4° and at most 10.2° (real peptide units are
   slightly non-planar).
5. **α-helix regression, fixture-independent.** 12 residues at φ = −57°,
   ψ = −47°, ω = 180° built from a canonical seed frame produce: Cα(i)→Cα(i+3)
   5.227 Å, Cα(i)→Cα(i+4) 6.400 Å, rise 1.558 Å/residue along the fitted axis,
   Cα pseudo-dihedral +51.5° (right-handed), and i→i+4 O···N hydrogen-bond
   distance 3.09 Å. A β-strand case (φ = −139°, ψ = 135°) confirms > 3.2 Å rise
   per residue, i.e. extended rather than helical.
6. **Unit behaviour.** Known planar dihedrals (0°, ±90°, 180°); bond angles at
   the 0°/180° collinear limits; angle wrapping; cis/trans placement lands
   in-plane on the expected side; degenerate input throws instead of returning
   `NaN`; and **rigid-transform invariance** — placing an atom then rotating and
   translating gives the same result as transforming the inputs first. That last
   one is what makes the step-6 reference-frame control safe to implement as a
   post-hoc rigid transform.

### Bug found and fixed: inverted dihedral sign

The first test run failed 11 of 25. The cause was a genuine sign error in
`dihedral()`: the cross-product order (`cross(n1, axis)` instead of
`cross(axis, n1)`) negated the result, so measured torsions came out with the
wrong sign under the IUPAC convention.

It was caught by checking the fixture against known biology rather than by the
tests alone: ubiquitin's α-helix (residues 23–34) came out at **φ ≈ +60°**, when
L-amino-acid backbones are overwhelmingly negative in φ and that helix is known
to sit near −60°. After the fix, residue 23 reads φ = −61.3°, ψ = −37.2°,
ω = 177.0°, matching the published values.

Worth noting: the exact round-trip test *passed even with the bug*, because
`placeAtom` and `dihedral` were consistently wrong together and the error
cancelled. The sanity check against real, sign-sensitive biology is what
distinguished "self-consistent" from "correct" — and the α-helix handedness test
now locks that in permanently.

Remaining failures after the sign fix were all threshold calibration (the drift
and helix numbers above were measured, then written into the assertions with
comments explaining what they are), not math errors.

**Status: 25/25 tests pass, `tsc -b` clean under strict mode.** Per `claude.md`,
step 2 is the gate before any further work — it is now green.

---

## Stage 3 — Chain builder

**Date:** 2026-08-13

### `lib/types.ts`

The data model. `Residue` (id, aminoAcid, φ, ψ, ω) is the source of truth;
`Atom` (name, element, position, residueIndex, residueId, aminoAcid) is derived
output that is never fed back into state. `AminoAcidCode` is a union of the 20
PDB three-letter codes.

Documented in the type itself: φ of the first residue has no geometric effect
(no preceding C to rotate about), and ψ/ω of the last residue only orient its own
carbonyl O. Both are still kept in state so adding a residue at either end
doesn't discard a value the user typed.

### `lib/chain.ts`

Pure, framework-free, and only sequences NeRF placements — no geometry of its own.

- `canonicalSeedFrame()` — N at the origin, CA along +x, C in the xy-plane at the
  ideal N-CA-C angle. Arbitrary but fixed; the choice doesn't matter because
  repositioning is a rigid transform applied later (step 6), which NeRF geometry
  is invariant under.
- `seedFirstResidue(residue)` — residue 1, which NeRF can't derive.
- `extendChain(tip, residue, index)` — three placements, each driven by exactly
  one dihedral: N(i) ← ψ(i−1), CA(i) ← ω(i−1), C(i) ← φ(i); then O(i) from ψ(i).
- `buildBackbone(residues)` — full build. Empty list → empty atom list, which is
  the blank-canvas initial state rather than an error.
- `rebuildFrom(previousAtoms, residues, fromIndex)` — the update path.
- `firstChangedIndex(previous, next)` — derives `fromIndex` by diffing two
  residue lists, for callers that don't track which edit happened.

The suffix-recompute design `claude.md` asks for rests on one observation: the
only state needed to continue the chain is the previous residue's N/CA/C plus its
ψ and ω (the `ChainTip` type). So an edit at index i invalidates exactly residue i
onward. `rebuildFrom` returns the untouched prefix atoms **by reference**, so
downstream memoisation and React reconciliation can use identity to skip work.
Over-invalidating is safe — passing 0 always gives the right answer, just slower.

### Tests — `tests/chain.test.ts`, 21 cases (46 total)

- **Degenerate/single residue:** empty chain → no atoms; residue 1 lands exactly
  on the canonical seed frame; changing φ of residue 1 changes nothing while
  changing its ψ moves its O; residue identity propagates to every derived atom.
- **Full 1UBQ:** 304 atoms in N/CA/C/O order matching the fixture; **every input
  φ/ψ/ω reproduced to 9 decimals**; every bond length and bond angle exactly
  ideal. Superposed on residue 1 alone, drift against the deposited structure
  stays within the bound documented in stage 2, confirming the builder adds no
  error of its own beyond the seed difference.
- **Suffix recomputation:** `rebuildFrom` is bit-identical to a full rebuild from
  every index 0…n; prefix atoms are reference-identical; an angle edit at i leaves
  everything before i untouched and moves only i onward; append, mid-list insert,
  mid-list delete, truncation, and a swap all agree with a full rebuild at the
  index `firstChangedIndex` reports.
- **`firstChangedIndex`** unit cases, including amino-acid substitution and
  truncation.

`tests/nerf.test.ts` keeps its own small `buildIdealBackbone` helper rather than
importing the new builder. Left deliberately: it's an independent second
implementation of the same placement rules, so the two cross-check each other.

### Two test expectations that had to be corrected — both real, neither a bug

1. **First-5-residue drift is 1.56 Å, not the 0.63 Å from stage 2.** The stage-2
   test seeds on the *deposited* N/CA/C of Met1 — residue 1's real triangle —
   while the builder seeds an ideal one. The small seed-frame orientation
   difference is levered along the chain. The builder's number is the one that
   reflects actual app behaviour.
2. **The reconstruction clashes with itself.** N21 and CA55 land 0.85 Å apart:
   after ~28 Å of accumulated drift, segments distant in sequence interpenetrate.
   Rather than loosen the check, this is now pinned as an *expected* result with
   a comment explaining that if it ever starts passing a no-clash assertion,
   something is quietly relaxing the geometry and the premise of the tool is
   broken. A separate assertion does require sequence-local sanity: nothing
   within a 10-residue window comes closer than 1.5 Å (measured 1.69 Å, against
   2.37 Å in the deposited structure). Radius of gyration is also checked
   (9–20 Å; ubiquitin's backbone is ~11.7 Å).

**Status: 46/46 tests pass, `tsc -b` clean.**

---

## Stage 4 — Static 3D viewport

**Date:** 2026-08-13

First UI. Added `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`.
The template React app in `src/` was replaced; its unused assets were deleted.

### Two more pure modules, because they are derived data too

Bond topology and camera framing are computed from the atom list, so by the same
rule that governs coordinates they belong in `lib/` with tests, not inside a
component.

`lib/bonds.ts` — `backboneBonds(atoms)` returns `{a, b, kind}` index pairs:
`BACKBONE` for N–CA, CA–C and the peptide C–N, `CARBONYL` for C=O. **No distance
cutoff anywhere.** A bond exists because the chain says so, not because two atoms
happen to be close. That is deliberate: a distance-based renderer would quietly
hide a bad reconstruction by dropping the bonds it stretched, and the tool's whole
premise is that bad angles should *look* bad. A test pins this by asserting an
all-cis, eclipsed chain has byte-identical topology to a clean helix.

`lib/framing.ts` — `boundingSphere`, `fitDistance` (`r / sin(fov/2)`), and
`frameCamera`. The camera adapts to the structure; the structure never adapts to
the camera. One test exists purely to state that: it frames 1UBQ and then asserts
every atom position is bit-identical afterwards.

### `src/viewer/`

- `atomStyle.ts` — CPK colours and display radii. Kept out of `lib/constants.ts`
  on purpose: that file is the geometric definition of the reconstruction, and
  mixing render radii into it would blur a line worth keeping sharp. Ball radii
  (~0.3 Å) are far below van der Waals size so the chain path stays readable.
- `BackboneStructure.tsx` — instanced ball-and-stick. Two draw calls total
  regardless of chain length, which matters because step 5 re-renders this on
  every keystroke. Each bond is split at its midpoint into two half-cylinders
  coloured by their own atom, the standard convention; it makes the N/C/O
  alternation legible without labels. Zero atoms renders nothing at all.
- `StructureViewport.tsx` — canvas, lights, `OrbitControls`, and `FitCamera`.

**Framing is applied on mount and on explicit request (a `fitToken` prop), not on
every geometry change.** Once the residue list is editable, a camera that
re-framed on each keystroke would fight the user's own orbiting. A `minDistance`
floor of 9 Å handles the near-empty cases — a single residue has a ~1 Å radius and
would otherwise put the camera inside it.

### `src/App.tsx` and `src/sampleChains.ts` — scaffolding, explicitly temporary

Six fixed presets (empty, one residue, α-helix, β-strand, helix–turn–helix,
polyproline II) chosen because their shapes are known in advance, so the render
can be checked by eye against what the conformation *must* look like. Step 5
replaces this picker with the editable residue list. Atom positions are derived
via `useMemo` on the residue list and never stored — the state rule holds even in
throwaway code.

### Tests — `tests/render-data.test.ts`, 22 cases (68 total)

Bond counts (4n − 1), correct atom pairs across all 76 residues of 1UBQ, bond
lengths equal to the ideal constants to 9 decimals, every atom covered by at least
one bond (no orphans on screen), topology independent of geometry. For framing:
enclosure of the deposited 1UBQ coordinates, radius exactly touching the furthest
atom (no hidden padding), box-centred centre, translation-equivariance and
order-independence, `asin(r/d) = fov/2`, monotonic recession as the chain grows,
determinism, `minDistance` behaviour, degenerate-input throws.

### Verified in the browser, not just in tests

Ran the dev server and screenshotted headless Chrome for each preset:

- **α-helix** — coils right-handed, ~3.6 residues/turn. 18 residues, 72 atoms.
- **β-strand** — nearly straight and visibly pleated. 12 residues, 48 atoms.
- **One residue** — N–Cα–C at the ideal ~111° with the carbonyl branching off C,
  i.e. exactly the canonical seed frame.
- **Helix–turn–helix** — two distinct helical segments hinged by the linker.
- **Empty** — blank canvas, no WebGL errors.

One fix came out of looking: framing padding started at 1.35 and the structure
read as adrift in a mostly-empty frame. A bounding *sphere* is already a loose fit
for something as elongated as a helix, so generous padding compounds. Now 1.08.

**Status: 68/68 tests pass, `tsc -b` and `oxlint` clean, `vite build` succeeds.**

---

## Stage 5 — Editable residue list

**Date:** 2026-08-13

The app now opens on a blank canvas and the chain is built one row at a time. No
new dependencies.

### `lib/edits.ts` — the editing operations, kept pure

Insert, append, duplicate, remove, update, move, plus `wrapDegrees` and
`nextResidueId`. Framework-free and in `lib/` for one reason: these are the
operations the suffix-recompute optimisation has to be correct *with respect to*,
and the property worth testing — every edit followed by an incremental rebuild
equals a rebuild from scratch — is a statement about pure functions.

Decisions worth recording:

- **New residues default to α-helical angles (−57/−47/180), not 180/180/180.** An
  extended chain of straight residues is the least informative thing to show
  someone: adding rows makes a line get longer. With helical defaults the third or
  fourth residue already visibly curls, which is the behaviour the tool exists to
  demonstrate.
- **`wrapDegrees` normalises to (−180°, 180°], and is exact identity in range.**
  The modulo arithmetic is mathematically the identity for in-range values but not
  in floating point — it perturbs −60.5 by an ulp. That was a real bug caught by
  the tests: an amino-acid substitution, which moves no atom, was registering as
  an angle change and recomputing the suffix. The half-open interval includes
  +180 rather than −180 so a trans peptide bond reads as ω = 180°, by convention.
- **Ids derive from the highest existing number, not a module-level counter.** A
  counter would make the module stateful and its tests order-dependent.
- **`moveResidue` clamps out-of-range destinations instead of throwing**, so
  holding the up arrow on the first row is a no-op rather than an error.

### `src/useChain.ts` — residues are state, atoms are not

`residues` is the only thing `useState` holds. There is deliberately no
`setAtoms`. Atoms come from a `useMemo` holding a three-field cache (previous
residues, previous atoms, previous `fromIndex`); throw the cache away and the next
render reproduces it exactly, which is the test of whether it's a memoisation
detail or a second copy of the truth.

**The invalidation index is derived from the two residue lists, not declared by
each edit.** It costs an O(i) comparison and buys the guarantee that no editing
operation can get the boundary wrong — including reorders, where the boundary is
not the row the user dragged but the first position whose occupant changed. The
cache also short-circuits when handed the identical list, so React re-invoking the
memo in StrictMode returns the same atoms rather than re-deriving them.

`RebuildStats` is exposed and shown in the sidebar ("recomputed 8 of 12, from
residue 5"). It is the most direct evidence the optimisation is real, which
product.md §3 asks for.

### The UI — `src/editor/`

- `ResidueList.tsx` — rows, an add button, and the blank state. No submit control
  anywhere. Enter inserts a row below and moves the cursor to it, so a chain can
  be built without the mouse. The focus request is consumed after one render;
  child effects run before parent effects, so the row has taken focus by the time
  the parent clears the flag, which keeps `autoFocus` a one-shot signal rather
  than something that steals the cursor back on unrelated re-renders.
- `ResidueRow.tsx` — memoised. An edit at residue i re-renders the list, but
  earlier rows are unchanged by value and their props are referentially stable
  (the editor's action object never changes identity), so they skip re-rendering
  entirely. That's the DOM-side counterpart of the suffix-only geometry recompute.
- `AngleField.tsx` — commits on every keystroke, so it cannot round-trip its value
  through state naively: the moment the text is not yet a number ("-", "", "-1.")
  committing would either throw or snap the field to something the user didn't
  type. It keeps an uncommitted draft string for those keystrokes. Typing 200
  commits −160 but keeps showing "200" until blur — correcting someone's
  arithmetic under their cursor mid-word is hostile, and the 3D view already shows
  them the answer.

**The rows carry the pedagogy about which angles do nothing.** φ of residue 1 has
no geometric effect (there is no preceding C to rotate about; N/Cα/C come from the
seed frame) and neither does ω of the last residue (it places the *next*
residue's Cα). Both are marked muted-and-dashed with an explanation on hover, and
deliberately *not* disabled — the value becomes live the instant a neighbour is
inserted, so refusing the edit would be worse than marking it. ψ of the last
residue is **not** in that list: it still orients that residue's own carbonyl O.

The old preset picker became an Examples section. Loading one drops its residues
into the editable list rather than displaying a fixed structure.

### Tests — `tests/edits.test.ts`, 47 cases (115 total)

The operations are small enough to be obvious, so the weight is on the invariant:
for an append, a middle insert, an N-terminal insert, a middle/C-terminal delete,
a duplication, φ/ψ/ω changes, an amino-acid substitution, a reorder and a
neighbour swap, `rebuildFrom` at the reported index produces geometry identical to
`buildBackbone` — plus an assertion that the reused prefix is the *same objects*,
without which a `firstChangedIndex` that always returned 0 would pass every
equality check while making the optimisation do nothing. Then two harder cases: a
chain grown one residue at a time from empty (every previously placed atom must
still be the same object in the same place, or the viewport would jitter as the
user types) and a 200-step deterministic random walk of mixed edits, each
compounding on the last. Edits are exercised against 1UBQ's real angles so the
reused prefixes are real conformations.

### One bug the tests could not have caught

Drove the app in headless Chrome over CDP — add, type, wrap, reorder, duplicate,
delete, Enter-to-insert, load an example, clear — and screenshotted each step.
Everything passed except one thing that only showed up by *looking*: after typing
φ = 200 in row 3 and loading the α-helix example, row 3 still displayed "200"
while the structure was correctly built from −57.

`AngleField`'s draft was outliving the value it was typed against. Rows are keyed
by residue id, and the example chains use the same `r1…rN` ids as a hand-built
chain, so React reused the field instances and their local draft state. Blur alone
can't fix this — a row can have its value replaced underneath it (loading an
example, a reorder moving a different residue into that position) without ever
being focused. The field now also tracks the value its own last commit should have
produced, via the same `wrapDegrees` that `updateResidue` applies, and discards
the draft the moment the incoming value disagrees. Re-verified: loading the
example shows every row at exactly −57/−47/180, while a draft still survives
unrelated edits to other rows.

The screenshot that best shows the architecture working: setting ψ of residue 5 to
135° on a 12-residue helix leaves residues 1–4 pixel-identical and swings 5–12
away. The suffix recompute is visible on screen.

**Status: 115/115 tests pass, `tsc -b` and `oxlint` clean, `vite build` succeeds.**

---

## Stage 6 — Light/dark theme and the top bar

**Date:** 2026-08-15

First of five stages implementing a feature request (theme toggle, side chains,
2D depiction, hover linking, coordinate/origin control). No new dependencies.

### The theme is a token swap, and that was already true before this stage

Every colour in `App.css` already resolved through a custom property in
`index.css`, so adding a theme meant adding a block of values under
`[data-theme='dark']` and nothing else — no component changed to support it. Two
tokens were added (`--danger`, `--field`) to absorb the only two literals left in
`App.css`; there are now no hex colours outside the token definitions.

The dark palette is **not an inversion** of the light one. The panel is *lighter*
than the canvas in dark mode and *darker* than it in light mode, because a raised
surface reads as raised by contrast with its surround in either direction. Inputs
get their own recessed `--field` fill in dark mode, which light mode doesn't need
since white-on-white is already the convention for an editable box.

`color-scheme` is set per theme, which is what makes the native `<select>` and the
number-input spinners follow along without being restyled.

### `src/theme.ts` — resolution order is the interesting part

Stored choice → OS preference. **Only explicit choices are persisted**, and while
none exists the hook subscribes to `prefers-color-scheme` and follows it live.
Someone who has never touched the toggle therefore keeps tracking their system as
it changes, rather than being frozen into whatever it happened to be on their
first visit. `localStorage` access is wrapped — private-browsing modes can throw,
and a theme is not worth failing a render over.

### The 3D scene is the one thing that can't read the tokens

WebGL materials take literal colours, so `src/viewer/atomStyle.ts` now keys its
palette by the same two theme names. Two things needed care:

- **Carbon has to invert** (near-black → light grey); it's the only element whose
  colour is about contrast with the background rather than identity. Nitrogen and
  oxygen keep their hue and only gain luminance — blue-for-N and red-for-O are
  conventions a chemist reads, not design choices.
- **Light intensities are theme-dependent.** A dark background reflects nothing
  back into the model, so the intensities tuned for white leave the structure
  looking sooty. Ambient and hemisphere terms come up; the key light stays roughly
  put so the shading that makes the balls read as spheres survives.

The `<Canvas>` is transparent, so the viewport's `--canvas` token shows through as
the scene background and follows the theme for free.

### Verified in the browser

Drove two fresh Chrome profiles over CDP with `prefers-color-scheme` emulated:

- OS dark, fresh profile → opens dark. OS light, fresh profile → opens light.
- Toggling inside the dark-OS profile switches to light, writes `light` to
  storage, and **survives a reload** — the persistence path, not just the toggle.
- Screenshotted all four combinations. Panel, fields, borders, examples and the
  structure are legible in both; the bulb is lit with rays in light mode and
  outlined in dark.
- No console exceptions in either profile.

**Status: 115/115 tests pass, `tsc -b` and `oxlint` clean, `vite build` succeeds.**

---

## Stage 7 — Cartesian coordinates, origin control, gridlines

**Date:** 2026-08-15

`claude.md`'s step 6, plus the coordinate readout and gridlines the feature request
asked for. No new dependencies — drei's `Grid` and `Line` were already available.

### One idea, not two features

The request described two things: type an origin, and click an atom to make it the
origin. They turned out to be the same operation. An origin is an **anchor** atom, a
**target** position that anchor should sit at, and an orientation:

- "Put the structure at (3, 2, −1)" → anchor = Cα of residue 1, target = typed
- "Make this atom the origin"      → anchor = the clicked atom, target = (0, 0, 0)

Both are `frameOn(anchor, target, rotation)`, which solves `R·anchor + d = target`
for the translation — so the anchor lands on the target *exactly*, not to within a
tolerance. The panel offers two ways of choosing an anchor, and everything else
applies identically to both. The rotation is about the anchor rather than the world
origin, which is what makes typing an orientation feel like turning the molecule in
place instead of swinging it around the room.

The anchor is stored as `{kind: 'first-ca'}` rather than an index, so it survives
editing: Cα of residue 1 stays the anchor as residues are added, removed and
reordered. It is also resolved against the **canonical** atoms — resolving it
against the transformed ones would feed the transform its own output and the
structure would walk away a little on every render.

### Decoupling by dependency direction

```
residues --useChain--> canonical atoms --useOrigin--> atoms in the user's frame
```

`lib/transform.ts` imports nothing from `lib/chain.ts`, and `useOrigin` sits above
`useChain` and consumes its output. So the requirement that origin edits never
touch the NeRF inputs is enforced by the direction of the dependency rather than by
discipline — there is no code path from the origin control to an angle.

`applyToAtoms` returns **its input array unchanged** for the identity transform.
That isn't a micro-optimisation: the default state of this feature is the identity,
and the rest of the app leans on atom identity to decide what needs redrawing, so
an untouched origin must not make every atom look new on every render.

### Quaternions, and why they are normalised everywhere

Rotations are unit quaternions internally, Euler degrees at the UI boundary.
Every function that produces a quaternion re-normalises, because composing many
rotations drifts off the unit sphere and **a non-unit quaternion scales the model
as well as rotating it** — a "rigid" transform that silently changes bond lengths.
There is a test that squares a quaternion 500 times and checks it is still unit.

Euler convention is stated in the code because there are two dozen of them and a
panel with three boxes has to mean one: extrinsic XYZ, `R = Rz·Ry·Rx`, i.e. spin
about each world axis in turn.

### Tests — `transform.test.ts` (30) and `coordinates.test.ts` (15), 160 total

The premise of the feature is that moving the origin cannot corrupt the geometry, so
that is asserted by **measuring the structure**, not by inspecting the code path: a
rigid motion cannot change a bond length, a bond angle or a dihedral, so an
arbitrary transform is applied to the 1UBQ backbone and every internal coordinate is
compared to the deposited values. The φ angles are measured back out of the
*transformed* atoms and checked against the fixture's published values.

Two subtleties the tests caught or encode:

- **Dihedral comparison has to be circular.** Two assertions failed at first
  because a dihedral of exactly 180° came back as −180° — the same angle, off by
  360. The comparison was wrong, not the geometry; `expectSameAngle` wraps the
  difference. Bond angles live in [0°, 180°] and need no such care.
- **Handedness.** A reflection preserves every distance and angle but flips every
  dihedral's sign, turning a right-handed helix into a left-handed one. There is an
  explicit test that the sign survives, because "all the distances match" alone
  would not catch it.

Plus: identity returns the same array, composition is associative and
inner-first, inverse∘forward restores the structure to 1e-9, `frameOn` lands the
anchor exactly, and picking any of five different atoms puts that atom at the
origin.

### Found by looking, again

Two things the browser run turned up:

1. **A mislabelled button.** "Reset to canonical frame" reset to *this panel's*
   default — Cα of residue 1 at (0, 0, 0) — which is not the canonical NeRF frame,
   where **N** of residue 1 is the atom at the origin. The screenshot showed N at
   −1.458 after a "reset to canonical". Renamed to "Reset origin", with the
   distinction spelled out in a tooltip and a comment; switching the panel off is
   what returns to the canonical frame.
2. **A measurement that looked like a bug and wasn't.** Rotating by 45/30/60
   appeared to change bond lengths by ~2×10⁻⁴ Å. The cause was the test reading
   distances out of the coordinate *table*, which rounds to 3 decimals — six such
   coordinates can shift a distance by up to ~1.7×10⁻³. Re-measured across all 71
   distances: max deviation 1.43×10⁻³, inside the rounding bound and an order of
   magnitude below what a real 1% bond error would look like. The unit test asserts
   the actual coordinates to 1e-9.

Also verified: turning the panel on triggers **no** chain recompute (the "Last
edit" readout is unchanged by any origin operation), placing the anchor at
(3, 2, −1) is exact, clicking Cα of residue 3 makes it the only atom reading
(0, 0, 0), gridlines toggle with four spacings, and editing an angle while the
frame is offset recomputes the chain's suffix while leaving Cα1 pinned.

### Two small refactors it justified

`NumberField` was extracted from `AngleField`, which is now a thin wrapper over
it. The x/y/z inputs need the same three behaviours — commit per keystroke, keep an
uncommitted draft for text that isn't yet a number, and discard the draft when the
value changes underneath it — and that last one was a real bug in stage 5. One copy
of it is enough.

`lib/naming.ts` renders `'CA'` as `'Cα'` by parsing the PDB position code. It is in
`lib/` because the Greek position is part of the atom's chemical identity rather
than a display preference, and because stages 9 and 10 need the same answer.

**Status: 160/160 tests pass, `tsc -b` and `oxlint` clean, `vite build` succeeds.**

---

## Next — Stage 8: side chains and χ angles

The big one, and the phase `claude.md` gated behind "no side-chain/chi-angle code
until the backbone path is fully validated against real PDB fixtures". It is
validated, so the gate is open. Idealised mode per product.md §4.2(a): the user
sets χ, the tool places atoms with the same NeRF math. No rotamer library, no
realism claims.

**Do the model refactor first, on its own, and confirm the existing tests still
pass before adding any chemistry.** `ATOMS_PER_RESIDUE = 4` is currently a hard
constant driving the prefix arithmetic in `rebuildFrom` and every index computation
in `lib/bonds.ts`. Side chains make atoms-per-residue variable — which is exactly
what makes the atom count respond to the amino acid picked, i.e. the point of the
request. Replace the fixed stride with per-residue atom groups:

```ts
interface ResidueAtoms {
  readonly residueIndex: number
  readonly residueId: string
  readonly atoms: readonly Atom[]   // N, CA, C, O, then side chain in template order
}
```

`rebuildFrom` then reuses `groups.slice(0, fromIndex)` by reference, with no
arithmetic at all — which makes the suffix invariant structural rather than
computed. `ChainTip` is unchanged: side chains are leaves off Cα and never continue
the main chain, so **every existing backbone assertion must pass untouched**. That
is the regression net for the whole refactor.

Then the chemistry, in `lib/sidechains.ts`: per amino acid, an ordered list of atom
templates naming three already-placed reference atoms, a bond length, a bond angle,
and which dihedral drives the placement (a χ index, a fixed value for ring and
branch atoms, or an offset from a χ). Cβ from (C, N, Cα) with a fixed improper; Cγ
from (N, Cα, Cβ) driven by χ1; outward from there. Lengths and angles are **named
constants in `lib/constants.ts`**, same rule the backbone follows. Also `CHI_COUNT`
per amino acid, `DEFAULT_CHI` from the most common rotamer so that *selecting* an
amino acid immediately gives a sensible structure without typing four numbers, and
`RING_CLOSURE_BONDS` for the cyclic side chains. `Element` gains `'S'`.

Two special cases to **document rather than fix**: proline's Cδ bonds back to the
backbone N, and with ideal parameters the ring will not close perfectly — draw the
closure bond and leave it, because minimisation is forbidden by invariant 2. Same
for the aromatic rings, placed with fixed planar dihedrals.

State and UI: `Residue` gains `chi: readonly number[]`; `firstChangedIndex` must
compare it element-wise; and **changing the amino acid must resize the χ array** to
the new `CHI_COUNT`, filling from `DEFAULT_CHI` — that is the line that makes the
atom count move when you pick TRP. `ResidueRow` grows 0–4 χ fields behind a per-row
expander, reusing `AngleField` unchanged.

**Fixtures: 1UBQ has only 18 of the 20 amino acids** (no CYS, no TRP). Commit one
more small structure containing both (1LYZ lysozyme) and extend
`scripts/build-fixture.ts`, which already measures real internals from deposited
coordinates, to emit side-chain atoms and measured χ. One download; tests stay
offline. The primary test mirrors the backbone one: feed each residue's *measured* χ
through the placement and reproduce the deposited side-chain coordinates.

Then **stage 9** (2D chemical depiction in the top bar: `lib/depiction.ts` for a
deterministic skeletal layout, `lib/formula.ts` for the empirical formula with
hydrogens computed from per-amino-acid formulas minus (n−1) H₂O) and **stage 10**
(hover an atom → label with its name and coordinates, highlighting the matching
node in the 2D view, both directions).

Still outstanding from `claude.md`'s "everything else" tier after that: the live
Ramachandran plot linked both ways to the 3D view, and PDB export.
