# Phone Asset Guide

This directory inherits the root `AGENTS.md` and owns the phone's procedural model plus its
standalone authoring/QA surface. The phone is also integrated into the canonical root 3D desktop as
the `phone-main` instance through `src/assets/phone-asset.ts`. The standalone viewer is never the
root runtime.

## Ownership

- `src/model/` owns geometry, materials, stable part IDs, selectables, explosion behavior, and
  the physical screen anchor used by both the standalone viewer and the root adapter.
- `src/viewer/` owns the standalone renderer, camera, controls, and animation loop only.
- `src/ui/` owns interactive screen and HUD behavior. Keep it separate and replaceable; do not
  bake product UI permanently into model geometry or materials.
- `src/runtime/` owns phone-local DOM and manifest contracts.
- `scripts/` owns browser QA and diagnostic capture.
- `DESIGN.md` is the visual, interaction, motion, and accessibility authority.

The root adapter exposes stable type, instance, part, and screen IDs plus selectables, screen
surfaces, update, explosion, and disposal. Changes to the model or physical screen must preserve
that contract and must be checked in the root desktop as well as here.

## Commands and Verification

- `pnpm run dev`: start the phone app locally.
- `pnpm run typecheck`, `bun test`, `pnpm run lint`, and `pnpm run build`: verify authored code.
- `pnpm run verify`: run the complete phone verification chain.
- `pnpm run qa:browser`: exercise the built preview and generate visual evidence.

For a phone change that affects the assembled scene, run `pnpm run verify:root` from the repository
root and inspect `http://127.0.0.1:5173/` after focusing `phone-main`. A green standalone phone
build does not establish root desktop correctness.

Visible or interactive changes require inspection of the standalone browser QA output, including
reference, front, right, rear, and left views, narrow viewports, screen interaction, explosion,
reset, and part picking. Root-mounted changes additionally require root camera orbit, activation,
screen projection, focus/power, picking, explosion/reset, and console/page-error checks.

## Boundaries

Treat `src/model/generated/`, `dist/`, `evidence/`, `.img2threejs/`, and `parts.json` as generated,
tool-managed, or QA output; do not edit or import them by default. Do not import root viewer or
composition code into `src/model/`, and never treat reference or evidence images as runtime UI.
