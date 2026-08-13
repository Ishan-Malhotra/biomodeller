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

## Next

Step 3: the chain builder over `Residue[]`, producing the derived `Atom[]`.
Note that `tests/nerf.test.ts` contains a test-local `buildIdealBackbone` helper
that already encodes the per-residue placement rules (N from ψ(i−1), Cα from
ω(i−1), C from φ(i), O from ψ(i) + 180°); the real builder should supersede it,
with the recompute-the-suffix design `claude.md` calls for.
