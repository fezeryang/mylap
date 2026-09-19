# Bulletin Board Asset Guide

`board/` owns the authored procedural bulletin-board model used by the root decorative asset
`bulletin-board-main`. It inherits the repository root `AGENTS.md`. The board is part of the
assembled deck scene; it is not a replacement for the desk, cyberdeck, phone, or radio.

## Ownership

- `src/model/create-bulletin-board-model.ts` owns geometry, materials, stable part IDs, sockets,
  explosion transforms, and model disposal.
- `src/assets/bulletin-board-asset.ts` owns the root `SceneAssetDefinition` adapter.
- `src/assets/scene-config.ts` owns the board's fixed placement, scale, orientation, and role as a
  decorative environment asset.
- The root viewer and runtime own camera, picking, activation, input, lifecycle, and composition.

Preserve the board's stable part IDs and attachment metadata. Sockets describe authored attachment
points only; they do not implement spatial editing, communication, or persistence. Keep decorative
geometry separate when its silhouette, depth, or picking behavior differs.

## Verification

For model or adapter changes, run the focused Bun tests and `pnpm run verify:root`, then inspect the
assembled root desktop at `http://127.0.0.1:5173/`. Check overview framing, camera orbit, board
placement beside the desk, picking, explosion/reset, resize, reduced motion, and console/page errors.
The root scene is the final visual authority because this asset has no separate standalone viewer.

## Boundaries

Treat reference-analysis files as design inputs and generated build/evidence output as disposable.
Do not import root camera, controls, CSS3D, or render-loop code into the model factory. Do not
describe inferred rear or hidden geometry as reference-exact.
