# 3D Asset Catalog

This is the authoritative inventory of authored runtime assets. Reference images, archives,
generated evidence, and `ratio/` research are not runtime assets.

## Asset: cyberdeck

- **Type ID / status:** `cyberdeck`; integrated in the root host
- **Display name:** laptop / cyberdeck
- **Model factory:** `src/model/create-cyberdeck-model.ts`
- **Standalone entrypoint:** `index.html` -> `src/main.ts`
- **StageAsset adapter:** integrated at `src/assets/cyberdeck-asset.ts`
- **Screen:** three surfaces; physical anchors belong to the model and interactive content
  belongs to registered apps under `src/apps/`
- **Interaction / QA:** picking, explosion, physical keyboard, screen focus and power;
  `pnpm run qa:browser`
- **Design authority:** `DESIGN.md`
- **Reference / archive / evidence:** root reference images and `.img2threejs/` are inputs;
  `archive-cyberdeck/` is historical; `dist/`, `evidence/`, and `parts.json` are generated
- **Generated exclusions:** never treat build or QA output as authored model source
- **Next integration gate:** preserve the current adapter while adding a mixed-asset scene

## Asset: phone

- **Type ID / status:** `phone`; standalone authoring app
- **Display name:** neon cyberphone
- **Model factory:** `phone/src/model/createPhoneModel.ts`
- **Standalone entrypoint:** `phone/index.html` -> `phone/src/main.ts`
- **StageAsset adapter:** planned / not integrated
- **Screen:** one phone-local interactive surface; geometry and anchor belong to the model,
  while the current UI binding belongs to `phone/src/ui/`
- **Interaction / QA:** orbit, explosion, picking, screen controls; run
  `pnpm --dir phone run qa:browser`
- **Design authority:** `phone/DESIGN.md`; reference image `phone/phone.png`
- **Reference / archive / evidence:** `phone/.img2threejs/` is tool-managed; `phone/dist/`,
  `phone/evidence/`, and `phone/parts.json` are generated QA outputs
- **Generated exclusions:** `phone/src/model/generated/` is tool-generated and excluded from
  normal compilation and lint ownership
- **Next integration gate:** add a root-side adapter without removing the standalone viewer

## Required Fields for Future Assets

Every new asset record must name its stable type ID, model factory, standalone QA entrypoint,
adapter status, stable part and screen IDs, design authority, reference inputs, generated
boundaries, verification command, and next integration gate.
