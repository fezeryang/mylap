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
| Desktop entry | 1600ms | cubic-in-out | Landing camera flight to the shared desk overview |
| Device focus | 650ms | cubic-in-out | Overview to phone or computer focus |
| Device return | 650ms | cubic-in-out | Phone or computer focus back to overview |

Desktop navigation is a closed host-owned state machine:
`landing → entering → overview → focusing-phone | focusing-computer → phone-focus |
computer-focus → returning → overview`. New requests supersede an in-flight camera transition from
its current interpolated pose; requests for an already stable destination are idempotent. Orbit
controls and routed physical input are locked only while a transition is active and restored once
when the newest request settles or navigation is disposed. The existing viewer render update is the
only animation clock; navigation must not create a timer or another animation-frame loop.

| Navigation pose | Camera position | Camera target |
| --- | --- | --- |
| Landing | `[0, 10.5, -20]` | `[0, 0.5, 0]` |
| Overview | `[-6.8, 6.4, -10.5]` | `[0, 0.5, 0]` |
| Phone focus | `[-3.1, 1.71, -2.19]` | `[-3, 0.15, 0]` |
| Computer focus | `[0, 4.03, -5.87]` | `[0, 0.8, 0]` |

Reduced motion settles each navigation request synchronously at its exact destination pose without
entering a locked transition state. This novel fixed-duration camera mechanism is deliberately not
a gesture spring: deterministic framing and cancellable retargeting are the interaction contract.

### Navigation legibility floor

At a native 1:1 1280×900 capture, a focused screen application's 12px logical body line or
interactive control box must project to at least 14 CSS pixels in its rendered box. This preserves
the system's 12px logical minimum without allowing perspective projection to minify the smallest
interactive text below its intended readable scale.

The same focused phone frame keeps its physical screen inside the 1280×900 viewport and disjoint
from the control dock, so legible screen content remains reachable rather than being obscured by
the HUD.

The interaction hint is a HUD primitive, not scene text: it always
uses an opaque navy-glass backing and must retain at least 4.5:1 effective contrast over the
brightest settled scene region at 1280px, 1024px, and reduced motion. Landing body copy uses a
balanced measure; its final line must never contain only one word.

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

## 9. Light Workspace Stage Contract (Todo16, isolated showcase)

This contract locks the next product-stage language without activating it in the production viewer.
`src/workspace-theme.css` is imported only by the component QA route in Todo16. The current root
shell and cyberdeck hardware remain governed by Sections 1–8 until a later shell task explicitly
adopts this contract.

### Atmosphere and hierarchy

The product stage is a warm white-to-pale-gray field with a single soft pool of light behind the
hardware. Hardware is the focal object; chrome is intentionally second. There is no persistent
telemetry, console, or HUD in the overview. One compact Menu entry provides semantic device
navigation, and Back appears only in a contextual focus state. Software is quiet, editorial, and
purposeful; it is not a macOS or iOS imitation.

### Workspace tokens

| Family | Token | Value | Purpose |
| --- | --- | --- | --- |
| Stage | `--workspace-stage` | `#f3f4f6` | Pale-gray product field |
| Stage | `--workspace-stage-light` | `#fafafb` | Soft central light |
| Stage | `--workspace-stage-warm` | `#f5ede3` | Warm neutral WebGL/page backdrop |
| Stage | `--workspace-stage-warm-light` | `#fffaf4` | Warm central light pool |
| Surface | `--workspace-surface` | `#ffffff` | Elevated software/sheet surface only |
| Surface | `--workspace-surface-muted` | `#e9ecf0` | Quiet recessed region |
| Ink | `--workspace-ink` | `#1c2734` | Headings and interactive text |
| Ink | `--workspace-ink-muted` | `#536273` | Supporting text; AA on pale surfaces |
| Accent | `--workspace-accent` | `#285f9f` | Focus, selected, and primary action |
| Accent | `--workspace-accent-pressed` | `#1d4777` | Pressed action state |
| Feedback | `--workspace-success` | `#17734d` | Concise ready/live state |
| Feedback | `--workspace-danger` | `#a23b3b` | Recoverable error state |
| Line | `--workspace-line` | `#c7cdd5` | Fine divisions and control borders |
| Spacing | `--workspace-space-1` … `--workspace-space-8` | `4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px` | Four-pixel rhythm |
| Radius | `--workspace-radius-control`, `--workspace-radius-surface`, `--workspace-radius-sheet` | `10px, 18px, 28px` | Control, card, and expanded sheet corners |
| Elevation | `--workspace-shadow-control`, `--workspace-shadow-surface`, `--workspace-shadow-sheet` | restrained blue-gray shadow recipes | Contact depth without glassy excess |
| Type | `--workspace-type-body`, `--workspace-type-label`, `--workspace-type-title` | `14px, 12px, 28px` minimum/label/display | Calm readable hierarchy; body is never below 12px |
| Motion | `--workspace-motion-micro`, `--workspace-motion-standard`, `--workspace-motion-emphasis` | `120ms, 200ms, 320ms` | Feedback, state, and surface transitions |

The workspace uses system sans text with a compact mono label face. Primary text is `--workspace-ink`;
pure white is never used as page body text. Every visual declaration in the theme consumes the token
layer above, including spacing, radius, elevation, type, borders, and motion.

#### Implementation token authority

The following implementation tokens are part of the same Todo16 authority. Their raw values are
deliberate contract values, not local CSS exceptions.

| Family | Token | Value | Purpose |
| --- | --- | --- | --- |
| Accent | `--workspace-focus` | `#164f91` | Visible keyboard focus ring |
| Surface | `--workspace-transparent` | `transparent` | Gradient stop with no fill |
| Overlay | `--workspace-scrim` | `rgb(28 39 52 / 34%)` | Expanded-surface backdrop |
| Geometry | `--workspace-border-width` | `1px` | Fine control and surface borders |
| Geometry | `--workspace-focus-width` | `3px` | Focus-ring outline width |
| Layer | `--workspace-layer-control` | `10` | Header and control stacking |
| Layer | `--workspace-layer-tooltip` | `20` | Tooltip stacking above controls |
| Interaction | `--workspace-touch-target` | `44px` | Minimum native control target |
| Layout | `--workspace-content-width` | `1120px` | Showcase content measure |
| Layout | `--workspace-stage-height` | `280px` | Product-stage proportion |
| Elevation | `--workspace-shadow-control` | `0 1px 2px rgb(28 39 52 / 12%)` | Compact-control contact shadow |
| Elevation | `--workspace-shadow-surface` | `0 12px 30px rgb(28 39 52 / 10%)` | Card and stage elevation |
| Elevation | `--workspace-shadow-sheet` | `0 24px 56px rgb(28 39 52 / 18%)` | Expanded-sheet elevation |
| Type | `--workspace-type-family` | `Inter, ui-sans-serif, system-ui, sans-serif` | Primary system sans stack |
| Type | `--workspace-type-mono` | `"IBM Plex Mono", "SFMono-Regular", Consolas, monospace` | Compact technical labels |
| Type | `--workspace-line-body` | `1.5` | Body line height |
| Type | `--workspace-line-title` | `1.15` | Display line height |
| Type | `--workspace-track-label` | `0.12em` | Mono overline tracking |
| Motion | `--workspace-motion-reduced` | `0.01ms` | Immediate reduced-motion settling |
| Motion | `--workspace-ease` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | Shared state-transition easing |
| Stage | `--workspace-stage-glow` | `52%` | Radial light falloff |
| Stage | `--workspace-stage-glow-size` | `44%` | Radial light origin |
| Layout | `--workspace-grid-gap` | `var(--workspace-space-5)` | Primitive-grid rhythm |

The spacing sequence names each token explicitly: `--workspace-space-1`, `--workspace-space-2`,
`--workspace-space-3`, `--workspace-space-4`, `--workspace-space-5`, `--workspace-space-6`,
`--workspace-space-7`, and `--workspace-space-8`; their exact values are listed above. The authority
includes every `--workspace-*` declaration in `src/workspace-theme.css`, including
focus/scrim values, border and focus widths, stage proportions and glow geometry, line-height and
tracking values, reduced-motion duration, easing, shadow recipes, layer levels, and responsive grid
geometry.

### Primitives and state grammar

| Primitive | Anatomy | Required states |
| --- | --- | --- |
| Contextual tooltip | delayed label adjacent to a compact icon/menu control | hidden, hover, keyboard focus, reduced-motion immediate |
| Compact Menu / Back | 44px native button, text label, visible focus ring | rest, hover, focus-visible, pressed, open/close, disabled where relevant |
| Expanded surface | labelled native dialog surface, one sheet and an explicit close action | closed, opening, open, closing, reduced-motion settled |
| Computer software | concise app bar, content panel, labelled editable field, expand action | rest, hover, focus, pressed, loading, empty, error |
| Phone software | compact home surface, readable status and one primary action | rest, hover, focus, pressed, loading, empty, error |
| State surface | textual live result and state controls | ready, loading, empty, error |

Tooltip delay is contextual, never instructional clutter. The expanded surface preserves a single
clear return path; Todo16 only demonstrates it in isolation and does not claim live-session movement.

### Responsive, input, and motion rules

- At 375×812, cards stack, controls retain at least 44×44 CSS pixels, and no horizontal scrolling is
  introduced. At 768×1024, software primitives use two columns. At 1280×800, the stage and
  primitives breathe in a restrained two-column layout.
- At 200% zoom, all content reflows within the viewport; labels, textarea, and close action remain
  reachable with no clipped text.
- Every action is a native button or form control with a visible `:focus-visible` ring. The Computer
  textarea retains native keyboard, composition, and IME behavior. Dialog open moves focus to Close;
  Close restores it to Expand.
- Only `transform`, `opacity`, and `filter` animate. Hover and pressed feedback have an interaction
  purpose. `prefers-reduced-motion: reduce` settles tooltip and expanded-surface transitions
  immediately, without removing any state or control.

### Persona matrix

| Persona | Showcase proof |
| --- | --- |
| Direct explorer | Menu, tooltip, Back, and Expand communicate the available path without a fixed HUD |
| Keyboard navigator | Native focus, Menu open/close, dialog focus transfer, Close return, and editable textarea work without pointer input |
| Motion-sensitive user | Reduced-motion media query removes transitional travel while preserving open and close states |
| Low-vision / zoom user | AA foreground/background pairings, 44px controls, reflow at 375px and 200% zoom, no clipped sheet |
| IME user | The labelled native textarea accepts composition rather than intercepting keystrokes |

### Immutable hardware annex

The Todo16 stylesheet may not target or alter `src/model/**`, `phone/src/model/**`,
`ratio/src/model/**`, `desk/src/**`, `src/assets/**`, renderer tone mapping, authored lights,
materials, geometry, placements, screen anchors, or stable asset IDs. The hardware PIN remains the
pre-edit capture/fingerprint set at
`.omo/evidence/personal-3d-device-desktop-20260827-a1/scope-upgrade-discovery/hardware-pin-clean/`;
the generated fingerprint is
`9cad875df56a52779bd595bbf7aaf001d74411f5050a172d5b9079a990c5c59b`.
