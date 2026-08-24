import "./style.css"
import { createNeonCyberphoneModel } from "./model/createPhoneModel"
import { bindControls } from "./runtime/bindControls"
import { requireElement } from "./runtime/dom"
import { bindScreen } from "./ui/bindScreen"
import { attachScreenSurface } from "./ui/screenSurface"
import { createViewer } from "./viewer/createViewer"

const canvas = requireElement("webgl-canvas", HTMLCanvasElement)
const stage = requireElement("stage", HTMLElement)
const cssLayer = requireElement("css-layer", HTMLElement)
const screenElement = requireElement("phone-screen", HTMLElement)
const powerButton = requireElement("screen-power-control", HTMLButtonElement)
const status = requireElement("viewer-status", HTMLElement)

document.body.dataset["showcase"] =
  new URLSearchParams(window.location.search).get("showcase") === "1" ? "true" : "false"

const model = createNeonCyberphoneModel()
attachScreenSurface(model.screenAnchor, screenElement)
const screen = bindScreen(screenElement, powerButton, status)
const viewer = createViewer({
  canvas,
  cssLayer,
  screenElement,
  model,
  onPartSelected: (partId) => {
    status.textContent = partId === null ? "No phone part selected" : `${partId} selected`
  },
})
bindControls({ viewer, model, screen, status })

stage.dataset["ready"] = "true"
window.__interactive = false
window.__ready = false
window.__phone = { model, viewer, manifest: model.getManifest }
