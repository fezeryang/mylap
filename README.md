# TODŌU 3D Desktop

The long-term product is a personal web page presented as an interactive 3D desktop. Authored
devices will sit on the desk as real asset instances: users can activate them, interact with
their screens, and eventually move or swap their placement. Every phone and computer UI will be
designed as an independent, replaceable interactive screen app.

## Current State

| Asset | Runtime status | Screen status |
| --- | --- | --- |
| `cyberdeck` (laptop) | Integrated in the root registry and stage | Three interactive app surfaces |
| `phone` | Standalone app in `phone/`; adapter planned | One phone-local interactive surface |

The root page is still the cyberdeck viewer and future host candidate. The phone is not yet shown
inside it.

## Commands

| Scope | Develop | Verify | Browser QA |
| --- | --- | --- | --- |
| Laptop/root | `pnpm run dev` | `pnpm run verify:root` | `pnpm run qa:browser` |
| Phone | `pnpm run dev:phone` | `pnpm run verify:phone` | `pnpm --dir phone run qa:browser` |
| Both | run development servers separately | `pnpm run verify:all` | run both QA surfaces separately |

The phone development alias uses port 5174 so it can run beside the root app on 5173.

## Repository Map

- `src/`: current laptop app, shared asset runtime, and future desktop-host foundation
- `phone/`: isolated phone model, viewer, UI, design contract, and QA workflow
- `docs/`: architecture, asset inventory, and staged migration plan
- `DESIGN.md` and `phone/DESIGN.md`: per-asset visual authorities
- `archive-cyberdeck/`: historical reference only
- `.img2threejs/`, `ratio/`, and reference PNGs: tool-managed/reference inputs
- `dist/`, `evidence/`, and `parts.json`: generated build or QA output

## Future Direction

Work proceeds by adapting the phone to the shared asset contract, rendering both devices in one
stage, adding the desktop shell and spatial interaction, then making all device screen apps
independently replaceable. Current and target boundaries are documented in
[Architecture](docs/ARCHITECTURE.md), the two current assets in
[Asset Catalog](docs/ASSET-CATALOG.md), and migration gates in [Roadmap](docs/ROADMAP.md).

Package-specific guidance: [root agent rules](AGENTS.md),
[laptop model rules](src/model/AGENTS.md), and [phone workflow](phone/README.md).
