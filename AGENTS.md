# Repository Guide

## Product Horizon and Current State

This repository is evolving into a personal 3D desktop web page. The intended product places
multiple interactive device assets on a shared 3D desk, lets users activate and eventually move
or swap those asset instances, and mounts independently designed, replaceable screen apps on
phones, computers, and future devices.

There are currently two authored applications, not one completed desktop:

| Asset | Current application | Integration status |
| --- | --- | --- |
| `cyberdeck` | root Vite/Three.js laptop viewer | integrated through `SceneAssetDefinition` and `StageAsset` |
| `phone` | standalone application under `phone/` | model and UI complete locally; root adapter not implemented |

The root runtime is the future host candidate and currently registers only the cyberdeck. Do not
describe the phone, desktop shell, spatial move/swap, or cross-device UI replacement as already
integrated. See `README.md`, `docs/ARCHITECTURE.md`, `docs/ASSET-CATALOG.md`, and
`docs/ROADMAP.md` before changing repository-wide architecture.

An asset type is a reusable definition such as `cyberdeck`; an asset instance is a placed
occurrence with a stable instance ID, transform, active state, and screen sessions. Preserve this
distinction in names, data contracts, tests, and persistence work.

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
docs/                      architecture, authoritative asset catalog, and roadmap
DESIGN.md                  cyberdeck visual and interaction authority
phone/DESIGN.md            phone visual and interaction authority
archive-cyberdeck/         historical reference; not an active runtime input
.img2threejs/, ratio/      tool-managed/reference material; not application modules
dist/, evidence/, parts.json generated build and QA output
```

Do not move the current model trees merely to make the directory layout resemble the future
architecture. Integrate assets through contracts first, with standalone authoring surfaces kept
available for focused visual QA.

## Commands

- `pnpm run dev`: start the root cyberdeck/laptop app, normally on port 5173.
- `pnpm run dev:phone`: start the standalone phone app on port 5174.
- `pnpm run verify:root`: typecheck, test, lint, and build the root app.
- `pnpm run verify:phone`: typecheck, test, lint, and build the phone app.
- `pnpm run verify:all`: verify both isolated applications.
- `pnpm run qa:browser`: run root browser QA after starting its expected preview server.
- `pnpm --dir phone run qa:browser`: run the independent phone browser QA surface.

The existing granular scripts remain valid: use pnpm for package scripts and Bun for the declared
tests. Root browser QA writes `evidence/` and `parts.json`; phone QA writes equivalents under
`phone/`. Treat them as generated evidence.

The runtime has colocated Bun tests for layouts, registries, sessions, stage ownership, display
contracts, and keyboard routing. Biome currently reports existing configuration, literal-key,
and reduced-motion diagnostics; do not hide them or describe them as regressions introduced by
unrelated work.

## Architecture and Ownership

- The shared host/runtime owns instance placement, activation, lifecycle, cross-asset focus and
  input ownership, pointer capture, and eventual layout persistence.
- Each asset model owns geometry, materials, animations, stable part IDs, selectables, physical
  screen anchors, and local visual QA. It must not know about desktop layout.
- Each screen app owns interactive DOM content, UI state, focus behavior, and accessibility. Keep
  UI separate from bezel/glass geometry and independently registered and replaceable.
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
  `src/main.ts`; model-domain rules are defined in `src/model/AGENTS.md`, and phone rules in
  `phone/AGENTS.md`.

## UI and Rendering Contract

- Preserve the semantic controls and DOM IDs in `index.html`; `src/main.ts` validates
  them at startup and throws `DomContractError` when the contract is broken.
- Keep native button/range semantics, labels, `aria-pressed`, `aria-live`, visible
  keyboard focus, and textual status feedback.
- Follow `DESIGN.md`: dark navy glass surfaces, pearl/lavender text, restrained borders
  and glow, and cyan/violet/magenta accents only for state and focus.
- Never introduce pure-white UI text or body copy below 12px. Do not replace the depth
  system with broad generic card shadows.
- Keep CSS animation to UI transform, opacity, and filter. Three.js owns model movement
  and explosion transforms. Respect `prefers-reduced-motion` and do not default to
  autorotation when reduced motion is requested.
- Maintain full-viewport canvas behavior and ensure HUD panels stay at the viewport
  edges without obscuring the model center at the existing responsive breakpoints.
- Do not use a screenshot texture as the final implementation of a UI that must be clickable,
  focusable, stateful, or replaceable. Physical screen geometry and interactive screen apps have
  separate ownership.

## Verification Contract

- Run `pnpm run typecheck` and `bun test` after TypeScript model or interaction changes.
- Run `pnpm run build` after changes to browser startup, DOM structure, styling, imports,
  or build-facing assets.
- Run `pnpm run lint` and distinguish new diagnostics from the documented baseline.
- Run `pnpm run verify:phone` for phone code and `pnpm run verify:all` for changes to shared
  commands, repository architecture, or future multi-asset integration.
- For visible or interactive changes, use the browser QA surface and inspect the result,
  not just the process exit code.
- Browser QA must cover the reference, front, right, rear, and left camera views; screen
  power; screen focus and IME input; physical-key feedback; multi-asset input ownership;
  auto-rotation; explosion; reset; part picking; runtime manifest; 375, 768, 1280, and
  1536-pixel viewports; and console/page errors.
- Future desktop QA must additionally cover two simultaneous asset instances, active-asset and
  focused-screen ownership, drag/pointer capture, swap preserving stable IDs and screen state,
  disposal, keyboard-only access, and reduced motion.

## Project-Specific Boundaries

- Do not edit `archive-cyberdeck/`, `.img2threejs/`, `ratio/`, reference image directories,
  `phone/src/model/generated/`, or generated `dist/`/`evidence/`/`parts.json` files unless the
  task explicitly targets those artifacts.
- Do not hardcode secrets or credentials. This client-only project currently requires
  none.
- Both pnpm and Bun metadata exist: use pnpm for package scripts and Bun for the declared test
  runner; do not regenerate, remove, or create package lockfiles incidentally.
- The working directory may not be a Git repository. Never assume history, branches, or
  restore commands are available; verify repository state before Git operations.
