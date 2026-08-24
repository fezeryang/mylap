# TODŌU Cyberdeck Viewer Design System

## 0. Research Log

- Embedded reference: `laptop.png` is the sole pixel contract; its pearl-white armor, navy displays, cyan/violet/magenta practical lights, chamfer rhythm, and technical typography define the viewer.
- `$img2threejs`: supplied the procedural reconstruction, PBR, hierarchy, interaction, and evidence gates.
- Frontend references: image-to-code discipline plus design-system architecture; no extra brand reference is used because the supplied object already contains a complete visual language.
- Skipped lanes: generated mockups and web research, because they would introduce visual drift from the user-provided reference.

## 1. Atmosphere & Identity

A dark studio inspection bay built around one luminous, pearl-armored cyberdeck. The signature is a three-color energy rail: cyan transitions through electric violet into magenta, reflected softly across white alloy edges and midnight-blue glass. Interface chrome stays sparse so the 3D artifact is always the focal point.

## 2. Color

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Studio black | `--studio-0` | `#03040a` | Viewport boundary and page background |
| Studio violet | `--studio-1` | `#141329` | Ambient gradient and panels |
| Glass navy | `--glass-0` | `#07102b` | HUD and technical screen surfaces |
| Glass blue | `--glass-1` | `#14214a` | Elevated control surface |
| Pearl shell | `--pearl-0` | `#ddd9ee` | Primary light text and object echo |
| Pearl highlight | `--pearl-1` | `#f4f2ff` | High-emphasis text and focus rims |
| Muted lavender | `--lavender-0` | `#9799de` | Secondary text and borders |
| Deep violet | `--violet-0` | `#7657ff` | Primary interaction and middle emission |
| Cyan | `--cyan-0` | `#34d9ff` | Selected states and cool emission |
| Magenta | `--magenta-0` | `#ff55ca` | Warm emission and active accents |
| Success | `--success-0` | `#55f2bc` | Ready/render status |
| Warning | `--warning-0` | `#ffc76d` | Approximation status |

Rules:

- Accent colors are reserved for active controls, selection, model emission, and focus.
- Text uses pearl or lavender; never pure white.
- Surfaces derive depth from tonal shift, a fine border, and controlled glow rather than broad drop shadows.

## 3. Typography

| Level | Size | Weight | Line Height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| Title | `1rem` | 700 | 1.2 | `0.08em` | Viewer title |
| Body | `0.875rem` | 450 | 1.5 | `0` | Controls and descriptions |
| Small | `0.75rem` | 500 | 1.4 | `0.02em` | Status and part metadata |
| Overline | `0.6875rem` | 700 | 1.3 | `0.12em` | Section labels |

- Primary and mono: `"IBM Plex Mono", "SFMono-Regular", Consolas, monospace`.
- The viewer uses one technical family; hierarchy comes from weight, tracking, and color.
- Body copy never drops below 12px because this is a compact inspection surface rather than a reading page.

## 4. Spacing & Layout

Base unit: 4px.

| Token | Value | Usage |
| --- | --- | --- |
| `--space-1` | `4px` | Inline micro gap |
| `--space-2` | `8px` | Compact control gap |
| `--space-3` | `12px` | Control padding |
| `--space-4` | `16px` | HUD panel padding |
| `--space-6` | `24px` | Viewport edge gutter |
| `--space-8` | `32px` | Mobile vertical separation |

Screen application geometry:

| Surface | Logical Pixels | World Size | Default Application |
| --- | --- | --- | --- |
| Main display | `1280 × 720` | `9.28 × 5.30` | Development workspace |
| Left wing | `800 × 560` | `3.35 × 2.38` | System telemetry |
| Right wing | `800 × 560` | `3.35 × 2.38` | Structure analysis |

- The WebGL canvas fills the viewport.
- Desktop: a top-left identity block, top-right status block, and bottom-centered control dock float over the stage.
- Mobile/tablet: panels remain at edges and the dock wraps without covering the model center.
- Breakpoints: 640px, 768px, 1024px, 1280px.

## 5. Components

### HUD Panel

- Structure: semantic `section` with overline, primary text, and optional metadata rows.
- Variants: identity, status, part inspector.
- Spacing: `--space-2`, `--space-3`, `--space-4`.
- States: default; hidden when no selection; selected part content; warning status.
- Accessibility: landmark label and high-contrast text.
- Motion: opacity and translate only, standard timing.
- Layout: vertical stack with tonal glass surface.

### Control Button

- Structure: native `button`, optional inline SVG, label.
- Variants: neutral, active cyan, active magenta.
- Spacing: `--space-2` and `--space-3`.
- States: default, hover, active, focus-visible, disabled.
- Accessibility: native keyboard behavior, visible two-color focus ring, `aria-pressed` for toggles.
- Motion: 120ms transform, opacity, filter.
- Layout: cluster inside the control dock.

### Control Dock

- Structure: `nav` containing grouped control buttons and a compact range control.
- Variants: wide horizontal, wrapped compact.
- States: default; keyboard focus within; reduced-motion compliant.
- Accessibility: descriptive label; every control has an explicit accessible name.
- Motion: 420ms entry transform/opacity; no layout animation.
- Layout: centered cluster with one glass surface, not nested cards.

### Loading Surface

- Structure: live status label plus a thin progress rail.
- States: loading, ready, error.
- Accessibility: `aria-live="polite"`, textual state independent of color.
- Motion: opacity and transform; progress shimmer disabled under reduced motion.

### Screen Application Host

- Structure: one focusable DOM application root per physical display, mounted through the screen runtime rather than model geometry code.
- Variants: main workspace, telemetry, structure analysis, standby.
- States: inactive asset, active asset, focused screen, occluded/back-facing, powered off.
- Accessibility: labelled application region, native focus order and form controls, native `input` and composition events for IME.
- Motion: focus and power transitions use opacity/filter only; spatial tracking comes from CSS3D camera transforms.
- Layout: fixed logical pixels scaled to the authored world dimensions; internal UI uses proportional grid/flex layout.

### Active Asset Feedback

- Structure: stage status text and a cool rim on the active model's visible screen hosts.
- States: inactive, active, active with a focused screen, active with held physical keys.
- Accessibility: active instance and held-key state are mirrored in polite textual status, not conveyed by glow alone.
- Motion: standard opacity/filter transition; switching assets immediately releases held keys.

### Physical Key Feedback

- Structure: independent keycap transform and per-key material state; shared material mutation is prohibited.
- States: rest, pressed, returning, reduced-motion pressed/rest.
- Accessibility: physical keyboard events are never globally prevented; focused DOM controls retain native shortcuts and IME behavior.
- Motion: interruptible render-loop damping derived from the beui button press mechanism; `0.075` world-unit travel with cyan-violet emission while held.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Micro | 120ms | `ease-out` | Button press and focus response |
| Standard | 240ms | `ease-in-out` | Inspector changes |
| Emphasis | 420ms | `cubic-bezier(0.16, 1, 0.3, 1)` | HUD entry and explode transition |

- Orbit drag, wheel zoom, click-to-select, reset-view, screen-power, autorotate, and explosion scale are real model interactions.
- Clicking a model or one of its screens makes that instance the active asset. Only the active asset receives physical-key feedback.
- Screen focus pauses orbit controls. `Escape` or a pointer press outside all screen hosts releases screen focus and restores orbit controls.
- Key down retargets the keycap toward its pressed position; key up, blur, page hiding, or asset switching retargets it to rest without queued animation.
- CSS3D screen hosts remain mounted while powered off so application state survives standby; visibility and pointer interaction are disabled until power returns.
- Explosion changes part transforms through animation state; CSS only animates UI `transform`, `opacity`, and `filter`.
- `prefers-reduced-motion` disables UI entry motion and autorotation defaults.

## 7. Depth & Surface

Strategy: mixed tonal shift, thin borders, and restrained glow.

- HUD surface: navy-black tint, 12px backdrop blur, inner cool highlight, 1px lavender-blue border.
- Selected state: cyan outer glow with violet inner border.
- Control active state: cyan-to-violet or violet-to-magenta fill derived from the object's light rails.
- No large generic card shadows. The 3D scene supplies the dominant depth, bloom, and contact shadow.

## 8. Accessibility Constraints & Accepted Debt

Constraints:

- WCAG 2.2 AA for HTML controls and HUD text.
- Every model operation is available through labeled native controls; direct 3D picking is additive.
- Full keyboard reachability, `focus-visible`, reduced-motion handling, and readable status text.
- Canvas has a meaningful accessible label; detailed part selection is mirrored in the part inspector.
- Each CSS3D screen is a labelled focusable region. Interactive demo content uses native buttons and inputs, and screen focus always has an `Escape` recovery path.
- At 200% browser zoom the outer HUD remains usable, but pixel-perfect alignment of CSS3D content is supported only at 100% zoom because Three.js CSS3DRenderer assumes that scale.

Accepted debt:

| Item | Location | Why accepted | Owner / Exit |
| --- | --- | --- | --- |
| 3D part picking is not spatially described to screen readers | WebGL canvas | The named part inspector and controls expose the useful state; spatial narration requires a dedicated accessibility model | Add a hierarchical part tree if the viewer becomes a production configurator |
| CSS3D and WebGL do not share a pixel depth buffer | Three screen surfaces | Whole-screen facing and center-ray occlusion prevent common bleed-through while WebGL geometry retains each bezel | Replace with a texture compositor if per-pixel interleaving becomes mandatory |
| CSS3D alignment is calibrated for 100% browser zoom | Three screen surfaces | CSS3DRenderer documents this limitation; native zoom remains usable but may shift subpixels | Add zoom compensation if non-100% fidelity becomes a product requirement |
