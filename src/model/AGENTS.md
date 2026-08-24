# Model Domain Guide

This directory contains the procedural Three.js asset and its runtime interaction
contract. It inherits the repository root `AGENTS.md`; this file only adds
constraints specific to model construction.

## Construction Flow

`createCyberdeckModel()` is the composition root. It creates a `PartBuilder`, shared
materials, chassis, keyboard and controls, carry grip, and all three display assemblies.
It then collects selectable meshes and exposes runtime colliders, destruction groups,
named nodes, and sockets through `root.userData.sculptRuntime`.

- `chassis.ts`, `controls.ts`, and the display builder modules own feature geometry;
  `displays.ts` is the stable display facade.
- `geometry.ts` owns reusable mesh constructors and attached detail helpers.
- `materials.ts` owns physical and emissive material families.
- Display builders expose screen anchors, hit proxies, world/pixel dimensions, and
  default app IDs. Screen content belongs to the DOM app runtime under `src/apps/`.
- `part-builder.ts` owns named-part registration and authored transform metadata.
- `part-layout.ts` owns pure keyboard data and explosion-position logic.
- `model-controller.ts` owns camera controls, screen power, explosion, picking, and
  selection feedback.

## Part and Geometry Invariants

- Every independently selectable or explodable component must be a registered named
  group created through `PartBuilder`. Preserve its `componentId`, `selectablePart`,
  authored position, and explosion-clearance metadata.
- Use descriptive kebab-case runtime IDs and meaningful mesh names. Picking walks mesh
  ancestry to the nearest registered component, while manifests and QA consume names.
- Use `namedMesh`, `roundedBox`, `chamferedPlate`, `addLightBar`, and `addScrew` where
  their behavior applies; do not duplicate their naming and shadow setup ad hoc.
- Keep independently moving pieces separate. Do not fuse the cyberdeck into one mesh or
  delete named components merely to reduce triangle or draw-call counts.
- Keep adjacent separate-geometry seams at least 0.02 world units overlapped when a gap
  would otherwise appear during rendering.
- Features that change silhouette or physical relief, including fasteners, grips, raised
  keys, shells, and recesses, require geometry or displacement rather than painted detail.

## Keyboard, Display, and Material Rules

- Preserve the six-row, 74-key keyboard data contract. Keys remain individual geometry;
  a texture plane is not an acceptable replacement.
- Preserve each display's assembly hierarchy and backing structure: shell, bezel, glass,
  and screen plane/material. Side displays must not become unsupported flat cards.
- Keep main, left, and right `ScreenSurface` contracts independently addressable. WebGL
  owns shell, bezel, glass, and hit geometry; CSS3D sessions own interactive content.
- Every browser-bindable keycap must retain a unique `KeyboardEvent.code`; unbindable FN
  keys remain explicit and left/right modifiers remain distinct.
- Keep physical surface materials separate from emissive screen/light materials. Do not
  reuse an albedo source as roughness, height, normal, or AO data.
- Roughness grain and restrained emission are part of the authored look; avoid globally
  flattening roughness or bloom to compensate for a local material problem.
- Hidden underside details without reference support are approximations; do not describe
  them as reference-exact.

## Changes and Tests

- Keep pure layout math and declarative geometry data free of browser/WebGL side effects
  when possible so they remain testable with Bun.
- Use Bun's `describe`, `test`, and `expect` with Given/when/then test names for subtle
  layout, registration, or transform invariants.
- Preserve the tested guarantees that explosion factor zero returns authored positions,
  outer parts separate from the center, and keyboard density remains six rows and 74 keys.
- After visible model changes, inspect all five QA views, narrow layout, screen state,
  explosion, and part picking. A successful build alone is not visual verification.
