Protein Structure Builder — Product Doc
1. One-liner

A web tool that reconstructs the 3D structure of a protein backbone (and eventually side chains) purely from internal coordinates — phi/psi/omega dihedral angles, bond lengths, and bond angles — anchored to one user-defined reference point. Interaction model: Desmos's "type a value, see it update live" immediacy + AutoCAD's precision-input and coordinate-driven feel.

2. Problem / Motivation

Most students learn phi/psi/omega and the Ramachandran plot abstractly — as numbers on a plot — without a direct, manipulable link to what the resulting 3D chain actually looks like. Existing tools (PyMOL, ChimeraX) are built for visualization of existing structures (PDB files), not for constructing structure from scratch out of dihedral angles you choose. This tool inverts that: you define the geometry parametrically, it builds the molecule.

This also doubles as a from-first-principles demonstration that a protein backbone is fully determined (given fixed bond lengths/angles) by just three numbers per residue.

3. Users
You, submitting this for the course.
Secondary: classmates / instructor as evaluators — so it needs to demonstrate understanding, not just produce a pretty output. A "show your work" mode (expose the transformation matrices, the NeRF steps) will matter for grading.
4. Core Concept — Internal Coordinates → Cartesian Coordinates
4.1 Backbone (MVP)

Each residue contributes three backbone (heavy) atoms: N, Cα, C (plus carbonyl O, which is geometrically dependent, not an independent DOF). Given:

Fixed bond lengths: N–Cα ≈ 1.458 Å, Cα–C ≈ 1.525 Å, C–N ≈ 1.329 Å
Fixed bond angles: N-Cα-C ≈ 111.2°, Cα-C-N ≈ 116.2°, C-N-Cα ≈ 121.7°
Per-residue dihedrals: φ (C–N–Cα–C), ψ (N–Cα–C–N of next residue), ω (Cα–C–N–Cα, ~180° for trans peptide bonds, occasionally 0° for cis-proline)

...you can place every atom sequentially using the NeRF algorithm (Natural Extension Reference Frame — Parsons et al. 2005), which is the standard method for internal→Cartesian conversion in structural biology software. Given three previously-placed atoms (A, B, C) and a bond length, bond angle, and dihedral to the next atom D, NeRF computes D directly via a closed-form rotation — no iterative solving needed. This is the mathematical core of the whole project and should be implemented from scratch (not pulled from a library) since that's presumably the point of the assignment.

This is fully deterministic — one set of (φ, ψ, ω) per residue + one reference atom's placement → one unique structure. That determinism is worth stating explicitly in your doc/report since it's the whole thesis of the tool.

4.2 Side chains (Phase 2)

Side chains add χ (chi) angles — 0 to 4 per residue depending on amino acid identity (e.g., Gly has none, Ala has none beyond Cβ, Lys has χ1–χ4). Unlike backbone dihedrals, chi angles aren't freely choosable if you want realistic structures — they cluster around preferred rotamers depending on the local φ/ψ. This is why real tools use backbone-dependent rotamer libraries (the Dunbrack rotamer library is the standard reference). Two options here, worth deciding explicitly:

(a) Idealized mode: user sets χ angles manually per residue, tool just places atoms geometrically (same NeRF math, more atoms). No "realism" claims made.
(b) Rotamer-informed mode: tool suggests/snaps to statistically favored rotamers for the given amino acid + backbone angles, pulled from a bundled rotamer library dataset. Bigger lift, but this is the differentiator that makes it more than "a fancier NeRF demo."

Recommend scoping (a) as required, (b) as stretch — it's a legitimate phase-2 feature to propose in the doc even if not built, since it shows you understand the real complexity.

5. UX Direction — Desmos × AutoCAD
From Desmos	From AutoCAD
Live-updating canvas as you edit a value — no "submit" button	Precise numeric input fields, not just sliders
Clean sidebar list of "expressions" (here: residues, each with φ/ψ/ω)	Coordinate readout on hover/click of any atom
Color-coded, minimal, generous whitespace	Snap/reference-point concept — user places one atom, everything else is relative to it
Instant visual feedback loop reinforcing the math	Object inspector / properties panel for a selected residue or atom

Concrete UI sketch:

Left panel: scrollable list of residues (like Desmos's expression list). Each row: amino acid selector + φ/ψ/ω numeric inputs (typing updates the 3D view live) + optional χ inputs if in side-chain mode.
Center: 3D viewport (rotate/pan/zoom), backbone rendered as a ribbon or ball-and-stick, colored by residue or by φ/ψ favorability (Ramachandran-plot color mapping is a nice touch — shows favored/disallowed regions directly on the 3D structure).
Right/top panel: reference-point control — set the (x, y, z) and orientation of the first atom, exactly like setting a UCS origin in AutoCAD.
Secondary view: a live Ramachandran plot showing all residues' (φ, ψ) as points — clicking a point highlights the residue in 3D and vice versa. This is a strong "ties the abstract plot to the concrete structure" feature for grading purposes.
5.1 Initial-load flow

On first load, the canvas is empty — no molecule, no default chain — matching Desmos's blank-slate feel (single blinking cursor, nothing rendered until the user types something).

No upfront "chain length" input — residues are added and removed one at a time, exactly like Desmos expressions:

A single empty row is shown with a + to add the next. Typing in a row's amino acid dropdown + φ/ψ/ω fields immediately renders/extends the 3D structure — no "generate" or "submit" step.
Each row: amino acid dropdown (20 standard residues, determines identity/R-group) + φ/ψ/ω numeric inputs. New rows append to the C-terminal end by default; reordering/deleting a row re-triggers the whole downstream chain to recompute (residue i's position depends on all residues before it, so this is a full recompute from the edited row forward, not a full rebuild from scratch — worth designing the state update to only recompute the affected suffix of the chain for performance as chains get long).
Row deletion removes that residue and recomputes everything after it. Reordering (drag to re-sequence) does the same.
Reference frame: Cα of residue 1 defaults to the origin (0,0,0) with a canonical default orientation. A separate, collapsible control (AutoCAD-UCS-style) lets the user override this — either by typing new x/y/z, or dragging a gizmo in the viewport. Changing it re-applies the rigid transform; it never touches the angle inputs.

This also means the tool should read well as a general-purpose pedagogical instrument, not just a fixed-length demo — someone should be able to open it cold, add one residue, watch a single atom placement, then keep extending the chain and immediately see how each new φ/ψ choice bends the structure. That incremental, exploratory feel is the actual point, more than any specific molecule it produces.

Implementation note: NeRF placement requires three prior atom positions to place the next one, so residue 1 isn't derived from angles the same way later residues are — it's seeded from a fixed canonical local frame (ideal N/Cα/C placement). "Moving the origin" should be implemented as a rigid transform (translation + rotation) applied to the entire computed structure after NeRF construction — not as a change to the NeRF inputs themselves. Keeping these separate avoids a whole class of bugs where origin edits corrupt the angle-driven geometry.

6. Feature Breakdown

MVP (must-have)

Reference atom placement (x, y, z + initial orientation)
Per-residue φ/ψ/ω input, live-updating chain
NeRF-based backbone construction (N, Cα, C, O)
3D viewport with orbit/pan/zoom
Add/remove/reorder residues
Export coordinates (PDB-format text output — trivial to add, high credibility payoff since it's the real standard format)
a small button to toggle between light mode and dark mode

Phase 2

Live Ramachandran plot linked to 3D view
Color-by-φ/ψ-favorability
Idealized side chains (manual χ input)
Save/load a sequence (localStorage, no backend needed)

Stretch

Rotamer-library-informed side chain suggestions
Secondary structure detection/labeling (helix/sheet regions inferred from φ/ψ ranges — this is basically free once you have the Ramachandran plot, and is a nice "look, it discovered this is an alpha helix" demo)
Steric clash detection (flag if placed atoms overlap — even a naive distance-threshold check is a good stretch goal)
7. Data Model (sketch)
Residue {
  id, aminoAcidType,
  phi, psi, omega,       // degrees
  chi: [chi1..chi4]?,    // optional, phase 2
}

Chain {
  referenceFrame: { origin: {x,y,z}, orientation },
  residues: Residue[]
}

Atom (computed, not stored) {
  element, position: {x,y,z}, residueId
}

Keep angles as the source of truth; atom Cartesian coordinates are always derived, recomputed on any edit. This is the same architecture principle as Desmos (expressions are truth, rendered points are derived).

8. Technical Architecture (suggested, not prescriptive)
Frontend: React + Three.js (or react-three-fiber) for the 3D viewport
Math: hand-rolled NeRF implementation in a small pure-function module (this is the part to write carefully and document — likely the actual graded core)
No backend needed for MVP — everything is client-side, computed on input change
State: same signed-source-of-truth pattern you already used in Cue's tasteModel — angles in state, geometry derived on render
9. Suggested Milestones
NeRF math module + unit tests against a known reference structure (e.g. reconstruct a real PDB backbone from its published φ/ψ/ω and confirm coordinates match)
Minimal UI: residue list + 3D viewport, backbone only
Reference-frame placement control
Ramachandran plot + linkage to 3D view
PDB export
Idealized side chains
(stretch) rotamer suggestions, clash detection
10. Open Questions
Do you want to validate against real PDB structures (pull φ/ψ/ω from an actual protein and check your reconstruction matches published coordinates)? Strong credibility move for grading.
Cis-proline handling — worth a toggle since ω isn't always 180°.
How much of the "why" (NeRF derivation, rotation matrix math) should live in an in-app explainer vs. just the report?
