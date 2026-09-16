import { writeFileSync } from "node:fs"
import { join } from "node:path"

const check = (checks, id, passed) => {
  checks.push({ id, passed })
  if (!passed) throw new Error(`Browser QA check failed: ${id}`)
}

const read = (page) =>
  page.locator("#navigation-status").evaluate((element) => JSON.parse(element.dataset.snapshot ?? "{}"))

const settle = async (page) => {
  await page.locator("[data-testid='settle']").click()
  return read(page)
}

const enterOverview = async (page) => {
  await page.locator("#enter-desktop").click()
  let snapshot = await read(page)
  if (snapshot.navigationState === "entering") snapshot = await settle(page)
  return snapshot
}

const focusByButton = async (page, device) => {
  await page.locator(`#focus-${device}`).click()
  let snapshot = await read(page)
  if (snapshot.navigationState.startsWith("focusing-")) snapshot = await settle(page)
  return snapshot
}

const exitDevice = async (page) => {
  await page.locator("#exit-device").click()
  let snapshot = await read(page)
  if (snapshot.navigationState === "returning") snapshot = await settle(page)
  return snapshot
}

const capture = async (page, captures, evidenceDir, name) => {
  const path = join(evidenceDir, "captures", `${name}.png`)
  await page.screenshot({ path })
  captures.push(`captures/${name}.png`)
}

const last = (values) => values[values.length - 1]
const count = (values, expected) => values.filter((value) => value === expected).length

export const run = async ({ page, baseUrl, evidenceDir }) => {
  const checks = []
  const captures = []
  await page.goto(`${baseUrl}/?qa-case=shell`, { waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()

  check(checks, "shell-native-semantics", await page.locator("#enter-desktop").evaluate((button) => button instanceof HTMLButtonElement && button.type === "button"))
  check(checks, "shell-live-region", await page.locator("#navigation-status").getAttribute("aria-live") === "polite")
  check(checks, "shell-focus-visible", await page.locator("#enter-desktop").evaluate((button) => {
    button.focus()
    return getComputedStyle(button).outlineStyle !== "none"
  }))
  await capture(page, captures, evidenceDir, "landing-1280")

  let snapshot = await enterOverview(page)
  check(checks, "enter-overview-ownership", snapshot.navigationState === "overview" && snapshot.activeAsset === "computer-main" && snapshot.focusedScreen === null)
  await capture(page, captures, evidenceDir, "overview-1280")

  const shellTargets = [
    ["phone", "#focus-phone"],
    ["computer", "#focus-computer"],
    ["other", "[data-testid='other-control']"],
  ]
  for (const [id, selector] of shellTargets) {
    const before = await read(page)
    const prevented = await page.locator(selector).evaluate((target) => {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "KeyZ", key: "z" })
      target.dispatchEvent(event)
      return event.defaultPrevented
    })
    snapshot = await read(page)
    check(checks, `kbd-shell-${id}`, !prevented && snapshot.phoneEvents.length === before.phoneEvents.length && snapshot.computerEvents.length === before.computerEvents.length && snapshot.lastKeyboardRoute === null)
  }

  snapshot = await focusByButton(page, "phone")
  check(checks, "focus-phone-button", snapshot.navigationState === "phone-focus" && snapshot.activeAsset === "phone-main")
  snapshot = await exitDevice(page)
  check(checks, "kbd-exit-phone", snapshot.navigationState === "overview" && snapshot.activeAsset === "computer-main" && snapshot.focusedScreen === null)
  snapshot = await focusByButton(page, "computer")
  check(checks, "focus-computer-button", snapshot.navigationState === "computer-focus" && snapshot.activeAsset === "computer-main")
  snapshot = await exitDevice(page)
  check(checks, "kbd-exit-computer", snapshot.navigationState === "overview" && snapshot.activeAsset === "computer-main")

  await page.locator("[data-testid='pick-phone']").click()
  snapshot = await read(page)
  if (snapshot.navigationState === "focusing-phone") snapshot = await settle(page)
  check(checks, "kbd-pick-phone", snapshot.navigationState === "phone-focus" && snapshot.activeAsset === "phone-main")
  await page.locator("[data-testid='pick-computer']").click()
  snapshot = await read(page)
  if (snapshot.navigationState === "focusing-computer") snapshot = await settle(page)
  check(checks, "pick-device-to-device-switch", snapshot.navigationState === "computer-focus" && snapshot.activeAsset === "computer-main")
  await exitDevice(page)
  await page.locator("[data-testid='pick-computer']").click()
  snapshot = await read(page)
  if (snapshot.navigationState === "focusing-computer") snapshot = await settle(page)
  check(checks, "kbd-pick-computer", snapshot.navigationState === "computer-focus" && snapshot.activeAsset === "computer-main")
  await exitDevice(page)

  const bodyKey = async (code) => {
    const prevented = await page.locator("#scene").evaluate((target, keyCode) => {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: keyCode, key: keyCode })
      target.dispatchEvent(event)
      return event.defaultPrevented
    }, code)
    return { prevented, snapshot: await read(page) }
  }
  let routed = await bodyKey("KeyO")
  check(checks, "kbd-body-overview", routed.prevented && last(routed.snapshot.computerEvents) === "down:KeyO" && routed.snapshot.lastKeyboardRoute?.assetId === "computer-main")
  await page.keyboard.up("KeyO")

  await focusByButton(page, "phone")
  routed = await bodyKey("KeyP")
  check(checks, "kbd-body-phone", routed.prevented && last(routed.snapshot.phoneEvents) === "down:KeyP" && routed.snapshot.lastKeyboardRoute?.assetId === "phone-main")
  await page.keyboard.up("KeyP")
  await exitDevice(page)
  await focusByButton(page, "computer")
  routed = await bodyKey("KeyC")
  check(checks, "kbd-body-computer", routed.prevented && last(routed.snapshot.computerEvents) === "down:KeyC" && routed.snapshot.lastKeyboardRoute?.assetId === "computer-main")
  await page.keyboard.up("KeyC")
  await exitDevice(page)

  await page.locator("#focus-phone").click()
  routed = await bodyKey("KeyL")
  check(checks, "kbd-body-locked", !routed.prevented && last(routed.snapshot.phoneEvents) !== "down:KeyL" && routed.snapshot.lastKeyboardRoute === null)
  await settle(page)

  for (const device of ["phone", "computer"]) {
    const currentState = (await read(page)).navigationState
    if (currentState !== `${device}-focus`) {
      if (currentState === "phone-focus" || currentState === "computer-focus") {
        await exitDevice(page)
      }
      await focusByButton(page, device)
    }
    await page.locator(`[data-testid='focus-screen-${device}']`).click()
    const selector = `[data-testid='screen-${device}']`
    const code = device === "phone" ? "KeyF" : "KeyG"
    const screenPrevented = await page.locator(selector).evaluate((target, keyCode) => {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: keyCode, key: keyCode })
      target.dispatchEvent(event)
      return event.defaultPrevented
    }, code)
    snapshot = await read(page)
    check(checks, `kbd-screen-${device}`, !screenPrevented && snapshot.lastKeyboardRoute?.assetId === `${device}-main` && snapshot.lastKeyboardRoute?.screenId === (device === "phone" ? "phone-primary" : "main"))

    const firstEscapePrevented = await page.locator(selector).evaluate((target) => {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "Escape", key: "Escape" })
      target.dispatchEvent(event)
      return event.defaultPrevented
    })
    snapshot = await read(page)
    check(checks, `kbd-escape1-${device}`, firstEscapePrevented && snapshot.navigationState === `${device}-focus` && snapshot.focusedScreen === null && snapshot.activeAsset === `${device}-main` && snapshot.controlsEnabled)
    const secondEscapePrevented = await page.locator("#scene").evaluate((target) => {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "Escape", key: "Escape" })
      target.dispatchEvent(event)
      return event.defaultPrevented
    })
    snapshot = await read(page)
    if (snapshot.navigationState === "returning") snapshot = await settle(page)
    check(checks, `kbd-escape2-${device}`, secondEscapePrevented && snapshot.navigationState === "overview" && snapshot.activeAsset === "computer-main" && snapshot.focusedScreen === null)
  }

  const noopEscapePrevented = await page.locator("#scene").evaluate((target) => {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "Escape", key: "Escape" })
    target.dispatchEvent(event)
    return event.defaultPrevented
  })
  snapshot = await read(page)
  check(checks, "kbd-escape-noop", noopEscapePrevented && snapshot.navigationState === "overview" && snapshot.activeAsset === "computer-main")

  await focusByButton(page, "phone")
  const repeatEscapePrevented = await page.locator("#scene").evaluate((target) => {
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Escape",
      key: "Escape",
      repeat: true,
    })
    target.dispatchEvent(event)
    return event.defaultPrevented
  })
  snapshot = await read(page)
  const repeatEscapeIgnored =
    !repeatEscapePrevented &&
    snapshot.navigationState === "phone-focus" &&
    snapshot.activeAsset === "phone-main"
  await page.locator("[data-testid='focus-screen-phone']").click()
  await page.locator("[data-testid='remove-phone']").click()
  snapshot = await read(page)
  check(checks, "kbd-removal-phone", snapshot.navigationState === "overview" && snapshot.activeAsset === "computer-main" && snapshot.focusedScreen === null && snapshot.controlsEnabled && last(snapshot.phoneEvents) === "release-all")

  const beforeRepeat = await read(page)
  const repeatResult = await page.locator("#scene").evaluate((target) => {
    const down = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "KeyR", key: "r" })
    const repeat = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "KeyR", key: "r", repeat: true })
    const unrelated = new KeyboardEvent("keyup", { bubbles: true, cancelable: true, code: "KeyU", key: "u" })
    const matching = new KeyboardEvent("keyup", { bubbles: true, cancelable: true, code: "KeyR", key: "r" })
    target.dispatchEvent(down)
    target.dispatchEvent(repeat)
    target.dispatchEvent(unrelated)
    target.dispatchEvent(matching)
    return [down.defaultPrevented, repeat.defaultPrevented, unrelated.defaultPrevented, matching.defaultPrevented]
  })
  snapshot = await read(page)
  check(checks, "kbd-repeat-keyup", repeatEscapeIgnored && JSON.stringify(repeatResult) === JSON.stringify([true, false, false, true]) && count(snapshot.computerEvents.slice(beforeRepeat.computerEvents.length), "down:KeyR") === 1 && count(snapshot.computerEvents.slice(beforeRepeat.computerEvents.length), "up:KeyR") === 1)

  for (const viewport of [
    { name: "overview-768", width: 768, height: 900 },
    { name: "overview-375", width: 375, height: 812 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await capture(page, captures, evidenceDir, viewport.name)
    check(checks, viewport.name, await page.locator("#navigation-status").isVisible())
  }
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.reload({ waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  snapshot = await enterOverview(page)
  check(checks, "reduced-motion-synchronous", snapshot.navigationState === "overview" && snapshot.activeAsset === "computer-main")
  check(checks, "reduced-motion-duration", await page.locator("#enter-desktop").evaluate((button) => Number.parseFloat(getComputedStyle(button).transitionDuration) <= 0.001))
  await capture(page, captures, evidenceDir, "overview-reduced-1280")

  writeFileSync(join(evidenceDir, "shell-observation.json"), `${JSON.stringify({ checks, finalSnapshot: snapshot }, null, 2)}\n`)
  return { checks, captures }
}
