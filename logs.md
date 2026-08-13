# Build Log

A running record of what was built at each stage, why, and what was learned.
Stages follow the build order in `claude.md`.

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

## Next

Step 5: the Desmos-style editable residue list — add, remove, reorder, live
update, opening on an empty canvas. `rebuildFrom` and `firstChangedIndex` from
stage 3 are the update path; the preset picker goes away. `fitToken` is already in
place so editing won't move the camera.
