# Repository Guide

## Project Overview

This repository is a single-page Vite and Three.js application that renders an
interactive procedural model of a modular cyberdeck laptop. The authored runtime is
small and imperative: `index.html` defines the HUD contract, `src/main.ts` creates the
scene and renderer, and `src/model/` owns model construction and interaction.

`DESIGN.md` is the source of truth for visual language, layout, motion, and
accessibility. The JSON files under `archive-cyberdeck/` document an earlier sculpt and
QA workflow; they are reference material, not active runtime inputs.

## Repository Map

```text
index.html                 DOM, canvas, HUD, and accessible control contract
src/main.ts                runtime composition for rendering, assets, screens, and input
src/style.css              design tokens, HUD layout, responsive behavior, reduced motion
src/assets/                asset definitions and declarative scene instance configuration
src/apps/                  independently mountable DOM screen applications
src/runtime/               asset stage, screen sessions, CSS3D runtime, keyboard routing
src/viewer/                WebGL renderer, camera, lighting, and runtime manifest
src/model/                 procedural geometry, materials, displays, controls, interaction
scripts/browser-qa.mjs     browser smoke and visual-evidence harness
DESIGN.md                  visual and interaction specification
archive-cyberdeck/         historical specs, manifests, and evidence; do not edit by default
.img2threejs/              tool-managed state and reference crops
phone/, ratio/, *.png      source/reference imagery, not application modules
dist/                      generated Vite output
```

There is no framework component tree, router, service layer, or repository-local Vite
configuration. `src/main.ts` is a side-effect-only browser entry point.

## Commands

- `pnpm run dev`: start Vite's development server, normally on port 5173.
- `pnpm run typecheck`: run strict TypeScript checking without emitting files.
- `bun test`: run the colocated Bun unit tests.
- `pnpm run build`: typecheck and generate `dist/` with Vite.
- `pnpm run lint`: run Biome checks over the configured source files.

For browser QA, build the project, start a preview server at
`http://127.0.0.1:4173`, create `evidence/renders/`, and run
`node scripts/browser-qa.mjs`. The script expects Chromium at
`/snap/bin/chromium` and writes screenshots, `evidence/browser-qa.json`, and a root
`parts.json`; treat all of those as generated evidence.

The runtime has colocated Bun tests for layout, registries, sessions, stage ownership,
display contracts, and keyboard routing. Biome may also inspect tool-generated source;
compare diagnostics against the captured task baseline rather than hiding unrelated output.

Biome currently
reports existing configuration, literal-key, and reduced-motion diagnostics; do not
hide existing diagnostics or describe them as regressions introduced by unrelated work.

## TypeScript and Module Conventions

- Follow the strict compiler options in `tsconfig.json`, including unchecked-index,
  exact-optional-property, unused-code, and implicit-return checks.
- Use `import type` for type-only imports, readonly contracts for immutable model data,
  and narrow literal unions where values are closed sets.
- Biome owns formatting and import organization: two-space indentation, 100-column
  width, double quotes, and no semicolons.
- Use camelCase for values and functions, PascalCase for classes and types, kebab-case
  for DOM IDs and runtime component IDs, and `--kebab-case` for CSS custom properties.
- Put new behavior in the narrowest cohesive module. Keep scene composition in
  `src/main.ts`; model-domain rules are defined in `src/model/AGENTS.md`.

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

## Verification Contract

- Run `pnpm run typecheck` and `bun test` after TypeScript model or interaction changes.
- Run `pnpm run build` after changes to browser startup, DOM structure, styling, imports,
  or build-facing assets.
- Run `pnpm run lint` and distinguish new diagnostics from the documented baseline.
- For visible or interactive changes, use the browser QA surface and inspect the result,
  not just the process exit code.
- Browser QA must cover the reference, front, right, rear, and left camera views; screen
  power; screen focus and IME input; physical-key feedback; multi-asset input ownership;
  auto-rotation; explosion; reset; part picking; runtime manifest; 375, 768, 1280, and
  1536-pixel viewports; and console/page errors.

## Project-Specific Boundaries

- Do not edit `archive-cyberdeck/`, `.img2threejs/`, reference image directories, or
  generated `dist/`/evidence files unless the task explicitly targets those artifacts.
- Do not hardcode secrets or credentials. This client-only project currently requires
  none.
- Both pnpm and Bun metadata exist: use pnpm for package scripts and Bun for the declared
  test runner; do not regenerate or remove either lockfile incidentally.
- The working directory may not be a Git repository. Never assume history, branches, or
  restore commands are available; verify repository state before Git operations.
