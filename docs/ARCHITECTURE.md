# Project Architecture

## Current State

The repository contains two isolated Three.js applications:

```text
root cyberdeck/laptop app
  AssetRegistry -> SceneAssetDefinition -> AssetStage -> StageAsset
                                            |-> ScreenRuntime -> screen apps
                                            `-> viewer, input, picking, lifecycle

phone/ standalone app
  phone model -> phone viewer -> phone-local screen binding and controls
```

The root app currently registers only `cyberdeck`. Its runtime is the candidate host for
the future personal 3D desktop, but it is not yet that finished desktop. The phone is not
currently registered in the root `AssetStage`; its standalone viewer remains the authoring
and QA surface.

An **Asset Type** identifies a reusable definition such as `cyberdeck` or `phone`. An
**Asset Instance** is one placed occurrence with its own stable ID, transform, active state,
screen sessions, and eventual persisted layout.

## Target State

```text
personal page / 3D desktop shell
  shared stage, selection, placement, input ownership, persistence
    SceneAssetDefinition adapters
      asset-owned procedural models and materials
        ScreenSurface anchors -> independently registered screen apps
```

Dependencies flow downward. The desktop may place and activate assets, but it must not know
their geometry internals. Asset packages expose stable parts, selectables, screens, update,
explosion, and disposal through `StageAsset`. Screen apps own interactive DOM content and do
not own the physical bezel, glass, or hit geometry.

There are two separate kinds of exchange:

- **Asset move/swap** changes where device instances sit on the 3D desktop. It is future work.
- **Screen-app replacement** changes the interactive UI mounted on a device screen while the
  physical asset remains in place. `ScreenRuntime` and screen sessions provide a foundation,
  but the complete cross-device product flow is future work.

## Ownership Rules

- The desktop host owns placement, active asset, focus arbitration, pointer capture, and
  cross-asset lifecycle.
- Each asset owns geometry, materials, animation details, part IDs, screen anchors, and local
  visual QA.
- Each screen app owns its UI state and accessibility. UI must not be baked permanently into
  model textures when it is expected to remain clickable or replaceable.
- Adapters translate asset-local model outputs into `SceneAssetDefinition` and `StageAsset`;
  they do not import an asset's standalone viewer.

See [the asset catalog](./ASSET-CATALOG.md) and [the migration roadmap](./ROADMAP.md).
