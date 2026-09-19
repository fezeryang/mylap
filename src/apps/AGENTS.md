# Root Screen Applications

## Scope

This directory owns independently mountable DOM applications displayed on root-runtime screen
surfaces. Apps are replaceable UI modules; physical screens, CSS3D placement, focus ownership,
power, and asset lifecycle remain in `src/runtime/`.

The root desktop is the canonical consumer of these apps. A screen app that looks correct in a
local DOM test still needs root browser inspection when its screen is mounted on the cyberdeck,
phone, or radio.

## Where to Look

| Concern | Location |
| --- | --- |
| App IDs | `app-ids.ts` |
| DOM/SVG creation and listener cleanup | `dom.ts` |
| Built-in app definitions | `*-app.ts` |
| Default registry composition | `register-default-apps.ts` |
| Lifecycle contracts | `../runtime/screen-app.ts`, `../runtime/screen-session.ts` |

## Lifecycle Contract

- Export a `ScreenAppDefinition` with a stable `ScreenAppId`; registration rejects duplicates.
- `mount(host, context)` builds one app tree, appends it through `host`, and returns a complete
  `ScreenAppHandle`. Do not query or replace the runtime's screen container directly.
- A session calls `setActive` immediately after mounting and whenever active-asset ownership
  changes. Treat it as presentation/input state, not as mount or power state.
- `update(snapshot)` may run every render while the screen is powered. Keep it bounded, avoid DOM
  reconstruction, network requests, and listener registration in the render path.
- `dispose()` runs before an installed app is replaced and when its screen session is removed.
  Remove every listener, observer, timer, subscription, and abortable request owned by the app.
- The runtime clears host children after disposal; apps still own cleanup for resources that DOM
  removal cannot release.

## State and Host Boundaries

- Keep ephemeral controls, form values, selected tabs, and derived presentation state inside the
  mounted handle. Use `context.assetInstanceId` and `context.screenId` when state must be keyed per
  asset instance or screen session.
- Request activation and screen focus through the context callbacks. Do not manipulate the stage,
  orbit controls, CSS3D layer, camera, or global focus ownership.
- `StageSnapshot` is read-only render/status input: active asset label, selected part, FPS, draw
  calls, and triangle count. It is not a general stage query, persistence model, event bus, or
  cross-device state snapshot.
- Shared or durable state belongs behind host-owned services. Future media, AI, messaging,
  persistence, and cross-device features must enter through narrow typed request/event/snapshot
  interfaces with explicit ownership, cancellation, errors, and subscription cleanup.
- Do not import from `src/model/`, `src/viewer/`, standalone asset viewers, or another app's
  internals. Depend on runtime contracts and app-local helpers only.

## DOM and Accessibility

- Build real semantic DOM: native buttons, forms, inputs, headings, regions, and navigation before
  adding ARIA. Decorative SVG and animation remain hidden from assistive technology.
- Give each app root an accessible label. Preserve keyboard use, visible focus, IME input, status
  text, and accurate `aria-pressed` or other state attributes through every interaction.
- Use `textContent` for dynamic text. Avoid raw HTML injection and avoid screenshot textures for
  interactive content.
- Use `listen` or an equivalent cleanup-returning helper for events; retain and invoke every
  cleanup from `dispose`.

## Tests and QA

- Add Bun tests beside the runtime contract when changing mount, replacement, activation, power,
  update, registry, or disposal semantics; app-specific state logic should have focused tests.
- Run `pnpm run verify:root` after source changes.
- Visible or interactive changes also require root browser QA and inspected renders. Verify pointer
  and keyboard operation, focus ownership and Escape release, activation, power gating, app
  replacement, repeated disposal, supported viewports, reduced motion, and console/page errors.
- When an app is attached to a physical device screen, verify its projection while the root camera
  orbits the assembled deck; do not validate only an expanded or standalone DOM view.
