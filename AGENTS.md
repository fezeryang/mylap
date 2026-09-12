# Repository Guide

## Product Horizon and Current State

TODŌU is evolving into a personal 3D device ecosystem and product-design entry point. Procedural
assets share a spatial desktop while phones, computers, radios, cameras, storage walls, and future
devices expose independently developed interactive applications. Cross-device sessions, shared
media, AI-assisted apps, capture, and personal content are product goals, not current capabilities.

| Asset | Current application | Integration status |
| --- | --- | --- |
| `cyberdeck` | root Vite/Three.js laptop viewer | integrated through `SceneAssetDefinition` and `StageAsset` |
| `phone` | standalone interactive phone app under `phone/` | root adapter not implemented |
| `cyber-desk` | standalone desk authoring/QA app under `desk/` | root adapter not implemented |
| `ratio` | standalone radio with interactive demo media UI | root adapter not implemented |

The root runtime currently registers only cyberdeck; `?assets=2` creates two cyberdeck instances,
not a heterogeneous desktop. Do not describe spatial move/swap, persisted layout, standalone asset
adapters, real media streaming, cross-device synchronization, AI, camera capture, or storage-wall
behavior as implemented. Read the architecture, catalog, and roadmap before changing central
contracts.

An asset type is a reusable definition such as `cyberdeck`; an asset instance is a placed
occurrence with a stable instance ID, transform, active state, and screen sessions. Preserve this
distinction in names, contracts, tests, shared-service state, and persistence.

## Repository Map

```text
index.html                 root laptop DOM, canvas, HUD, and accessible control contract
src/main.ts                current root composition and future desktop-host entrypoint
src/assets/                SceneAssetDefinition adapters and declarative placements
src/apps/                  independently mountable root screen applications
src/runtime/               shared asset stage, screen sessions, and input ownership
src/viewer/                root WebGL/CSS3D viewer, camera, lighting, and manifest
src/model/                 cyberdeck model; additional rules in src/model/AGENTS.md
phone/                     isolated phone model, viewer, interactive UI, and QA app
phone/AGENTS.md            phone-local ownership and verification rules
desk/                      isolated procedural desk authoring and QA app
desk/AGENTS.md             desk-local model, spec, and verification rules
ratio/                     isolated interactive radio and media authoring app
ratio/AGENTS.md            radio-local ownership and verification rules
docs/                      architecture, authoritative asset catalog, and roadmap
DESIGN.md                  cyberdeck visual and interaction authority
phone/DESIGN.md            phone visual and interaction authority
archive-cyberdeck/         historical reference; not an active runtime input
.img2threejs/              tool-managed material; not an application module
dist/, evidence/, parts.json generated build and QA output
```

Do not move the current model trees merely to make the directory layout resemble the future
architecture. Integrate assets through contracts first, with standalone authoring surfaces kept
available for focused visual QA.

## Code Map

| Central symbol | Location | Responsibility |
| --- | --- | --- |
| `SceneAssetDefinition` / `StageAsset` | `src/runtime/asset-contracts.ts` | type/instance boundary |
| `AssetRegistry` / `AssetStage` | `src/runtime/` | registration and instance lifecycle |
| `ScreenRuntime` / `ScreenSession` | `src/runtime/` | replaceable apps, power, focus, disposal |
| `cyberdeckAssetDefinition` | `src/assets/cyberdeck-asset.ts` | only current root asset adapter |

## Commands

- `pnpm run dev`: start the root cyberdeck/laptop app, normally on port 5173.
- `pnpm run dev:phone`: start the standalone phone app on port 5174.
- `pnpm run verify:root`: typecheck, test, lint, and build the root app.
- `pnpm run verify:phone`: typecheck, test, lint, and build the phone app.
- `pnpm run verify:all`: verify the root and phone applications.
- `pnpm run qa:browser`: run root browser QA after starting its expected preview server.
- `pnpm --dir phone run qa:browser`: run the independent phone browser QA surface.
- `pnpm --dir desk run dev` / `pnpm --dir desk run verify`: develop or verify the desk app.
- `pnpm --dir ratio run dev` / `pnpm --dir ratio run verify`: develop or verify the radio app.

Use pnpm for package scripts and Bun for tests. `verify:all` covers root and phone only, not desk
or ratio. Desk and ratio both default to development port 5175, so run them separately or
override a port. Browser QA writes generated
`evidence/` and `parts.json` in the matching application.

## Architecture and Ownership

- The shared host/runtime owns instance placement, activation, lifecycle, cross-asset focus and
  input ownership, pointer capture, and eventual layout persistence.
- Each asset model owns geometry, materials, animations, stable part IDs, selectables, physical
  screen anchors, and local visual QA. It must not know about desktop layout.
- Each screen app owns interactive DOM content, UI state, focus behavior, and accessibility. Keep
  UI separate from bezel/glass geometry and independently registered and replaceable.
- Messaging, AI, media, persistence, and synchronization are host/service concerns. Add narrow
  typed request/event/snapshot contracts; never couple one asset to another asset's viewer,
  reducer, player, or model internals.
- Physical model sockets are attachment metadata only. Desk placement slots and communication
  channels require separate typed contracts.
- A standalone asset viewer is an authoring/QA tool. Root integration uses a narrow adapter and
  must not import that viewer or its render loop.

Future assets must receive a stable type ID and expose a `SceneAssetDefinition` that creates a
`StageAsset` with stable instance, part, and screen IDs, selectables, screen surfaces, update,
explosion, and disposal behavior. Add the asset to `docs/ASSET-CATALOG.md`, retain an isolated QA
entrypoint, and test registration, activation, removal, input ownership, and resource disposal.

## TypeScript and Module Conventions

- Follow the strict compiler options in `tsconfig.json`, including unchecked-index,
  exact-optional-property, unused-code, and implicit-return checks.
- Use `import type` for type-only imports, readonly contracts for immutable model data,
  and narrow literal unions where values are closed sets.
- Biome owns formatting and import organization: two-space indentation, 100-column
  width, double quotes, and no semicolons.
- Use camelCase for values and functions, PascalCase for classes and types, kebab-case
  for DOM IDs and runtime component IDs, and `--kebab-case` for CSS custom properties.
- Put new behavior in the narrowest cohesive module. Keep root scene composition in
  `src/main.ts`; follow the nearest nested `AGENTS.md` for model, runtime, app, or asset rules.

## UI and Rendering Contract

- Preserve semantic controls and DOM IDs; startup validates the contract. Keep native semantics,
  labels, `aria-pressed`, `aria-live`, visible focus, IME, and textual status feedback.
- Follow the nearest `DESIGN.md`: dark navy glass, pearl/lavender text, restrained depth, and
  cyan/violet/magenta only for state/focus/emission. No pure-white text or body copy below 12px.
- CSS owns UI transform, opacity, and filter; Three.js owns model/camera/explosion movement.
  Respect `prefers-reduced-motion` and never default to autorotation under reduced motion.
- Keep full-viewport canvases and edge HUDs from obscuring the model at supported breakpoints.
- Do not use a screenshot texture as the final implementation of a UI that must be clickable,
  focusable, stateful, or replaceable. Physical screen geometry and interactive screen apps have
  separate ownership.

## Verification Contract

- Run the nearest package's typecheck, Bun tests, lint when available, and build after source
  changes. Use `verify:all` for root/phone architecture work and separate desk/ratio verification.
- Visible or interactive changes require browser QA and inspected renders, not only a green build.
- Browser QA preserves deterministic views and supported viewports plus interaction/focus, power,
  input ownership, rotation, explosion/reset, picking, manifests, and console/page-error checks.
- Future desktop QA must additionally cover two simultaneous asset instances, active-asset and
  focused-screen ownership, drag/pointer capture, swap preserving stable IDs and screen state,
  disposal, keyboard-only access, and reduced motion.

## Project-Specific Boundaries

- Do not edit `archive-cyberdeck/`, any `.img2threejs/`, reference-image directories, generated
  model trees, or generated `dist/`/`evidence/`/`parts.json` files unless explicitly targeted.
  Authored `desk/` and `ratio/` source is not reference material.
- Do not hardcode secrets or credentials; this client-only project currently requires none.
- Both pnpm and Bun metadata exist: use pnpm for package scripts and Bun for the declared test
  runner; do not regenerate, remove, or create package lockfiles incidentally.
- The working directory may not be a Git repository. Never assume history, branches, or
  restore commands are available; verify repository state before Git operations.
