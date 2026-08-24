# Phone Asset Guide

This directory inherits the root `AGENTS.md` and adds rules for the standalone phone app. The
phone remains an independent authoring and QA surface today; future root integration uses a
`SceneAssetDefinition` / `StageAsset` adapter, not the phone viewer.

## Ownership

- `src/model/` owns geometry, materials, stable part IDs, selectables, explosion behavior, and
  the physical screen anchor.
- `src/viewer/` owns the standalone renderer, camera, controls, and animation loop only.
- `src/ui/` owns interactive screen and HUD behavior. Keep it separate and replaceable; do not
  bake product UI permanently into model geometry or materials.
- `src/runtime/` owns phone-local DOM and manifest contracts.
- `scripts/` owns browser QA and diagnostic capture.
- `DESIGN.md` is the visual, interaction, motion, and accessibility authority.

The eventual adapter must expose stable type, instance, part, and screen IDs plus selectables,
screen surfaces, update, explosion, and disposal. Do not make current phone work depend on an
adapter that has not been implemented.

## Commands and Verification

- `pnpm run dev`: start the phone app locally.
- `pnpm run typecheck`, `bun test`, `pnpm run lint`, and `pnpm run build`: verify authored code.
- `pnpm run verify`: run the complete phone verification chain.
- `pnpm run qa:browser`: exercise the built preview and generate visual evidence.

Visible or interactive changes require inspection of the browser QA output, including reference,
front, right, rear, and left views, narrow viewports, screen interaction, explosion, reset, and
part picking.

## Boundaries

Treat `src/model/generated/`, `dist/`, `evidence/`, `.img2threejs/`, and `parts.json` as generated,
tool-managed, or QA output; do not edit or import them by default. Do not import root viewer or
composition code into `src/model/`, and never treat reference or evidence images as runtime UI.
