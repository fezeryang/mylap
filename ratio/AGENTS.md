# Ratio Radio Asset Guide

This directory is the local authoring and QA surface for the retro-future radio. It inherits the
repository root `AGENTS.md`. The radio is integrated into the canonical root 3D desktop as the
`radio-main` instance through `src/assets/ratio-asset.ts`; its two root displays are mounted by
`src/runtime/screen-runtime.ts` and read the host radio service. The local app is not the root
runtime and cannot be the only validation surface.

## Ownership

- `src/model/` owns procedural geometry, PBR materials, stable part IDs, selectables, animation
  pivots, explosion transforms, physical screen anchors, and `root.userData.sculptRuntime`.
- `src/ui/` owns typed media state and reduction plus the deterministic demo `AudioPlayer`
  implementation and boundary.
- `src/viewer/` owns the standalone renderer, CSS3D projection, camera, lighting, post-processing,
  and animation loop. The model must not import it.
- `index.html` declares the semantic controls and device-screen DOM; `src/main.ts` validates IDs,
  composes model/player/viewer/state, binds controls, renders UI state, and runs the demo-player tick.
- `scripts/` owns browser QA, capture, and manifest evidence.
- `DESIGN.md` is the visual, interaction, motion, and accessibility authority.

The root adapter owns the translation from this model into `StageAsset`; root screen apps own the
display DOM and the host radio service owns shared state. Do not import the standalone viewer into
the root. For physical tuner and cassette surfaces, preserve anchor orientation and do not enable
`cssBillboard` unless the surface is intentionally camera-facing.

## Invariants

- Every independently selectable or explodable physical part has a stable kebab-case ID and named
  group. Surface relief may ride with its parent but must be named.
- Tuner, spectrum, station metadata, cassette state, and transport state are live semantic UI, not
  a screenshot texture. Physical bezel/glass remain Three.js geometry.
- `createDemoAudioPlayer()` is deterministic and silent: it advances demo time and synthesizes
  spectrum snapshots but does not load, stream, decode, or play audio.
- The local demo player is deterministic and silent. Root shared media is provided through the
  typed host radio service; do not couple this local player or UI directly to another asset or to
  root-host internals.
- Aerial, dish, handle, knobs, sliders, buttons, cassette reels, and speaker perforations remain
  separate geometry when their silhouette, motion, or picking behavior differs.
- Hidden rear/right/underside geometry is inferred and must not be described as reference-exact.

## Verification

- Run `pnpm run typecheck`, `bun test`, `pnpm run lint`, and `pnpm run build` from `ratio/`.
- Visible or interactive changes require real-browser QA at 375, 768, 1280, and 1536 pixels plus
  reference, front, right, rear, and left views.
- QA covers tuner/transport input, power, station and progress updates, animated reels/spectrum,
  explosion, reset, reduced motion, part picking, manifest coverage, and console/page errors.
- If the change affects the mounted radio, its screens, camera orbit, or desktop composition, also
  run `pnpm run verify:root` from the repository root and inspect `http://127.0.0.1:5173/` with
  `radio-main` focused. Verify both fixed views and free orbit; a local `5175` render alone is
  insufficient.

## Boundaries

Treat `.img2threejs/`, `dist/`, `evidence/`, `parts.json`, and `src/model/generated/` as generated or
tool-managed. Do not import the reference PNG or generated PBR evidence into runtime code.
