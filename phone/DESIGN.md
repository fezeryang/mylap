# Neon Cyberphone Design System

## 0. Research Log

- Concrete reference: `phone.png` is the visual contract; extracted its silhouette, material ramps,
  UI hierarchy, spacing, and state accents into this document.
- Interaction reference: beui.dev `button`; adapted its interruptible press scale, input-capability
  guard, state feedback, and reduced-motion fallback without adding React/Motion to this vanilla app.
- Generated drafts skipped: the user supplied the definitive reference, so a new concept image would
  weaken fidelity rather than clarify direction.

## 1. Atmosphere & Identity

A luminous piece of near-future industrial hardware suspended in deep space. Its signature is the
four-layer perimeter: near-black glass nested inside polished cool metal, a clear violet bumper, and
a cyan-to-magenta practical light that also explains interaction state. The model is the interface;
viewer chrome stays sparse and lives at the edges so the phone centre remains unobstructed.

## 2. Color

| Role | Token | Value | Usage |
|---|---|---:|---|
| Void | `--void` | `#02030a` | Canvas and page background |
| Surface/navy | `--surface-navy` | `#06135b` | Screen base |
| Surface/deep | `--surface-deep` | `#071247` | Glass and inset panels |
| Surface/ink | `--surface-ink` | `#020512` | Bezel and port cavities |
| Metal/pearl | `--metal-pearl` | `#dcd5f4` | Chassis highlight |
| Metal/violet | `--metal-violet` | `#947de9` | Reflected metal midtone |
| Text/primary | `--text-primary` | `#f4f0ff` | Clock and primary labels |
| Text/secondary | `--text-secondary` | `#b8c8ff` | Metadata and control labels |
| Accent/cyan | `--accent-cyan` | `#28e8ff` | Active/focus/right rim |
| Accent/blue | `--accent-blue` | `#315cff` | UI structure |
| Accent/violet | `--accent-violet` | `#8b45ff` | Gradient bridge |
| Accent/magenta | `--accent-magenta` | `#ff42ef` | State/lower and top hotspots |
| Accent/warm | `--accent-warm` | `#ffc252` | Weather icon only |
| Status/success | `--status-success` | `#53ffd2` | Completed interaction |

Rules:

- Pure white is not used; pearl text remains slightly lavender.
- Cyan/violet/magenta identify emission, focus, selection, or state, never generic decoration.
- The screen gradient flows navy → cobalt; the perimeter gradient flows cyan → blue → violet →
  magenta and must remain a multi-stop ramp.

## 3. Typography

| Level | Size | Weight | Line height | Tracking | Usage |
|---|---:|---:|---:|---:|---|
| Clock | `4.75rem` | 300 | 0.9 | `-0.06em` | `09:42` focal readout |
| Display | `2rem` | 650 | 1 | `-0.03em` | Showcase title |
| Panel title | `1rem` | 650 | 1.15 | `0` | Screen panels |
| Body | `0.875rem` | 500 | 1.45 | `0` | Viewer instructions |
| Label | `0.75rem` | 650 | 1.2 | `0.04em` | Buttons and panel labels |
| Micro | `0.625rem` | 650 | 1.15 | `0.08em` | Status metadata |

- Primary: `Rajdhani`, `Bahnschrift`, `Segoe UI`, system sans-serif.
- Mono: `Share Tech Mono`, `Cascadia Mono`, `SFMono-Regular`, monospace.
- Remote fonts are intentionally avoided; the local stacks keep first paint deterministic.

## 4. Spacing & Layout

- Base unit: 4px.
- Tokens: `--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`,
  `--space-6: 24px`, `--space-8: 32px`.
- The viewer is a full-viewport shell. HUD clusters stay within a 16–32px safe area and never cross
  the central 52% of the viewport at 1280px and above.
- Breakpoints: 375px compact, 768px tablet, 1280px desktop, 1536px wide.
- The phone screen uses a portrait 0.468 aspect ratio and a 12-column internal grid with 8px gaps.

## 5. Components

### Viewer Control

- Structure: native `<button>` inside an edge HUD cluster.
- Variants: view, explode, reset, screen-power.
- States: default, hover, active/pressed, keyboard focus, selected (`aria-pressed`), disabled.
- Accessibility: native semantics, visible cyan focus ring, 44px minimum touch target, live status.
- Motion: beui.dev button mechanism adapted to CSS: press scale `0.94`, hover scale `1.02` only on
  hover-capable pointers, 140ms response; reduced motion uses color/opacity only.

### Screen App Tile

- Structure: native `<button>` with SVG icon, label, and independently addressable `data-app-id`.
- Variants: call, message, radio, camera.
- States: idle, focus, active, launched; selected state raises emission and updates the live region.
- Accessibility: sequential keyboard order, descriptive `aria-label`, no icon-only ambiguity.
- Motion: press scale `0.94`; launched state swaps border/emission without layout movement.

### Glass Panel

- Structure: semantic section with heading and body/content slot.
- Variants: weather, media, signal.
- States: idle and highlighted by a related app action.
- Depth: layered navy fill, inset cyan rim, top-edge sheen, and restrained glow.

### Phone Part

- Structure: named Three.js `Group` containing named mesh children and `userData.partId`.
- Variants: shell, rail, glass, control, port, repeated hardware, surface relief.
- States: default, hover-highlight, selected, exploded.
- Interaction: ray picking and explosion resolve through the same part manifest; relief marked
  `explodeWithParent` rides its owning part.

### Primitive Showcase

- `?showcase=1` renders viewer controls and screen app tiles in default, pressed/selected,
  disabled, and focusable states at mobile/tablet/desktop widths before the full product surface.

## 6. Motion & Interaction

| Token | Value | Usage |
|---|---|---|
| `--motion-micro` | `140ms` | Press, hover, focus |
| `--motion-standard` | `240ms` | Selection and screen state |
| `--motion-emphasis` | `520ms` | Explosion/reset |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Beui-derived interruption-safe response |

- Three.js owns orbit and explode transforms; CSS owns only opacity, filter, and transform.
- Drag-to-orbit begins only outside the live screen so tapping UI never rotates the model.
- Auto-rotation defaults off and remains off under `prefers-reduced-motion: reduce`.
- Reduced motion sets every CSS transform transition to zero and changes explode/reset immediately.

## 7. Depth & Surface

Strategy: mixed, tied to physical material evidence.

- Screen panels: 1px cyan/violet rim, inset highlight, navy tonal separation, small local glow.
- Viewer HUD: low-opacity navy glass with one restrained border; no broad generic card shadow.
- Phone: real PBR depth from beveled geometry, clearcoat, transmission, environment reflections,
  emissive practical lights, and a soft contact shadow.
- Bloom is selective and never allowed to blow out the metal/chassis silhouette.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- WCAG 2.2 AA target; body contrast 4.5:1, large text/UI boundaries 3:1.
- Every action is reachable by keyboard and has a visible focus indicator.
- Status changes use one polite live region; the canvas has a text alternative.
- Touch targets are at least 44 × 44 CSS pixels.
- `prefers-reduced-motion` and coarse pointers both receive explicit behavior.

### Personas

- Keyboard-only reviewer: can change camera, select parts, explode/reset, toggle power, and launch
  all four screen apps without pointer input.
- Touch user: can tap screen apps without accidentally orbiting the phone.
- Motion-sensitive reviewer: gets no auto-rotation or transform animation.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|---|---|---|---|
| Hidden rear/right exactness | 3D model | One source view contains no evidence | Replace inference when rear/right references arrive |
| Exact skyline illustration | Screen hero | Procedural live UI preserves interaction instead of baking pixels | Refine with licensed interactive artwork if exact art becomes required |
