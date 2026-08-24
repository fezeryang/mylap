# Personal 3D Desktop Roadmap

Asset spatial swap and screen-app replacement are distinct product capabilities. Neither is
fully implemented today.

## Milestone 1: Phone adapter

### Entry criteria

The standalone phone viewer and QA suite remain green.

### Deliverable

Add a root-side `SceneAssetDefinition` that adapts the phone model to `StageAsset`. Normalize
type and instance IDs, explosion state, `AssetPart[]`, selectables, `ScreenSurface[]`, `update`,
and `dispose` without importing the standalone viewer.

### Exit criteria

The adapter has lifecycle tests and the standalone `phone/` authoring surface still works.

### Out of scope

Desktop layout, move, swap, persistence, and redesigning the phone screen app.

## Milestone 2: Mixed-asset stage

### Entry criteria

Both asset adapters satisfy the shared contracts independently.

### Deliverable

Register and render cyberdeck and phone together with deterministic instance IDs, activation,
screen ownership, update, removal, and disposal tests.

### Exit criteria

Both devices coexist without input, focus, or resource-lifecycle leaks.

### Out of scope

Final personal-page composition and spatial editing.

## Milestone 3: Desktop shell

### Entry criteria

The mixed stage is stable at supported viewport sizes.

### Deliverable

Introduce the personal-page shell, 3D desk environment, and declarative asset placements while
keeping asset geometry independent of the host.

### Exit criteria

The page loads both devices, activates either one, and preserves accessible DOM controls.

### Out of scope

Freeform move/swap, snapping, and persistent layout editing.

## Milestone 4: Spatial interaction

### Entry criteria

Desktop placement and activation have stable instance identity.

### Deliverable

Add selection, move, swap, constraints/snapping, focus and input ownership, pointer capture,
and persisted layout with keyboard-accessible equivalents.

### Exit criteria

Users can rearrange device instances without losing screen sessions, IDs, or state.

### Out of scope

Coupling any screen app to desktop transform code.

## Milestone 5: Replaceable device UIs

### Entry criteria

Each asset exposes stable screen surfaces and the desktop owns focus arbitration.

### Deliverable

Move each device UI behind independently registered, replaceable screen app definitions with
explicit install, focus, power, input, replacement, and disposal lifecycles.

### Exit criteria

Changing a screen app does not rebuild the model, and moving an asset does not recreate its UI
unless the product explicitly requests it.

### Out of scope

Embedding UI screenshots into geometry as a substitute for real interaction.
