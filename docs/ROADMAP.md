# Personal 3D Desktop Roadmap

Asset spatial swap and screen-app registration are distinct product capabilities. The fixed
four-asset desktop and independently registered screen apps are delivered; spatial editing and
persistence are not.

## Delivered: integrated desktop foundation

- Four root adapters with stable instances and validated, non-overlapping fixed placements.
- Six independently registered screen sessions across computer, phone, and ratio.
- Desktop shell navigation, model picking, screen focus/power, keyboard ownership, explosion,
  reset, removal, and disposal behavior.
- One shared Oh-hO service with production discovery and capability-gated deterministic QA.
- A computer browser view with URL validation, sandboxing, no-referrer embedding, and guarded
  external-window behavior.
- Standalone phone, desk, and ratio authoring/QA surfaces remain available.

## Next: spatial interaction

### Entry criteria

Desktop placement and activation have stable instance identity.

### Deliverable

Add selection, move, swap, constraints/snapping, focus and input ownership, pointer capture,
and persisted layout with keyboard-accessible equivalents.

### Exit criteria

Users can rearrange device instances without losing screen sessions, IDs, or state.

### Out of scope

Coupling any screen app to desktop transform code.

## Later: installable and replaceable device UIs

### Entry criteria

Each current asset exposes stable screen surfaces and the desktop owns focus arbitration.

### Deliverable

Add user-facing installation and replacement controls to the independently registered screen app
definitions, with explicit replacement and migration lifecycles.

### Exit criteria

Changing a screen app does not rebuild the model, and moving an asset does not recreate its UI
unless the product explicitly requests it.

### Out of scope

Embedding UI screenshots into geometry as a substitute for real interaction.
