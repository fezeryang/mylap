# Retro-Future Radio Design System

## 1. Atmosphere & Identity

The asset should feel like a pristine 2020s reinterpretation of a 1980s portable radio: pearl
paint, machined aluminium, dark optical glass, and selective cyan/violet/magenta instrument light.
Its signature is the panoramic live tuner: one long navy glass aperture that unifies analog meter,
frequency scale, spectrum, globe, station state, and stereo/on-air feedback while the surrounding
physical controls remain dense and tactile. The 3D object is the focal point; HUD chrome stays at
the viewport edges and never becomes a generic dashboard of nested cards.

The supplied `ratio.png` is the exact visible-view authority for silhouette, component hierarchy,
palette, material separation, and control density. Rear/right/underside views extrapolate only from
the physical design language documented in `analysis.md`.

## 2. Color

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Background deep | `--color-bg-deep` | `#030511` | Full viewport base |
| Background halo | `--color-bg-halo` | `#10143a` | Model-centred radial atmosphere |
| Surface glass | `--color-surface-glass` | `rgba(8, 12, 37, 0.76)` | HUD and screen glass |
| Surface raised | `--color-surface-raised` | `rgba(24, 28, 66, 0.86)` | Pressable controls |
| Border subtle | `--color-border-subtle` | `rgba(176, 184, 255, 0.2)` | HUD and display separators |
| Border focus | `--color-border-focus` | `#5eeeff` | Keyboard focus and active tuner |
| Text primary | `--color-text-primary` | `#e6e1f6` | Headings and key state |
| Text secondary | `--color-text-secondary` | `#aaa7ca` | Labels and metadata |
| Text muted | `--color-text-muted` | `#74769e` | Disabled and tertiary state |
| Cyan | `--color-cyan` | `#37e7ff` | Frequency cursor, stereo, focus |
| Blue | `--color-blue` | `#3974ff` | Scale and spectrum body |
| Violet | `--color-violet` | `#8d5cff` | Selection and cassette state |
| Magenta | `--color-magenta` | `#ff4fd8` | On-air, record, spectrum peaks |
| Danger | `--color-danger` | `#ff5b7d` | Record/destructive state only |
| Screen deep | `--screen-deep` | `#02041c` | Optical display background |
| Screen border | `--screen-border` | `#1d285b` | Tuner aperture inner rim |
| Cassette border | `--cassette-border` | `#25265e` | Cassette aperture inner rim |

Rules:

- Never use pure white; pearl/lavender is the highlight ceiling.
- Cyan, violet, and magenta communicate live state, focus, media energy, or a physical light source.
  They are not decorative panel borders.
- The live display may interpolate cyan → blue → violet → magenta for spectrum energy. Body text
  never uses a gradient.
- Three.js material colors mirror the same palette constants in `src/theme.ts`; no runtime source
  imports CSS or the reference image to discover color.

## 3. Typography

| Level | Token | Size | Weight | Line height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- | --- |
| Display | `--type-display` | `clamp(1.25rem, 2vw, 1.75rem)` | 650 | 1.05 | `0.06em` | Station title |
| Heading | `--type-heading` | `1rem` | 620 | 1.2 | `0.08em` | HUD titles |
| Body | `--type-body` | `0.875rem` | 450 | 1.5 | `0.01em` | Status and metadata |
| Label | `--type-label` | `0.75rem` | 600 | 1.3 | `0.11em` | Control labels |
| Micro | `--type-micro` | `0.75rem` | 520 | 1.2 | `0.06em` | Frequency ticks and compact state |

- Primary: `"Arial Narrow", "Roboto Condensed", "Helvetica Neue", sans-serif`.
- Instrument mono: `"IBM Plex Mono", "SFMono-Regular", Consolas, monospace`.
- Body/UI copy never falls below 12px. Use uppercase only for short instrument labels.
- CJK fallback remains in the system stack; controls avoid forced letter spacing when rendered in
  Chinese.

## 4. Spacing & Layout

All authored spacing intent derives from 4px:

| Token | Value | Usage |
| --- | --- | --- |
| `--space-1` | `4px` | Instrument ticks and inline gaps |
| `--space-2` | `8px` | Compact label/control spacing |
| `--space-3` | `12px` | Button padding and grouped state |
| `--space-4` | `16px` | HUD inner padding |
| `--space-6` | `24px` | HUD-to-viewport margin |
| `--space-8` | `32px` | Major HUD separation |

- Canvas and CSS3D layers fill the viewport. The model remains centred within a protected middle
  64% × 72% area at desktop widths.
- Left identity/status HUD and right interaction HUD pin to viewport edges. At 768px they become
  compact single-line rails; at 375px only task-critical controls remain and the lower rail owns
  horizontal scrolling without causing page overflow.
- Reference, front, right, rear, and left cameras use fixed deterministic transforms; camera reset
  returns to the reference three-quarter view.
- Live tuner content uses a 12-column internal grid: meter 2 columns, frequency scale 4, spectrum
  and status 6. Cassette status uses one centred stack over the physical reel window.

## 5. Components

### Instrument Button

- Structure: native `<button>` with label/icon span and optional state light.
- Variants: neutral, active-cyan, active-violet, record-magenta, compact.
- States: default, hover, active/pressed, keyboard focus, disabled, latched.
- Accessibility: minimum 36px pointer target in HUD, visible `:focus-visible`, `aria-pressed` for
  latching controls, text/`aria-label` for every icon.
- Motion: 110ms transform press travel and 140ms opacity/filter state change; reduced motion keeps
  colour and outline without transform.

### Instrument Range

- Structure: native labelled `<input type="range">` plus current numeric/output value.
- Variants: tuning, explosion, volume.
- States: default, focus, dragging, disabled.
- Accessibility: explicit label, keyboard arrows/PageUp/PageDown, textual value output.
- Motion: thumb transform/filter only; Three.js owns physical knob/slider movement.

### Live Tuner Surface

- Structure: semantic meter region, frequency table, spectrum bars, station/status region.
- Variants: powered, standby, off, buffering/error.
- States: FM/AM/SW band, frequency, signal, stereo, on-air, spectrum frame.
- Accessibility: the visually dense display is `aria-hidden`; a parallel concise `aria-live`
  status reports station, band, frequency, playback and errors.
- Motion: meter needle, cursor, and spectrum use transform/opacity only; reduced motion freezes the
  spectrum at current energy and shortens state fades to zero.

### Cassette Status Surface

- Structure: station/title, progress, auto-reverse/play state, two reel indicators.
- Variants: playing, paused, stopped, buffering/error.
- Accessibility: content duplicates no essential information unavailable in the HUD status.
- Motion: reel rotation maps to actual playback state/time; stopped/paused means no rotation.

### Viewer HUD

- Structure: `<header>` identity/status rail, `<aside>` controls, `<output aria-live>` feedback.
- Variants: standard, compact/tablet, mobile rail, primitive showcase.
- States: loading, ready, selected part, powered off, reduced motion.
- Accessibility: logical tab order, landmark labels, no pointer-only operation, status changes are
  concise and non-repeating.

### Part Selection Feedback

- Structure: selectable Three.js named group plus HUD title/meta output.
- States: rest, hover, selected, exploded.
- Motion: emissive/filter highlight and tiny scale cue; selection never changes authored geometry
  or blocks future media input.

The `?showcase=1` state harness renders the HUD primitives and each required state without hiding the
actual model, at 375, 768, and 1280px before product-screen QA.

## 6. Motion & Interaction

| Token | Duration | Easing | Usage |
| --- | --- | --- | --- |
| `--motion-micro` | `110ms` | `ease-out` | Button press and focus feedback |
| `--motion-state` | `180ms` | `cubic-bezier(0.22, 1, 0.36, 1)` | Power/media/selection state |
| `--motion-emphasis` | `420ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Camera reset and explosion |

- The interaction reference is the beui `range-slider`/press-feedback mechanism adapted to native
  controls: spatial movement is interruptible and tied to input; colour/filter transitions signal
  real state. No decorative hover motion.
- Three.js animates camera, physical sliders, tuning dial, cassette reels, dish scan, and exploded
  parts. CSS animates only transform, opacity, and filter.
- Autorotation defaults off. With `prefers-reduced-motion: reduce`, camera transitions snap,
  dish scan and decorative spectrum interpolation stop, and only direct input-driven transforms
  remain.

## 7. Depth & Surface

Strategy: **mixed physical depth**, specific to each ownership layer.

- Three.js depth comes from bevel geometry, real attachment overlap, PBR roughness separation,
  environment reflection, soft key/fill/rim lights, and a contact shadow plane.
- HUD glass uses one restrained tint + blur + one inner rim. It never stacks cards inside cards or
  uses broad generic drop shadows.
- Live screen glass is physical Three.js geometry; interactive content is a separate CSS3D layer.
  Screen UI never adds a fake outer bezel or screenshot background.
- CSS3D tuner and cassette surfaces match their physical apertures exactly in world units; the
  camera-facing gate hides them before side angles can expose the CSS layer above the bezel.
- Emission remains below clipping. Pearl shell and brushed aluminium must retain highlight detail
  under ACES tone mapping at exposure 1.08.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Target WCAG 2.2 AA: 4.5:1 body text, 3:1 large text and non-text focus indicators.
- Every HUD task is keyboard operable. Native buttons and ranges preserve their semantics.
- `aria-live="polite"` reports power, station, tuning, transport, error, selected part, and reset
  outcomes without streaming spectrum noise.
- Focus never moves into the decorative tuner DOM. Physical controls and display content are
  separate from screen-reader controls.
- All controls remain reachable at 375px without page-level horizontal scroll; the mobile control
  rail may scroll internally.
- Reduced motion is a first-class variant and is exercised in browser QA.

### Personas

- Keyboard-only visitor: can tune, play/pause/stop, change volume, toggle power, explode/reset, and
  inspect selected parts without pointer input.
- Motion-sensitive visitor: sees stable model framing and direct state changes with no autonomous
  camera or dish motion.
- Screen-reader visitor: receives concise media and selection state, not noisy visualizer updates.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
| --- | --- | --- | --- |
| Hidden-side geometry is inferred | rear/right/underside model parts | One reference image cannot evidence these regions | Replace only when additional views arrive |
| Demo transport is silent | `src/ui/demoAudioPlayer.ts` | Browser authoring surface proves adapter/state without bundling copyrighted audio | Inject a production `AudioPlayerAdapter` during later music integration |
