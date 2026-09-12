# Ratio Radio Asset Guide

This directory is the isolated authoring and QA surface for the retro-future radio. It inherits the
repository root `AGENTS.md`; all radio-specific source, design, tests, evidence, and package commands
remain under `ratio/` unless the user explicitly requests root-host integration.

The radio is not registered with the root asset runtime and has no `SceneAssetDefinition` adapter.
Treat this app as standalone authoring/QA code, not as an implemented device in the spatial desktop.

## Ownership

- `src/model/` owns procedural geometry, PBR materials, stable part IDs, selectables, animation
  pivots, explosion transforms, and `root.userData.sculptRuntime`.
- `src/ui/` owns typed media state and reduction plus the deterministic demo `AudioPlayer`
  implementation and boundary.
- `src/viewer/` owns the standalone renderer, CSS3D projection, camera, lighting, post-processing,
  and animation loop. The model must not import it.
- `index.html` declares the semantic controls and device-screen DOM; `src/main.ts` validates IDs,
  composes model/player/viewer/state, binds controls, renders UI state, and runs the demo-player tick.
- `scripts/` owns browser QA, capture, and manifest evidence.
- `DESIGN.md` is the visual, interaction, motion, and accessibility authority.

## Invariants

- Every independently selectable or explodable physical part has a stable kebab-case ID and named
  group. Surface relief may ride with its parent but must be named.
- Tuner, spectrum, station metadata, cassette state, and transport state are live semantic UI, not
  a screenshot texture. Physical bezel/glass remain Three.js geometry.
- `createDemoAudioPlayer()` is deterministic and silent: it advances demo time and synthesizes
  spectrum snapshots but does not load, stream, decode, or play audio.
- Real/shared media and cross-device access remain future host/service work. Introduce them through
  narrow typed request, event, and snapshot contracts; do not couple this standalone player or UI
  directly to another asset or to root-host internals.
- Aerial, dish, handle, knobs, sliders, buttons, cassette reels, and speaker perforations remain
  separate geometry when their silhouette, motion, or picking behavior differs.
- Hidden rear/right/underside geometry is inferred and must not be described as reference-exact.

## Verification

- Run `pnpm run typecheck`, `bun test`, `pnpm run lint`, and `pnpm run build` from `ratio/`.
- Visible or interactive changes require real-browser QA at 375, 768, 1280, and 1536 pixels plus
  reference, front, right, rear, and left views.
- QA covers tuner/transport input, power, station and progress updates, animated reels/spectrum,
  explosion, reset, reduced motion, part picking, manifest coverage, and console/page errors.

## Boundaries

Treat `.img2threejs/`, `dist/`, `evidence/`, `parts.json`, and `src/model/generated/` as generated or
tool-managed. Do not import the reference PNG or generated PBR evidence into runtime code.
