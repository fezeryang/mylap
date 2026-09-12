# TODŌU 3D Desktop

TODŌU is a personal web page presented as an interactive 3D desktop. Four authored assets share
one host, while device interfaces remain independently registered screen applications. Spatial
move/swap and saved layouts remain future work.

## Current State

| Asset | Runtime status | Screen status |
| --- | --- | --- |
| `cyberdeck` | Root adapter and `computer-main` instance | Three screen sessions |
| `cyber-desk` | Root adapter and fixed `desk-main` instance | No screen sessions |
| `phone` | Root adapter plus standalone `phone/` authoring app | One screen session |
| `ratio` | Root adapter plus standalone `ratio/` authoring app | Two display sessions |

The root host mounts the four stable instances from a validated scene specification and maintains
six screen sessions. Its shell provides overview, phone focus, and computer focus; the phone and
computer share the host-owned Oh-hO radio service. The computer launcher also includes a
scheme-checked, sandboxed browser view.

## Commands

| Scope | Develop | Verify | Browser QA |
| --- | --- | --- | --- |
| Desktop/root | `pnpm run dev` | `pnpm run verify:root` | `pnpm run qa:browser` |
| Phone | `pnpm run dev:phone` | `pnpm run verify:phone` | `pnpm --dir phone run qa:browser` |
| Desk | `pnpm --dir desk run dev` | `pnpm --dir desk run verify` | `pnpm --dir desk run qa:browser` |
| Ratio | `pnpm --dir ratio run dev` | `pnpm --dir ratio run verify` | `pnpm --dir ratio run qa:browser` |

The phone development alias uses port 5174 so it can run beside the root app on 5173.

## Repository Map

- `src/`: desktop host, root adapters, screen apps, shared services, shell, and runtime
- `phone/`: isolated phone model, viewer, UI, design contract, and QA workflow
- `desk/`: isolated cyber-desk model and authoring/QA workflow
- `ratio/`: isolated radio model, UI, and authoring/QA workflow
- `docs/`: architecture, asset inventory, and staged migration plan
- `DESIGN.md` and `phone/DESIGN.md`: per-asset visual authorities
- `archive-cyberdeck/`: historical reference only
- `.img2threejs/` and reference PNGs: tool-managed/reference inputs
- `dist/`, `evidence/`, and `parts.json`: generated build or QA output

## Future Direction

Current boundaries are documented in [Architecture](docs/ARCHITECTURE.md), the four integrated
assets in [Asset Catalog](docs/ASSET-CATALOG.md), and remaining product work in
[Roadmap](docs/ROADMAP.md).

Package-specific guidance: [root agent rules](AGENTS.md),
[laptop model rules](src/model/AGENTS.md), and [phone workflow](phone/README.md).
