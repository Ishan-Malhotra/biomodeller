# Build Log

A running record of what was built at each stage, why, and what was learned.
Stages follow the build order in `claude.md`.

Read this section to pick the work back up; the stage entries below are the
reasoning behind each decision, in the order they were made.

---

## Where things stand

**Last completed:** Stage 10 — hover linking. **All five requested features are done.**
**Next:** nothing queued. Candidates at the bottom of this file.

**Steps 1–6 of the `claude.md` build order are done**, plus stages 6–10 covering a
five-feature request. The math is validated against real PDB data for all 20 amino
acids, the chain builder recomputes only the affected suffix, and the app is a
Desmos-style editor over a live 3D viewport with a linked 2D structural formula, a
user-definable coordinate frame, and a light/dark theme.

What remains unbuilt from the original spec: the live Ramachandran plot and PDB
export (`claude.md`'s "everything else" tier), and rotamer suggestions and clash
detection (product.md stretch goals).

```
npm run dev        # http://localhost:5173 (no port is configured; --port 5273 was used ad hoc)
npm test           # 275 tests, all passing
npm run typecheck  # tsc -b, strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
npm run lint       # oxlint
npm run build      # tsc -b && vite build
npm run fixture             # regenerate the backbone fixture from 1UBQ.pdb
npm run fixture:sidechains  # regenerate the side-chain fixture from 4LZT.pdb
```

### File map

Pure, framework-free, unit-tested — no React or Three.js imports anywhere in `lib/`:

| File | What it owns |
| --- | --- |
| `lib/constants.ts` | Engh & Huber ideal bond lengths/angles. The only place geometric numbers live. |
| `lib/nerf.ts` | Vector helpers and `placeAtom` — the NeRF placement itself. |
| `lib/types.ts` | `Residue` (the source of truth) and `Atom` (derived output). |
| `lib/chain.ts` | `buildChain`, `rebuildChainFrom`, `placeSideChain`, `firstChangedIndex`, the seed frame. |
| `lib/sidechainTopology.ts` | The hand-written bond graph and χ definitions for all 20 amino acids. |
| `lib/sidechains.ts` | Derives NeRF reference triples and dihedral sources from that graph. |
| `lib/bonds.ts` | Bond topology from an atom list, grouped by `residueIndex`, no distance cutoff. |
| `lib/framing.ts` | `boundingSphere`, `fitDistance`, `frameCamera` — moves the camera, never the structure. |
| `lib/edits.ts` | Residue-list edit operations, `wrapDegrees`, id generation. |
| `lib/transform.ts` | Rigid transforms (quaternion + translation). `frameOn` is both origin modes. |
| `lib/naming.ts` | `'CA'` → `'Cα'`, and `atomKey` — the id both views address atoms by. |
| `lib/coordinates.ts` | The per-atom x/y/z readout rows. Fixed-decimal formatting. |
| `lib/depiction.ts` | The 2D skeletal layout. Topological, not a projection of the 3D. |
| `lib/formula.ts` | The empirical formula. Hydrogens computed, since none are placed. |

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
| `src/viewer/Depiction2D.tsx` | The 2D diagram as SVG. Scaled to fit; hover-linked to 3D. |
| `src/viewer/AtomTooltip.tsx` | The hover label. A DOM overlay, not a WebGL one. |
| `src/editor/ResidueList.tsx` | The expression list: rows, add button, blank state, Enter-to-insert. |
| `src/editor/ResidueRow.tsx` | One row. Memoised. Marks the angles that have no geometric effect. |
| `src/editor/AngleField.tsx` | One dihedral input. Commits per keystroke; holds an uncommitted draft. |
| `src/viewer/StructureViewport.tsx` | Canvas, lights, `OrbitControls`, `FitCamera`. |
| `src/viewer/BackboneStructure.tsx` | Instanced ball-and-stick. Two draw calls at any chain length. |
| `src/viewer/atomStyle.ts` | CPK colours and display radii. Render-only; deliberately not in `lib/`. |
| `src/sampleChains.ts` | Example chains, loaded into the editable list. |
| `src/App.tsx` | Wires the editor to the viewport. Owns `fitToken`. |

Tests: `sidechains.test.ts` (64), `depiction.test.ts` (51), `edits.test.ts` (47),
`transform.test.ts` (30), `nerf.test.ts` (25), `render-data.test.ts` (22),
`chain.test.ts` (21), `coordinates.test.ts` (15).

Two fixtures, both generated from committed PDB files so their provenance is
auditable and the tests never touch the network:

- `1ubq-backbone.json` — ubiquitin, 1.8 Å. Backbone only. The reference for φ/ψ/ω.
- `4lzt-sidechains.json` — hen lysozyme, 0.95 Å. All 20 amino acids, 484
  side-chain atoms. The reference for side-chain geometry, and the source of the
  idealised constants in `lib/constants.ts`.

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
8. **Side chains hang off Cα as leaves** and never enter `ChainTip`, so they cannot
   affect backbone geometry. Adding them left every pre-existing backbone
   assertion passing unchanged, and that is the regression net to keep.
9. **Atoms-per-residue is variable.** Never write `i * atomsPerResidue`; use
   `atomOffsets(groups)[i]`, or find atoms by name via `Atom.residueIndex`.
10. **The 2D depiction has exactly the 3D structure's bonds.** It is a second
    rendering of one topology, and `tests/depiction.test.ts` asserts the edge sets
    are equal for all 20 residues. A ring drawn with the right atoms and the wrong
    bonds looks plausible — that test is the only thing that catches it.
11. **Hover state is view state.** It lives in `App`, never in `useChain`, so a
    mouse movement cannot trigger a chain rebuild.

### Known rough edges

- The fixed view direction in `StructureViewport.tsx` (0.45, 0.3, 1) happens to
  look close to along the helix axis, so a from-scratch α-helix reads as a tangle
  until you orbit. Much less bad since the gridlines landed — they give the eye a
  reference — but still a framing fix waiting to happen (e.g. a direction
  perpendicular to the structure's longest axis), never a geometry one.
- The 2D diagram's scale is set by the tallest residue present, so one arginine in
  a chain shrinks the whole diagram. Fine at 8 residues, cramped at 30.
- Proline's ring and tryptophan's second ring are laid out by the tree walk rather
  than as polygons in the 2D view (see stage 9). Topologically correct, visibly less
  tidy than the other rings.
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

## Stage 8 — Side chains and χ angles

**Date:** 2026-08-15

The phase `claude.md` gated behind "no side-chain/chi-angle code until the backbone
path is fully validated against real PDB fixtures". It was validated, so the gate
opened. Idealised mode per product.md §4.2(a): the user sets χ, the tool places
atoms with the same NeRF math. No rotamer library, no realism claims.

Split into three commits, because the first is a refactor whose whole value is that
it changes no behaviour.

### 8a — Per-residue atom groups (commit `080c017`)

`ATOMS_PER_RESIDUE = 4` drove the prefix arithmetic in `rebuildFrom` and every
index computation in `bonds.ts`. Residues contribute different numbers of atoms
once side chains exist — four for a glycine backbone, fourteen for a tryptophan —
so that constant was about to be wrong for every chain that isn't pure glycine.

`chain.ts` now returns `ResidueAtoms[]`, and `rebuildChainFrom` reuses the prefix
with `groups.slice(0, fromIndex)`. **No atom-index arithmetic at all**, which turns
the suffix-reuse invariant from something computed into something structural.

`bonds.ts` dropped the stride by grouping on `Atom.residueIndex`, which the atoms
already carried, and looking main-chain atoms up by name. Its signature never
changed and it was correct for variable atom counts before side chains existed.

**Committed with no chemistry changes so the existing suite was a clean regression
net.** All 160 tests passed, and because they validate against deposited 1UBQ
coordinates to 1e-9 rather than against each other, that proved the geometry
identical rather than merely self-consistent.

### 8b — Only the bond graph is written by hand

`lib/sidechainTopology.ts` lists, per residue, each heavy atom and the single atom
nearer Cα that it bonds to, plus ring closures and the χ definitions. That is data
checkable against a textbook.

**Reference triples are derived, not listed.** NeRF places D from (a, b, c) with c
bonded to D, so walking two bonds back from the parent gives the triple:
`refs(X) = (parent(parent(P)), parent(P), P)`, with the chain continuing into the
backbone as Cβ → Cα → N. Writing out ~100 triples by hand would have been a hundred
chances to transpose two atom names, and **a transposed triple produces a
plausible-looking side chain rather than an obvious error** — the kind of bug that
survives to submission. Deriving them means the bond graph is the only thing that
can be wrong, and the tests check it against real coordinates for all 20 residues.

Cβ is the one exception: the walk would run off the end of the backbone at N, so it
is placed from (N, C, Cα) — an improper dihedral rather than a torsion about a bond.

### 8b — The fixture, and one rejected structure

1UBQ has **no cysteine and no tryptophan**, so it cannot validate those two side
chains. The replacement had to contain all 20.

**1LYZ was tried first and rejected.** It is hen lysozyme with all 20 amino acids,
which is what it was picked for — but it is a 1975 real-space refinement at 2.0 Å,
and measuring it gave bond lengths of 1.652 ± 0.181 Å where the true value is
~1.53 Å. The measurement error was an order of magnitude larger than the effect
being measured; using it would have enshrined bad geometry as "ideal".

**4LZT** is the same protein at 0.95 Å (Walsh et al., 1998). Re-measured: bond
lengths scatter by 0.01–0.03 Å and angles by 1–4°. That is a reference.

Constants are **medians, not means**. One disordered arginine in 4LZT has a Cζ bond
angle of 172° against a cluster at 122–136°, and a mean would carry that outlier
into the reference. `mad` rather than standard deviation for the same reason.

### 8b — The dihedrals were measured, not assumed

Every non-χ dihedral in all 20 side chains collapsed to one of four values, and
this was read off the data rather than decided in advance:

| | Measured | Constant |
| --- | --- | --- |
| Cβ improper (N-C-Cα-Cβ) | 120.7°–127.4° | `CB_IMPROPER_DIHEDRAL` = 122.5° |
| Proline's Cβ improper | 114.7° | `PRO_CB_IMPROPER_DIHEDRAL` — the ring pulls it ~8° off |
| Second branch, tetrahedral centre | ±120.8°–126.5° | `±TETRAHEDRAL_BRANCH_OFFSET` = 122.5° |
| Second branch, planar centre | 174°–180° | `PLANAR_TRANS` = 180° |
| Ring continuations | −1.9°–0.3°, ±177°–180° | `PLANAR_CIS` / `PLANAR_TRANS` |

The signs of the tetrahedral offsets differ per residue (ILE −, LEU +, THR −,
VAL +) and live in the geometry table, because they encode which branch the PDB
naming convention calls "1". A test asserts no placement uses any dihedral outside
that set, so a fifth magic number cannot creep in.

Proline earns its extra constant: there is a test that its measured Cβ improper is
*more* than 5° from the shared value, so if it ever falls within tolerance the
constant is dead weight and should go.

### 8c — Tests: `sidechains.test.ts`, 64 cases (224 total)

**The primary test feeds each residue's measured internals back through
`placeAtom` and reproduces the deposited coordinates** — one case per amino acid so
a failure names the residue, chaining from each *reconstructed* position rather
than the deposited one so error compounds instead of being silently reset. 484
side-chain atoms across 129 residues, to 1e-6 Å. That is what validates the
topology.

The idealised constants are checked **separately and more loosely** against the
same distribution (0.05 Å, 4°, 8° for the shared dihedral offsets), because
"the topology is right" and "the constants are close to reality" are different
claims and collapsing them would weaken both.

Then: every χ is the dihedral its topology names, measured back out of the built
structure at several values; χ2 leaves N/CA/CB/CG fixed and moves Cδ outward; no
side-chain atom is left unbonded for any residue; the ring closures are drawn;
atom counts match `heavyAtomCount` and the deposited counts in 4LZT.

### What the tests forced me to correct

- **A clash diagnostic, before trusting anything.** The existing "not a tangle"
  test dropped to 0.58 Å once side chains existed. Rather than relax it, I checked
  whether the clashes were intra- or inter-residue: **0 intra-residue, 71
  inter-residue**, and two of those were backbone-only pairs that predated side
  chains entirely (`ASP21.N ↔ THR55.CA` at 0.85 Å, already documented as ideal-
  geometry drift over 76 residues). Templates sound; the test's scope was the
  issue.
- **Two test premises that had genuinely become false.** An amino-acid
  substitution no longer "moves no atom" — it replaces one side chain with
  another. Rewritten to the stronger true claim: the backbone is bit-identical and
  the side chain differs, with the atom count checked. And the self-overlap check
  now covers the three staggered rotamer wells, with a separate test pinning that
  a **fully eclipsed arginine folds into itself** (Nε 0.64 Å from the backbone N) —
  correct output for input no protein adopts, and the tool builds what it is asked
  for.
- **Backbone tests filter to N/CA/C/O.** The 1UBQ fixture is backbone-only, and
  those tests are about whether NeRF reproduces the main chain. Every assertion is
  unchanged; only the input is narrowed.

### The line that answers the request

> "the R group remains the same regardless of the amino acid chosen … I should be
> able to see the change in the no of molecules"

`updateResidue` resizes χ when `aminoAcid` changes, via `chiFor`. Resize χ and the
side-chain template it drives changes with it, so the atom count follows. Verified
in the browser: GLY 4 → ALA 5 → SER 6 → VAL 7 → PHE 11 → TRP 14 → LYS 9 → ARG 11,
every count matching the topology exactly, with the χ badge on each row showing
how many dihedrals that residue has.

### Two things left deliberately broken

- **Proline's ring does not close.** Placed outward from ideal parameters, the
  Cδ–N closure lands off its ideal 1.47 Å. The bond is drawn and the gap is left
  visible, with a test pinning it — closing it would mean minimisation, which
  claude.md forbids. The aromatics fare much better (all their dihedrals are 0° or
  180°, so their rings close to within a few hundredths of an ångström).
- **Idealised geometry still drifts.** Nothing here changed that; side chains ride
  on a backbone that already diverges over 76 residues.

### One CSS regression, caught by looking

The χ disclosure button and the hover-revealed row actions were on one flex row
with opposite visibility rules. `.row-actions button:disabled { opacity: 0.3 }` won
on specificity over the hide rule, leaving a ghost ↑ on the first row and a ghost ↓
on the last. Two different visibility rules needed two elements.

**Status: 224/224 tests pass, `tsc -b` and `oxlint` clean, `vite build` succeeds.**

---

## Stage 9 — The 2D chemical depiction

**Date:** 2026-08-15

A skeletal structural diagram plus the empirical formula, in the top bar stage 6
built as a shell for exactly this. No new dependencies — it is hand-drawn SVG.

### A depiction, not a projection

`lib/depiction.ts` ignores the 3D coordinates entirely. Two chains with the same
sequence draw identically no matter what their φ/ψ/χ are, and there is a test that
pins it. A flattened projection of the real geometry would be both a worse diagram
*and* a redundant one, with the 3D view right there — a chemical formula is supposed
to show connectivity.

Layout: main chain left-to-right as a zig-zag (N and C on the baseline, Cα raised),
each carbonyl O hanging below its C with a double bond, side chains growing upward
from Cβ, H₂N and OH caps at the termini drawn with dashed bonds because they stand
for atoms the structure does not place.

### Rings are polygons, and getting them wrong looked fine

A phenylalanine drawn as a fan of a tree does not read as a benzene ring, so rings
are laid out as regular polygons. Ring membership comes from the closure bonds the
topology already declares: the cycle is the tree path between the closure's two
endpoints, plus the closure itself.

That path arithmetic had a bug. Both paths run outward-to-inward, so one needs
reversing and the other doesn't; I reversed one twice (`upA.reverse().reverse()`, a
no-op that also mutates) and the other once. The result was **rings with the right
atoms and the wrong bonds** — CG bonded to CZ, CD1 to CD2. On screen it looked like
a slightly odd hexagon.

What caught it was the test asserting the 2D edge set equals `lib/bonds.ts`'s
exactly, for all 20 residues:

```
HIS  edges2d=11 edges3d=10  missing=["0:CG|0:ND1","0:CD2|0:CG"]  extra=["0:CE1|0:CG",…]
```

That is the check worth having, and it is now invariant 10: **the 2D view must not
be able to invent or lose a bond relative to the 3D one.**

Two rings fall through to the tree walk rather than becoming polygons — proline's,
which closes onto the backbone N and so includes atoms outside the side chain, and
tryptophan's second ring, fused to the first and sharing two of its atoms. A
fallback emits any closure not already drawn, which is what keeps the edge-set test
passing for them.

### Skeletal convention for labels

The first version labelled every atom, and an aromatic ring with "C" written on all
six corners is unreadable — which is exactly why real chemical structures leave
carbons as bare vertices and label only heteroatoms. Adopted, with two exceptions:
Cα and Cβ keep their labels, because their Greek positions are the vocabulary this
whole tool is about. The declutter was dramatic.

### Scaled to fit, because the first version hid the backbone

The diagram was initially clipped to a fixed height with a scrollbar. Side chains
grow *upward*, so the visible region showed substituents and the backbone had
scrolled off the bottom — the most important row, gone. Now the diagram is scaled to
fit vertically (arginine, the tallest residue at 7.75 layout units, sets the floor)
and scrolls only horizontally, which is the axis chains actually grow along.

### `lib/formula.ts` — the one number not derived from a coordinate

No hydrogens are placed anywhere in this project, so the H count comes from the
chemistry rather than from anything on screen. A peptide is its residues condensed:
`Σ (free amino acid) − (n − 1) H₂O`.

**Only the hydrogen counts are hand-written.** C, N, O and S are counted from the
bond graph in `lib/sidechainTopology.ts`, so the two sources cross-check each other
and a test asserts they agree for all 20 residues. A second test closes the loop
from the other side: the formula's heavy-atom total must equal what the builder
places plus exactly one — the unmodelled C-terminal `OXT`, named in a function so
the difference doesn't read as an off-by-one.

Verified against known formulas: glycylglycine C₄H₈N₂O₃, glutathione's Glu-Cys-Gly
backbone C₁₀H₁₇N₃O₆S.

**Status: 275/275 tests pass, `tsc -b` and `oxlint` clean, `vite build` succeeds.**

---

## Stage 10 — Hover linking

**Date:** 2026-08-15

Hover an atom in the 3D viewport: it is named, its coordinates are shown, and the
matching node in the 2D diagram lights up. Hovering the 2D diagram does the reverse.
product.md §5 asks for the linkage both ways and the second direction was nearly
free once the state was shared.

`onPointerOver` on the existing drei `<Instance>` elements — no restructuring, since
stage 7's click-to-pick already used the same mechanism.

### Where the state lives, and why

The hovered atom is in `App`, **not** `useChain`. It is view state, and putting it in
the chain hook would make a mouse movement capable of triggering a chain rebuild.
That is now invariant 11.

Both views address atoms through `atomKey` in `lib/naming.ts`. It started in
`BackboneStructure.tsx`, where oxlint correctly flagged it as a non-component export
that breaks fast refresh — and moving it also deleted the duplicate key construction
`lib/depiction.ts` had been doing inline.

### The tooltip agrees with the panel

Coordinates come from the **transformed** atoms, so they are the same numbers the
coordinate panel lists rather than canonical-frame ones. Verified by driving both and
comparing: `Cγ · TRP 6` reads `1.730 · 8.184 · 1.302 Å` in the tooltip and the same
in the panel row. A readout that disagreed with the panel would be worse than no
readout.

### Four details that needed a reason rather than a default

- **Amber highlight, deliberately outside the CPK palette.** Re-tinting a hovered
  atom a lighter blue would make a hovered carbon look like a nitrogen.
- **`stopPropagation` on pointerOver, not just click.** Without it every atom along
  the ray reports and the *last* one wins rather than the nearest.
- **Pointer position tracked on the viewport container**, not per atom: the tooltip
  follows the cursor, and an instanced mesh doesn't fire a move event per pixel.
- **The 2D view gets a halo plus an invisible larger hit circle**, not a colour
  swap. A bare carbon vertex is about 3 px across; recolouring it is invisible and
  hitting it is luck.

**Status: 275/275 tests pass, `tsc -b` and `oxlint` clean, `vite build` succeeds.**

---

## Next — nothing queued

The five-feature request is complete. What is still unbuilt, in the order
`claude.md` and product.md suggest:

1. **A live Ramachandran plot**, linked both ways to the 3D view. The strongest
   remaining feature for grading: it ties the abstract φ/ψ plot to the concrete
   structure, which product.md §5 calls out explicitly. The hover-linking machinery
   from stage 10 is the pattern to reuse — shared `hovered` state in `App`, a key
   both views agree on, and `lib/` doing the layout.
2. **PDB export.** Cheap, and a credibility win: the output can be opened in PyMOL
   or ChimeraX and checked by someone who doesn't trust this tool. The atom naming
   and `residueIndex` numbering it needs already exist.
3. **Clash detection.** The data is already there — `tests/chain.test.ts` documents
   1UBQ's ideal-geometry clashes, and a diagnostic written during stage 8 found 71
   non-bonded pairs closer than 1.6 Å in a default-rotamer ubiquitin. Surfacing
   those in the UI is a display feature, and it must stay one: **detecting a clash
   must never move an atom.**
4. **Rotamer suggestions** (product.md §4.2(b)), which would need a bundled Dunbrack
   library. The biggest lift of the four and the one furthest from the current
   premise, since it means suggesting angles rather than reconstructing from them.

The rough edges listed at the top of this file are all cosmetic and all in
rendering, not geometry.
