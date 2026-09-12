# Runtime Guide

## Scope

This directory defines the root host's asset lifecycle, screen sessions, and input ownership.
Keep it asset-agnostic: concrete geometry and screen UI enter through typed contracts.

## Contract Boundaries

- `SceneAssetDefinition` is one reusable asset-type factory, registered by `AssetTypeId`.
- `StageAsset` is one mounted occurrence created with an `AssetInstanceId`; it owns that
  instance's root, parts, screens, optional keyboard, animation, explosion state, and disposal.
- Never use a type ID where placement, activation, screen state, events, or persistence need an
  instance ID. Multiple instances of the same type must remain independent.
- Construct branded IDs through `ids.ts`; keep type, instance, screen, and app IDs distinct.
- Registry definitions are reusable and stateless with respect to mounted occurrences.

## Stage Lifecycle

- Preserve mount order: reject duplicate instance ID, resolve type, create, apply placement, index,
  add to the scene, emit `asset-added`, then activate only when the stage had no active asset.
- Preserve removal order: unindex, remove from the scene, dispose exactly once, emit
  `asset-removed`, then emit the active fallback when the removed asset was active.
- Event listeners may coordinate screens, controls, and keyboards; changing event order is a
  contract change and requires explicit ordering tests.
- `findOwner` walks ancestors to a mounted root. Do not infer ownership from names or `userData`.
- `dispose()` removes every instance through the normal lifecycle before clearing listeners.
  Asset adapters remain responsible for releasing their own geometry, materials, and local state.

## Screens and Focus

- Key screen sessions by `AssetInstanceId` plus `ScreenId`, never by screen ID alone.
- `ScreenSession.install` disposes the previous handle, clears its host, mounts the replacement,
  and immediately transfers the session's active state to the new handle.
- Power gates app updates and screen visibility. Powering off a focused asset must release focus.
- Focusing a screen activates its asset and disables orbit controls; Escape, an outside pointer,
  power-off, removal, and runtime disposal must restore controls and release DOM focus.
- A screen app requests activation and focus through `ScreenAppContext`; it does not manipulate
  the stage, camera controls, physical screen anchor, or another session directly.

## Keyboard Ownership

- Route physical keys only to the active asset's optional keyboard; ignore auto-repeat presses.
- Clear held keys before switching keyboards and on window blur, hidden-page transitions,
  disconnect, asset removal through active fallback, and final disposal. Never leave stale pressed
  state on a formerly active or detached asset.

## Ownership and Future Seams

- Host/runtime owns placement, activation, cross-asset focus, input routing, lifecycle, and events.
- Asset adapters own physical model data and instance-local resource disposal.
- Screen apps own DOM UI, app state, accessibility, and their returned handle lifecycle.
- Add future messaging, media, persistence, AI, or synchronization only as narrow typed
  request/event/snapshot seams. Do not import another asset's viewer, reducer, player, or model
  internals, and do not claim a service exists merely because a contract has been introduced.

## Anti-Patterns

- Global active/focused/power state keyed only by asset type or screen name.
- Asset-specific conditionals, geometry traversal, or standalone viewer loops in runtime modules.
- Silent duplicate replacement in registries, disposal outside the normal lifecycle, or events
  emitted with half-updated stage state.
- Screen apps reaching across sessions or owning physical Three.js screen geometry.

## Targeted Verification

- `bun test src/runtime/asset-registry.test.ts`: duplicate and unknown asset types.
- `bun test src/runtime/asset-stage.test.ts`: multi-instance identity, duplicate mounts, removal,
  activation fallback, and exactly-once disposal. Add assertions when changing events/owner lookup.
- `bun test src/runtime/screen-session.test.ts`: duplicate app registration and replacement
  disposal. Add focused coverage when changing activation, power, update, or final cleanup.
- `bun test src/runtime/keyboard-controller.test.ts`: press/release animation, router switching,
  repeat suppression, and held-state clearing. Add `ScreenRuntime` coverage for focus/power changes.
