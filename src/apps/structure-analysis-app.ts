import type { ScreenAppDefinition, ScreenAppHandle } from "../runtime/screen-app"
import { STRUCTURE_ANALYSIS_APP_ID } from "./app-ids"
import { element, listen, svgElement } from "./dom"

const wireframe = (): SVGSVGElement => {
  const svg = svgElement("svg", {
    "aria-hidden": "true",
    class: "structure-wireframe",
    viewBox: "0 0 500 360",
  })
  svg.append(
    svgElement("path", {
      d: "M92 88 L300 52 L414 150 L204 196 Z M92 88 L98 260 L306 224 L414 150 L408 316 L306 224 L204 196 L210 352 L408 316",
      fill: "none",
    }),
    svgElement("path", {
      d: "M204 196 L300 52 M98 260 L210 352 M204 196 L306 224",
      fill: "none",
    }),
  )
  return svg
}

export const structureAnalysisApp: ScreenAppDefinition = {
  appId: STRUCTURE_ANALYSIS_APP_ID,
  mount: (host, context): ScreenAppHandle => {
    const root = element("section", "screen-app screen-app--structure")
    root.setAttribute("aria-label", "结构分析演示应用")
    const header = element("header", "wing-header")
    header.append(
      element("strong", "screen-brand", "STRUCTURE ANALYSIS"),
      element("span", "screen-chip", "LIVE"),
    )
    const viewport = element("section", "structure-viewport")
    viewport.append(wireframe())
    const channels = element("aside", "structure-channels")
    const fills: HTMLElement[] = []
    for (let index = 1; index <= 6; index += 1) {
      const channel = element("div", "channel-row")
      const fill = element("span", "channel-fill")
      channel.append(element("span", "channel-label", `CH ${index}`), fill)
      fills.push(fill)
      channels.append(channel)
    }
    const status = element("p", "structure-status", "SCAN MODE READY")
    const actions = element("nav", "structure-actions")
    actions.setAttribute("aria-label", "结构分析模式")
    const cleanups: (() => void)[] = []
    ;["SCAN", "ANALYZE", "SIMULATE", "DEPLOY"].forEach((label, index) => {
      const button = element("button", "screen-action", label)
      button.type = "button"
      button.setAttribute("aria-pressed", String(index === 0))
      cleanups.push(
        listen(button, "click", () => {
          actions.querySelectorAll("button").forEach((candidate) => {
            candidate.setAttribute("aria-pressed", "false")
          })
          button.setAttribute("aria-pressed", "true")
          status.textContent = `${label} MODE · ${context.assetInstanceId.value.toUpperCase()}`
        }),
      )
      actions.append(button)
    })
    const body = element("div", "structure-layout")
    body.append(viewport, channels)
    root.append(header, body, status, actions)
    host.append(root)

    return {
      dispose: () => {
        for (const cleanup of cleanups) cleanup()
      },
      setActive: (active) => {
        root.dataset["active"] = String(active)
      },
      update: (snapshot) => {
        fills.forEach((fill, index) => {
          fill.style.setProperty(
            "--channel-fill",
            `${35 + ((snapshot.drawCalls + index * 11) % 58)}%`,
          )
        })
      },
    }
  },
}
