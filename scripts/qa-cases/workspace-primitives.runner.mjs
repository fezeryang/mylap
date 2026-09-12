import { writeFileSync } from "node:fs"
import { join } from "node:path"

const check = (checks, id, passed) => {
  checks.push({ id, passed })
  if (!passed) throw new Error(`Browser QA check failed: ${id}`)
}

const capture = async (page, captures, evidenceDir, id) => {
  const path = join(evidenceDir, "captures", `${id}.png`)
  await page.screenshot({ path })
  captures.push(`captures/${id}.png`)
}

export const run = async ({ page, baseUrl, evidenceDir }) => {
  const checks = []
  const captures = []
  await page.goto(`${baseUrl}/?qa-case=workspace-primitives`, { waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  const showcase = page.locator("[data-testid='workspace-showcase']")
  const menu = page.locator("[data-testid='device-menu']")
  const menuPanel = page.locator("[data-testid='device-menu-panel']")
  const expand = page.locator("[data-testid='expand-button']")
  const close = page.locator("[data-testid='close-button']")
  const expandedSurface = page.locator("[data-testid='expanded-surface']")
  const stateSurface = page.locator("[data-testid='software-state']")

  check(checks, "workspace-showcase-mounted", await showcase.isVisible())
  const tokenObservation = await showcase.evaluate((element) => {
    const styles = getComputedStyle(element)
    return {
      accent: styles.getPropertyValue("--workspace-accent").trim(),
      ink: styles.getPropertyValue("--workspace-ink").trim(),
      motion: styles.getPropertyValue("--workspace-motion-micro").trim(),
      stage: styles.getPropertyValue("--workspace-stage").trim(),
    }
  })
  check(
    checks,
    "workspace-tokens-rendered",
    Object.values(tokenObservation).every((value) => value.length > 0),
  )

  await page.setViewportSize({ width: 1280, height: 800 })
  check(checks, "computer-primitive-visible", await page.locator("[data-testid='computer-primitive']").isVisible())
  check(checks, "phone-primitive-visible", await page.locator("[data-testid='phone-primitive']").isVisible())
  const note = page.locator("#workspace-note")
  await note.fill("你好，输入法与焦点都保持原生可用。")
  check(checks, "ime-capable-native-input", (await note.inputValue()).startsWith("你好"))
  const touchTargets = await page.locator("button").evaluateAll((buttons) =>
    buttons.every((button) => {
      if (!button.checkVisibility()) return true
      const bounds = button.getBoundingClientRect()
      return bounds.width >= 44 && bounds.height >= 44
    }),
  )
  check(checks, "touch-targets-minimum-44px", touchTargets)
  const contrast = await menu.evaluate((button) => {
    const color = getComputedStyle(button).color.match(/\d+/g)?.map(Number)
    const background = getComputedStyle(button).backgroundColor.match(/\d+/g)?.map(Number)
    if (color?.length !== 3 || background?.length !== 3) return 0
    const luminance = (channels) => {
      const normalized = channels.map((channel) => channel / 255)
      const linear = normalized.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
    }
    const [lighter, darker] = [luminance(color), luminance(background)].sort((left, right) => right - left)
    return (lighter + 0.05) / (darker + 0.05)
  })
  check(checks, "menu-contrast-aa", contrast >= 4.5)
  await capture(page, captures, evidenceDir, "workspace-rest-1280")

  await menu.hover()
  await capture(page, captures, evidenceDir, "menu-tooltip-hover-start")
  await page.waitForTimeout(60)
  await capture(page, captures, evidenceDir, "menu-tooltip-hover-mid")
  await page.waitForTimeout(160)
  check(
    checks,
    "tooltip-visible-on-hover",
    await page.locator(".workspace-tooltip").evaluate((tooltip) => {
      const bounds = tooltip.getBoundingClientRect()
      return Number.parseFloat(getComputedStyle(tooltip).opacity) === 1 && bounds.bottom > 0 && bounds.right > 0
    }),
  )
  check(
    checks,
    "tooltip-cjk-rendered-without-overflow",
    await page.locator(".workspace-tooltip").evaluate((tooltip) => {
      const bounds = tooltip.getBoundingClientRect()
      return /[\u3400-\u9fff]/u.test(tooltip.textContent ?? "")
        && bounds.width > 0
        && bounds.height > 0
        && tooltip.scrollWidth <= tooltip.clientWidth
    }),
  )
  check(
    checks,
    "tooltip-does-not-occlude-back-control",
    await page.evaluate(() => {
      const tooltip = document.querySelector(".workspace-tooltip")
      const back = document.querySelector("[data-testid='back-button']")
      if (!(tooltip instanceof HTMLElement) || !(back instanceof HTMLElement)) return false
      const tooltipBounds = tooltip.getBoundingClientRect()
      const backBounds = back.getBoundingClientRect()
      return tooltipBounds.right <= backBounds.left
        || tooltipBounds.left >= backBounds.right
        || tooltipBounds.bottom <= backBounds.top
        || tooltipBounds.top >= backBounds.bottom
    }),
  )
  await capture(page, captures, evidenceDir, "menu-tooltip-hover-settled")
  await menu.focus()
  check(
    checks,
    "visible-keyboard-focus",
    await menu.evaluate((button) => Number.parseFloat(getComputedStyle(button).outlineWidth) >= 2),
  )
  await capture(page, captures, evidenceDir, "menu-focus")

  await menu.click()
  check(checks, "menu-open", (await menu.getAttribute("aria-expanded")) === "true" && await menuPanel.isVisible())
  await page.waitForTimeout(240)
  check(
    checks,
    "menu-open-tooltip-does-not-overlap-menu-items",
    await page.evaluate(() => {
      const tooltip = document.querySelector(".workspace-tooltip")
      const items = [...document.querySelectorAll(".workspace-menu-item")]
        .filter((item) => item instanceof HTMLElement && item.checkVisibility())
      if (!(tooltip instanceof HTMLElement) || items.length === 0) return false
      const tooltipStyle = getComputedStyle(tooltip)
      const tooltipBounds = tooltip.getBoundingClientRect()
      if (tooltipStyle.visibility === "hidden" || Number.parseFloat(tooltipStyle.opacity) === 0) return true
      return items.every((item) => {
        const itemBounds = item.getBoundingClientRect()
        return tooltipBounds.right <= itemBounds.left
          || tooltipBounds.left >= itemBounds.right
          || tooltipBounds.bottom <= itemBounds.top
          || tooltipBounds.top >= itemBounds.bottom
      })
    }),
  )
  await capture(page, captures, evidenceDir, "menu-open")
  await menu.click()
  check(checks, "menu-close", (await menu.getAttribute("aria-expanded")) === "false" && await menuPanel.isHidden())

  const primary = page.getByRole("button", { name: "Open radio" })
  const primaryBounds = await primary.boundingBox()
  if (primaryBounds === null) throw new Error("Primary control bounds are missing")
  await page.mouse.move(primaryBounds.x + primaryBounds.width / 2, primaryBounds.y + primaryBounds.height / 2)
  await page.mouse.down()
  await capture(page, captures, evidenceDir, "primary-pressed")
  await page.mouse.up()
  check(checks, "back-control-native", await page.locator("[data-testid='back-button']").isVisible())

  for (const state of ["loading", "empty", "error"]) {
    await page.locator(`[data-state-choice='${state}']`).click()
    check(checks, `software-${state}-state`, (await stateSurface.getAttribute("data-state")) === state)
    await capture(page, captures, evidenceDir, `software-${state}`)
  }

  await expand.click()
  check(checks, "expanded-surface-open", await expandedSurface.isVisible())
  check(checks, "expanded-surface-focus-transfer", await close.evaluate((button) => document.activeElement === button))
  await capture(page, captures, evidenceDir, "expanded-open")
  await close.click()
  check(checks, "expanded-surface-close", await expandedSurface.isHidden())
  check(checks, "expanded-surface-focus-return", await expand.evaluate((button) => document.activeElement === button))

  for (const viewport of [
    { height: 812, id: "375", width: 375 },
    { height: 1024, id: "768", width: 768 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    check(checks, `viewport-${viewport.id}-no-horizontal-overflow`, noOverflow)
    await capture(page, captures, evidenceDir, `workspace-${viewport.id}`)
  }

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => { document.documentElement.style.zoom = "2" })
  check(
    checks,
    "zoom-200-no-horizontal-overflow",
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  )
  await capture(page, captures, evidenceDir, "workspace-200-zoom")
  await page.evaluate(() => { document.documentElement.style.zoom = "" })

  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.reload({ waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  check(
    checks,
    "reduced-motion-settles",
    await page.locator("[data-testid='workspace-showcase']").evaluate(
      (element) => Number.parseFloat(getComputedStyle(element).getPropertyValue("--workspace-motion-micro")) <= 0.01,
    ),
  )
  await page.locator("[data-testid='device-menu']").focus()
  await capture(page, captures, evidenceDir, "workspace-reduced-motion")

  writeFileSync(
    join(evidenceDir, "workspace-primitives-observation.json"),
    `${JSON.stringify({ checks, contrast, tokenObservation }, null, 2)}\n`,
  )
  return { checks, captures }
}
