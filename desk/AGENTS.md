# Cyber Desk Workspace Guide

## Scope

`desk/` is the standalone procedural authoring and visual-QA surface for asset type
`cyber-desk`. It is not registered with the root `AssetRegistry` and has no root
`SceneAssetDefinition` adapter yet.

## Where to Look

| Concern | Location | Authority |
| --- | --- | --- |
| Active procedural model | `src/createCyberDesk.ts` | Authored geometry and runtime contract |
| Model contract tests | `src/createCyberDesk.test.ts` | Stable IDs, explosion, picking ownership |
| Isolated viewer | `src/main.ts`, `index.html`, `src/style.css` | Camera, controls, render loop, QA hooks |
| Reconstruction intent | `analysis.md`, `projection-route.md`, `object-sculpt-spec.json` | Visible-form and material rationale |
| Spec authoring helper | `scripts/author-spec.mjs` | Rewrites the sculpt spec intentionally |
| Browser verification | `scripts/browser-qa.mjs` | Deterministic views, controls, picking, responsive bounds |
| Generated model snapshot | `src/createObjectModel.generated.ts` | Inactive generator output; not application source |

## Active Model Contract

- `createCyberDeskModel()` must remain independently importable without starting a renderer.
- Preserve `root.userData.assetTypeId === "cyber-desk"` and the `sculptRuntime` shape.
- Part IDs and mesh ownership are public QA/integration data. The current manifest has 19
  selectable/explodable parts; rename or regroup only with matching tests and manifests.
- Preserve the five `socket-desktop-asset-*` anchors as attachment metadata. They do not imply
  placement policy, communication, or an implemented multi-device desktop.
- Preserve leg sockets, `collider-tabletop`, leg collider IDs/metadata, and the five destruction
  groups. Visual meshes are not physics colliders.
- Explosion must clamp to `[0, 1]`, move parts from captured rest transforms, and reset
  deterministically. Surface-detail meshes resolve to their owning selectable part.
- `dispose()` owns all geometries, authored materials, and procedural textures allocated by the
  model. New resources must join that disposal path.

## Authored vs Generated Source

- `src/createCyberDesk.ts` is the active implementation imported by the viewer and tests.
- Do not import, hand-maintain, or route runtime work through
  `src/createObjectModel.generated.ts`; it is excluded by `tsconfig.json` and `biome.json`.
- Regenerate generated artifacts only when the task explicitly targets the generation pipeline.
  Do not copy renderer, controls, post-processing, or environment setup from generated output
  into the model factory.

## Reference and Evidence Limits

- `desk.png` is a single three-quarter product render. Rear legs, underside, dimensions, cable
  routing, and hidden panels are symmetry/design-language inference, not verified geometry.
- Keep `referenceLimit` truthful and describe output as a procedural likeness, never as an exact
  scan or manufacturing model.
- The standalone viewer owns lighting, camera presets, picking UI, responsive framing, and the
  `window.__deskPreview` QA API. The model owns none of those concerns.
- `evidence/`, `parts.json`, `dist/`, `.img2threejs/`, `detail-evidence/`, and
  `material-evidence/` are generated or tool/reference surfaces. Do not edit them as source.

## Local Commands

```bash
pnpm --dir desk run dev       # Vite authoring surface on 5175
pnpm --dir desk run verify    # typecheck + Bun tests + production build
pnpm --dir desk run preview   # required QA preview server on 4175
pnpm --dir desk run qa:browser
```

Run `preview` and `qa:browser` in separate terminals. Browser QA writes renders and reports under
`desk/evidence/` plus `desk/parts.json`; inspect the reference/front/side/rear/top, exploded,
lights-off, selected-part, and responsive captures after visible changes.

## Root Integration Boundary

A future root adapter may import the model factory and translate its stable runtime metadata into
`StageAsset`. It must not import `desk/src/main.ts`, the standalone viewer DOM, camera, controls,
scene, or render loop. Keep this authoring surface runnable after integration.
