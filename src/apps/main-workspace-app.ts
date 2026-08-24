import type { ScreenAppDefinition, ScreenAppHandle } from "../runtime/screen-app"
import { MAIN_WORKSPACE_APP_ID } from "./app-ids"
import { element, listen, svgElement } from "./dom"

const infinityMark = (): SVGSVGElement => {
  const svg = svgElement("svg", {
    "aria-hidden": "true",
    class: "workspace-infinity",
    viewBox: "0 0 640 360",
  })
  const path = svgElement("path", {
    d: "M90 180 C90 68 232 64 320 180 C408 296 550 292 550 180 C550 68 408 64 320 180 C232 296 90 292 90 180",
    fill: "none",
    pathLength: "1",
  })
  svg.append(path)
  return svg
}

export const mainWorkspaceApp: ScreenAppDefinition = {
  appId: MAIN_WORKSPACE_APP_ID,
  mount: (host, context): ScreenAppHandle => {
    const root = element("section", "screen-app screen-app--workspace")
    root.setAttribute("aria-label", "开发工作台演示应用")
    const toolbar = element("header", "workspace-toolbar")
    toolbar.append(
      element("strong", "screen-brand", "TODŌU IDE"),
      element("span", "workspace-menu", "FILE   EDIT   SCULPT   VIEW   RENDER"),
      element("span", "screen-chip", context.assetInstanceId.value.toUpperCase()),
    )

    const sidebar = element("aside", "workspace-sidebar")
    sidebar.append(element("strong", "screen-overline", "PROJECT"))
    ;[
      "src",
      "components",
      "models",
      "shaders",
      "utils",
      "assets",
      "main.ts",
      "infinity.ts",
    ].forEach((file, index) => {
      sidebar.append(element("span", index > 5 ? "file file--hot" : "file", `› ${file}`))
    })

    const viewport = element("section", "workspace-viewport")
    viewport.append(infinityMark(), element("p", "viewport-caption", "REAL-TIME ASSET GRAPH"))

    const inspector = element("aside", "workspace-inspector")
    ;["RENDER", "PREVIEW", "MATERIAL", "NODE GRAPH"].forEach((label, index) => {
      const panel = element("section", `screen-panel screen-panel--${index}`)
      panel.append(element("strong", "screen-overline", label), element("div", "panel-signal"))
      inspector.append(panel)
    })

    const terminal = element("section", "workspace-terminal")
    const terminalTitle = element("strong", "screen-overline", "TERMINAL")
    const output = element("p", "terminal-output", "scene.add(activeAsset) · render pipeline ready")
    const form = element("form", "terminal-form")
    const prompt = element("span", "terminal-prompt", ">")
    const input = element("input", "terminal-input")
    input.type = "text"
    input.autocomplete = "off"
    input.setAttribute("aria-label", "屏幕命令输入")
    input.placeholder = "输入命令或中文文本"
    form.append(prompt, input)
    terminal.append(terminalTitle, output, form)

    const metrics = element("footer", "workspace-metrics", "FPS -- · DRAW -- · TRI --")
    const layout = element("div", "workspace-layout")
    layout.append(sidebar, viewport, inspector, terminal)
    root.append(toolbar, layout, metrics)
    host.append(root)

    const stopSubmit = listen(form, "submit", (event) => {
      event.preventDefault()
      const value = input.value.trim()
      if (value.length === 0) return
      output.textContent = `> ${value}`
      input.value = ""
    })

    return {
      dispose: stopSubmit,
      setActive: (active) => {
        root.dataset["active"] = String(active)
      },
      update: (snapshot) => {
        metrics.textContent = `FPS ${snapshot.fps} · DRAW ${snapshot.drawCalls} · TRI ${snapshot.triangles}`
        viewport.dataset["part"] = snapshot.selectedPart
      },
    }
  },
}
