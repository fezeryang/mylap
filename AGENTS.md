# Repository Guide

## Product focus and current state

TODŌU is a personal 3D deck and device workspace. The root application is the canonical assembled
scene: a procedural desk environment, the cyberdeck, the phone, the radio, and the surrounding
decorative assets share one Three.js scene, one camera, one input owner, and one screen runtime.

The root desktop currently mounts these fixed instances from `src/main.ts`:

| Instance | Type | Role | Root status |
| --- | --- | --- | --- |
| `desk-main` | `cyber-desk` | physical desk environment | integrated adapter |
| `computer-main` | `cyberdeck` | main computer/deck | integrated adapter |
| `phone-main` | `phone` | device asset | integrated adapter |
| `radio-main` | `ratio` | radio and two physical displays | integrated adapter |
| `bulletin-board-main` | `bulletin-board` | decorative environment asset | integrated adapter |

`http://127.0.0.1:5173/` is the source of truth for work involving the assembled deck, a mounted
device, a decorative asset, a camera interaction, or a screen attached to a device. The `phone/`,
`desk/`, and `ratio/` applications are focused authoring and local QA surfaces. Their renders help
inspect an asset, but they do not prove that the same asset works in the root desktop.

The root scene uses fixed placements. Spatial move/swap, persisted layout editing, user-installed
screen apps, AI, camera capture, storage-wall behavior, and cross-device synchronization are future
work unless the implementation and tests say otherwise. A shared radio service and the current
screen presenters are implemented; do not extend that fact into unimplemented product behavior.

An asset type is a reusable definition such as `ratio`; an asset instance is a placed occurrence
such as `radio-main` with its own stable ID, transform, active state, screen sessions, and disposal
lifecycle. Preserve the distinction in names, contracts, tests, service state, and persistence.

## Repository map

```text
index.html                 root desktop DOM, canvas, shell, and accessible controls
src/main.ts                root scene composition and desktop host entrypoint
src/assets/                root adapters, placement contracts, and scene validation
src/apps/                  replaceable DOM applications mounted on root screen surfaces
src/runtime/               asset stage, screen sessions, CSS3D projection, focus, and input
src/viewer/                root WebGL renderer, camera, lighting, and render scheduling
src/model/                 cyberdeck geometry and model contract
phone/                     phone model plus standalone authoring/QA app
desk/                      desk model plus standalone authoring/QA app
ratio/                     radio model plus standalone authoring/QA app
board/                     bulletin-board model source used by the root decorative asset
docs/                      architecture, asset catalog, and roadmap
DESIGN.md                  cyberdeck visual and interaction authority
phone/DESIGN.md            phone visual and interaction authority
ratio/DESIGN.md            radio visual and interaction authority
archive-cyberdeck/         historical reference; never a runtime input
.img2threejs/              tool-managed material; never an application module
dist/, evidence/, parts.json generated build and QA output
```

Do not move model trees to make the folders look uniform. Keep standalone authoring surfaces
available, and integrate through the typed root adapter contracts.

## Code map and ownership

| Concern | Location | Owner |
| --- | --- | --- |
| Asset type/instance boundary | `src/runtime/asset-contracts.ts` | adapter contract |
| Registration and lifecycle | `src/runtime/asset-registry.ts`, `asset-stage.ts` | root host |
| Screen placement, CSS3D, power, and focus | `src/runtime/screen-runtime.ts` | root host |
| Root scene composition | `src/main.ts`, `src/assets/scene-config.ts` | root host |
| Physical model geometry and stable parts | asset model directories | asset model |
| Interactive screen content | `src/apps/` | screen app |
| Shared radio state and media lifecycle | `src/services/radio-*` | host service |

The root host owns the assembled 3D scene, placement, camera, orbit controls, activation, picking,
pointer capture, keyboard routing, screen focus, power, lifecycle, and resource disposal. An asset
model owns geometry, materials, animation pivots, stable part IDs, selectables, physical screen
anchors, explosion transforms, and model-local disposal. A screen app owns DOM state and
accessibility. It must not manipulate the camera, stage, CSS3D layer, or another asset.

Standalone viewers own only their local camera, lights, controls, and render loop. Root code must
never import a standalone viewer, its DOM composition, or its render loop.

Physical display surfaces inherit the transform of their model anchor. Use a normal `CSS3DObject`
for a display that is part of the device; `cssBillboard` is opt-in only for a surface explicitly
designed to face the camera. A display that is visually correct in a standalone viewer but floats
when the root camera orbits is not fixed.

## Commands

- `pnpm run dev`: start the canonical root desktop, normally on port 5173.
- `pnpm run verify:root`: typecheck, all root Bun tests, lint, and root build.
- `pnpm run qa:browser`: run the root browser harness with explicit `EVIDENCE_DIR`, `QA_TARGET`,
  and `QA_CASE` values.
- `pnpm run dev:phone`: start the standalone phone authoring surface on port 5174.
- `pnpm --dir phone run verify`: verify the phone package and its local model/UI tests.
- `pnpm --dir phone run qa:browser`: run phone-local visual QA.
- `pnpm --dir desk run dev` / `pnpm --dir desk run verify`: author and verify the desk asset.
- `pnpm --dir desk run qa:browser`: run desk-local visual QA.
- `pnpm --dir ratio run dev` / `pnpm --dir ratio run verify`: author and verify the radio asset.
- `pnpm --dir ratio run qa:browser`: run radio-local visual QA.
- `pnpm run verify:all`: verify root and phone; run desk and ratio verification separately.

Use pnpm for package scripts and Bun for tests. Desk and ratio both default to port 5175, so run
them separately or override a port. Browser QA writes generated evidence; do not use generated
captures or manifests as authored source.

## Definition of done for 3D work

For any change to the deck, a device, a decoration, a camera-facing surface, or a mounted screen:

1. Identify whether the change belongs to the model, root adapter, root runtime, or screen app.
2. Verify the canonical root desktop, even when the local standalone viewer was also changed.
3. Exercise the relevant camera orbit, fixed views, activation/focus, picking, power, explosion,
   reset, resize, and reduced-motion paths. For physical screens, start a drag on the screen and
   on the surrounding model when both routes are expected to orbit.
4. Inspect real browser renders and console/page-error output. A typecheck or standalone screenshot
   alone is not completion evidence for a root-mounted asset.
5. Preserve stable type, instance, part, screen, app, socket, and placement IDs.

When adding an asset, provide a stable `SceneAssetDefinition`, a `StageAsset`, typed screen
surfaces, selectables, update/explosion/disposal behavior, a catalog entry, local authoring QA, root
adapter tests, and root browser coverage for registration, placement, activation, focus, picking,
screen alignment, removal, and disposal.

## TypeScript and module conventions

- Follow strict compiler options, including unchecked-index, exact-optional-property, unused-code,
  and implicit-return checks.
- Use `import type` for type-only imports, readonly contracts for immutable model data, and narrow
  literal unions for closed sets.
- Biome owns formatting and import organization: two-space indentation, 100-column width, double
  quotes, and no semicolons.
- Use camelCase for values/functions, PascalCase for classes/types, kebab-case for DOM/runtime IDs,
  and `--kebab-case` for CSS custom properties.
- Put behavior in the narrowest cohesive module. Keep root composition in `src/main.ts`; follow
  the nearest nested `AGENTS.md` for model, runtime, app, phone, desk, or ratio rules.

## UI and rendering contract

- Preserve semantic controls and DOM IDs, native keyboard behavior, labels, `aria-pressed`,
  `aria-live`, visible focus, IME input, and textual status feedback.
- Follow the applicable `DESIGN.md`: dark studio/glass surfaces, pearl/lavender text, restrained
  depth, and cyan/violet/magenta only for state, focus, or emission. Never use pure-white body copy
  or body text below 12px.
- CSS owns DOM transform, opacity, and filter. Three.js owns model, camera, screen-anchor, and
  explosion transforms. Respect `prefers-reduced-motion` and never default to autorotation there.
- Keep full-viewport canvases and edge HUDs from obscuring the deck at supported breakpoints.
- Do not replace clickable, focusable, stateful, or replaceable UI with a screenshot texture.
  Physical bezel/glass geometry and interactive screen apps have separate ownership.

## Verification contract

- Run the nearest package's typecheck, Bun tests, lint, and build after source changes.
- Root-mounted visual or interactive changes require `pnpm run verify:root` plus root browser QA and
  inspected renders. Local package QA is additional evidence, never a substitute.
- Root browser QA must cover the assembled deck, mounted decorations, camera orbit, device focus,
  physical screen projection, input ownership, power, explosion/reset, picking, manifests, and
  console/page errors for the affected surface.
- Do not claim a local radio/phone/desk fix is complete until its root instance has been checked.

## Boundaries and security

- Never hardcode secrets or credentials; this client-only project currently requires none.
- Do not edit `archive-cyberdeck/`, `.img2threejs/`, reference-image directories, generated model
  trees, `dist/`, `evidence/`, or `parts.json` unless the task explicitly targets that artifact.
- Authored `desk/`, `ratio/`, `phone/`, and `board/` source is not reference material.
- Both pnpm and Bun metadata exist; do not regenerate, remove, or create lockfiles incidentally.
- The working directory may not be a Git repository. Verify repository state before Git operations;
  never assume history, branches, or restore commands are available.
