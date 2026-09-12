# Project Architecture

## Current State

The root is the composed desktop host, while phone, desk, and ratio retain isolated authoring and
QA applications:

```text
root personal desktop host
  validated scene specification -> AssetRegistry -> AssetStage (four instances)
                                             |-> ScreenRuntime (six sessions)
                                             |-> shell/navigation/input/picking
                                             `-> shared radio service and lifecycle

phone/, desk/, ratio/
  asset-local model -> standalone authoring viewer and QA surface
```

The root registers `cyberdeck`, `cyber-desk`, `phone`, and `ratio` definitions. Declarative,
validated placements produce `computer-main`, `desk-main`, `phone-main`, and `radio-main`.
`ScreenRuntime` mounts three computer screens, one phone screen, and two ratio displays.

An **Asset Type** identifies a reusable definition such as `cyberdeck` or `phone`. An
**Asset Instance** is one placed occurrence with its own stable ID, transform, active state,
screen sessions, and eventual persisted layout.

## Host Composition

```text
personal page / 3D desktop shell
  shared stage, fixed placement, activation, focus and input ownership
    SceneAssetDefinition adapters
      asset-owned procedural models and materials
        ScreenSurface anchors -> independently registered screen apps
```

Dependencies flow downward. The desktop may place and activate assets, but it does not know
their geometry internals. Asset packages expose stable parts, selectables, screens, update,
explosion, and disposal through `StageAsset`. Screen apps own interactive DOM content and do
not own the physical bezel, glass, or hit geometry.

There are two separate kinds of exchange:

- **Asset move/swap** changes where device instances sit on the 3D desktop. It is future work.
- **Screen-app registration** selects the interactive UI mounted on each device screen while the
  physical asset remains in place. The root currently registers six application definitions and
  keeps their sessions alive across navigation.

The host owns one radio media service. Phone Oh-hO, computer Oh-hO, and both ratio displays read
the same typed state. Production station discovery uses the Radio Browser directory; deterministic
radio fixtures are capability-gated to the explicit root QA query.

## Ownership Rules

- The desktop host owns fixed placement, active asset, focus arbitration, keyboard routing,
  picking, and cross-asset lifecycle.
- Each asset owns geometry, materials, animation details, part IDs, screen anchors, and local
  visual QA.
- Each screen app owns its UI state and accessibility. UI must not be baked permanently into
  model textures when it is expected to remain clickable or replaceable.
- Adapters translate asset-local model outputs into `SceneAssetDefinition` and `StageAsset`;
  they do not import an asset's standalone viewer.
- Root asset adapters may import only their approved model factory boundary. Services do not
  import models, assets, apps, or sibling packages; an AST test enforces these dependency rules.

See [the asset catalog](./ASSET-CATALOG.md) and [the migration roadmap](./ROADMAP.md).
