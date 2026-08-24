# Neon Cyberphone

`phone/` is an isolated Vite and Three.js authoring application for the phone asset. It is
standalone today and is not registered with the root `AssetStage`.

## Source Map

- `src/main.ts`: application composition and QA handle
- `src/model/`: procedural geometry, materials, parts, and screen anchor
- `src/viewer/`: phone-local renderer, camera, controls, and render loop
- `src/ui/`: current interactive screen surface and HUD bindings
- `src/runtime/`: phone-local DOM and manifest contracts
- `scripts/`: browser QA and diagnostic capture
- `DESIGN.md`: visual and interaction source of truth
- `phone.png`: primary reference image

The phone screen UI is a replaceable future product surface. The current implementation stays
local to this viewer until a root-side adapter and shared screen-app contract are implemented.

## Commands

From this directory: `pnpm run dev`, `pnpm run typecheck`, `bun test`, `pnpm run lint`,
`pnpm run build`, `pnpm run qa:browser`, or `pnpm run verify`.

From the repository root: `pnpm run dev:phone` and `pnpm run verify:phone`.

## Authored and Generated Boundaries

Authored work lives in `src/`, `index.html`, `DESIGN.md`, and the package configuration.
`src/model/generated/`, `dist/`, `evidence/`, `.img2threejs/`, and `parts.json` are generated,
tool-managed, or QA outputs and are not normal implementation inputs. Browser QA writes renders
and reports under `evidence/`.

Future integration must adapt the model output to `StageAsset`; it must not import or copy the
phone viewer into the root host.

Project context: [architecture](../docs/ARCHITECTURE.md),
[asset catalog](../docs/ASSET-CATALOG.md), and [roadmap](../docs/ROADMAP.md).
