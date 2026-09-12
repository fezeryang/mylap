# 3D Asset Catalog

This is the authoritative inventory of authored runtime assets. Reference images, archives,
and generated evidence are not runtime assets.

## Asset: cyberdeck

- **Type ID / status:** `cyberdeck`; integrated in the root host
- **Display name:** laptop / cyberdeck
- **Model factory:** `src/model/create-cyberdeck-model.ts`
- **Root entrypoint:** `index.html` -> `src/main.ts`
- **StageAsset adapter:** integrated at `src/assets/cyberdeck-asset.ts`
- **Screen:** three surfaces; physical anchors belong to the model and interactive content
  belongs to registered apps under `src/apps/`
- **Interaction / QA:** picking, explosion, physical keyboard, screen focus and power;
  `pnpm run qa:browser`
- **Design authority:** `DESIGN.md`
- **Reference / archive / evidence:** root reference images and `.img2threejs/` are inputs;
  `archive-cyberdeck/` is historical; `dist/`, `evidence/`, and `parts.json` are generated
- **Generated exclusions:** never treat build or QA output as authored model source
- **Placement / instance:** `computer-main`; fixed by the root scene specification

## Asset: phone

- **Type ID / status:** `phone`; integrated root adapter and standalone authoring app
- **Display name:** neon cyberphone
- **Model factory:** `phone/src/model/createPhoneModel.ts`
- **Standalone entrypoint:** `phone/index.html` -> `phone/src/main.ts`
- **StageAsset adapter:** `src/assets/phone-asset.ts`
- **Screen:** stable `phone-primary` surface; the root mounts the registered phone shell app
- **Interaction / QA:** orbit, explosion, picking, screen controls; run
  `pnpm --dir phone run qa:browser`
- **Design authority:** `phone/DESIGN.md`; reference image `phone/phone.png`
- **Reference / archive / evidence:** `phone/.img2threejs/` is tool-managed; `phone/dist/`,
  `phone/evidence/`, and `phone/parts.json` are generated QA outputs
- **Generated exclusions:** `phone/src/model/generated/` is tool-generated and excluded from
  normal compilation and lint ownership
- **Placement / instance:** `phone-main`; fixed by the root scene specification

## Asset: cyber-desk

- **Type ID / status:** `cyber-desk`; integrated root adapter and standalone authoring app
- **Model factory:** `desk/src/createCyberDesk.ts`
- **Standalone entrypoint:** `desk/index.html` -> `desk/src/main.ts`
- **StageAsset adapter:** `src/assets/cyber-desk-asset.ts`
- **Screen:** none; the desk supplies the shared physical environment
- **Interaction / QA:** picking, bounds, explosion, and disposal; run
  `pnpm --dir desk run qa:browser`
- **Design authority:** `desk/DESIGN.md`
- **Placement / instance:** `desk-main`; fixed by the root scene specification

## Asset: ratio

- **Type ID / status:** `ratio`; integrated root adapter and standalone authoring app
- **Model factory:** `ratio/src/model/createRadioModel.ts`
- **Standalone entrypoint:** `ratio/index.html` -> `ratio/src/main.ts`
- **StageAsset adapter:** `src/assets/ratio-asset.ts`
- **Screen:** stable `ratio-tuner` and `ratio-cassette` displays; both present the shared radio state
- **Interaction / QA:** picking, display state, explosion, and disposal; run
  `pnpm --dir ratio run qa:browser`
- **Design authority:** `ratio/DESIGN.md`
- **Placement / instance:** `radio-main`; fixed by the root scene specification

## Required Fields for Future Assets

Every new asset record must name its stable type ID, model factory, standalone QA entrypoint,
adapter status, stable part and screen IDs, design authority, reference inputs, generated
boundaries, verification command, and next integration gate.
