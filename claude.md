vProject: Protein Structure Builder
What this is

A web tool that reconstructs 3D protein structure (backbone, later side chains) from phi/psi/omega (and eventually chi) dihedral angles, using the NeRF (Natural Extension Reference Frame) algorithm. Interaction model is Desmos (live, expression-list-style editing, blank canvas on load) crossed with AutoCAD (precise coordinate input, reference-frame/UCS control).

Full spec: product.md Read it before starting significant work.

Product framing

This is a general-purpose pedagogical tool for visualizing protein backbone geometry, not a one-off demo for a fixed molecule. Someone should be able to open it with an empty canvas, add one residue, see one atom placement, and keep extending the chain — watching how each phi/psi choice bends the structure in real time. Optimize for that incremental, exploratory feel over any specific "generate a full molecule" workflow.

Hard constraints
Math
NeRF math lives in a pure, framework-free module (lib/nerf.ts). No React, no Three.js imports in this file. It must be independently unit-testable.
Bond lengths/angles are named constants in lib/constants.ts — never inline magic numbers in the math.
Every geometry function needs a unit test, validated against real published PDB φ/ψ/ω → coordinate data (fixtures in /tests/fixtures/), not just hand-picked round numbers.
Do NOT add any energy-minimization, clash-relaxation, or "make it look more realistic" post-processing. The entire premise is deterministic reconstruction from angles — silently smoothing that breaks the point of the tool. If asked to make output "look better," the answer is UI/rendering changes, never geometry changes.
State model
Per-residue angles (phi, psi, omega, and later chi) are the source of truth. Cartesian atom coordinates are always DERIVED on render — never stored as independently-editable state.
Residue 1 is seeded from a fixed canonical local frame (ideal N/Cα/C placement), not derived via NeRF like later residues — NeRF needs three prior atoms, and residue 1 has none.
The reference-frame / origin control (where the user repositions Cα of residue 1) is implemented as a rigid transform (translation + rotation) applied to the whole computed structure AFTER NeRF construction. It never changes the angle inputs or the NeRF math. Keep these two systems completely decoupled.
Residues can be freely added, removed, and reordered at any point (Desmos- style, no upfront "chain length" step). Because residue i's position depends on every residue before it, an edit at index i should recompute only the suffix of the chain from i onward — not the whole chain, and not just that one residue. Design the state/update model around this from the start.
Style
TypeScript strict mode.
Small, composable functions over one large "build the molecule" function.
No side-chain/chi-angle code until the backbone path is fully validated against real PDB fixtures — treat side chains as a separate build phase, not something to interleave with backbone work.
Where to start

Build in this order, one step at a time, committing after each:

lib/nerf.ts — NeRF placement math + lib/constants.ts for bond lengths/angles. No UI, no framework imports.
Unit tests against real fixtures in /tests/fixtures/ (published PDB φ/ψ/ω → known coordinates). Do not proceed until these pass.
Chain builder — repeatedly apply the NeRF function across a Residue[] to produce a full Atom[] list. Test against a full real backbone.
Minimal static 3D viewport (react-three-fiber) rendering that atom list. No interactivity yet — just confirm the pipeline renders correctly.
Editable, Desmos-style residue list (add/remove/reorder, live-updating).
Reference-frame / origin control.
Everything else (Ramachandran plot, export, side chains) only after the above is solid.

Do not skip ahead to UI or side chains before step 2 is genuinely green — the math is the part most likely to be silently wrong.


always update logs.md at the end of each phase. 
