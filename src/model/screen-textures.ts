import type { MeshBasicMaterial } from "three"
import {
  createTextureMaterial,
  drawGrid,
  drawLabel,
  drawPanel,
  screenCanvas,
  screenPalette,
} from "./screen-canvas"

export { createLeftScreenMaterial, createRightScreenMaterial } from "./wing-screen-textures"

const drawInfinity = (context: CanvasRenderingContext2D): void => {
  const gradient = context.createLinearGradient(250, 150, 700, 430)
  gradient.addColorStop(0, screenPalette.cyan)
  gradient.addColorStop(0.48, "#8d73ff")
  gradient.addColorStop(0.72, screenPalette.magenta)
  gradient.addColorStop(1, "#44d7ff")
  context.save()
  context.strokeStyle = gradient
  context.lineCap = "round"
  context.lineJoin = "round"
  context.shadowBlur = 32
  context.shadowColor = screenPalette.violet
  context.lineWidth = 62
  context.beginPath()
  context.moveTo(274, 264)
  context.bezierCurveTo(274, 120, 470, 122, 570, 270)
  context.bezierCurveTo(672, 418, 835, 395, 835, 265)
  context.bezierCurveTo(835, 130, 656, 122, 563, 268)
  context.bezierCurveTo(460, 416, 274, 405, 274, 264)
  context.stroke()
  context.lineWidth = 2
  context.shadowBlur = 0
  context.strokeStyle = "rgba(238, 246, 255, .74)"
  for (let offset = -22; offset <= 22; offset += 11) {
    context.beginPath()
    context.moveTo(274, 264 + offset)
    context.bezierCurveTo(274, 120 + offset, 470, 122 + offset, 570, 270 + offset)
    context.bezierCurveTo(672, 418 + offset, 835, 395 + offset, 835, 265 + offset)
    context.stroke()
  }
  context.restore()
}

export const createMainScreenMaterial = (): MeshBasicMaterial => {
  const { canvas, context } = screenCanvas(1280, 720)
  drawGrid(context, canvas.width, canvas.height, 30)
  context.fillStyle = "#0a1537"
  context.fillRect(0, 0, 190, 720)
  context.fillRect(985, 0, 295, 720)
  context.fillStyle = "#111e46"
  context.fillRect(0, 0, 1280, 42)
  drawLabel(context, "FILE   EDIT   SCULPT   VIEW   RENDER", 24, 27, "#b9cfff", 14)
  drawLabel(context, "PROJECT", 18, 72, "#e9ecff", 13)
  const files = [
    "src",
    "components",
    "models",
    "shaders",
    "utils",
    "assets",
    "main.tsx",
    "infinity.ts",
  ]
  files.forEach((file, index) => {
    drawLabel(
      context,
      `${index < 6 ? "▸" : "◆"}  ${file}`,
      26,
      105 + index * 30,
      index > 5 ? screenPalette.magenta : "#70baff",
      13,
    )
  })
  drawInfinity(context)
  drawPanel(context, 1007, 62, 248, 150)
  drawPanel(context, 1007, 230, 118, 160)
  drawPanel(context, 1137, 230, 118, 160)
  drawPanel(context, 1007, 408, 248, 148)
  drawLabel(context, "RENDER", 1022, 88, "#e8ebff", 12)
  context.strokeStyle = "#8b6cff"
  context.lineWidth = 2
  context.beginPath()
  for (let x = 1020; x < 1238; x += 6) {
    const y = 155 + Math.sin(x * 0.055) * 28 + Math.cos(x * 0.021) * 12
    if (x === 1020) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.stroke()
  drawLabel(context, "NODE GRAPH", 1020, 434, "#e8ebff", 12)
  ;[
    [1034, 476],
    [1104, 496],
    [1173, 468],
    [1215, 518],
  ].forEach(([x, y], index) => {
    if (x === undefined || y === undefined) return
    context.fillStyle = index % 2 === 0 ? screenPalette.violet : screenPalette.cyan
    context.fillRect(x, y, 48, 24)
  })
  drawPanel(context, 205, 548, 770, 145)
  drawLabel(context, "TERMINAL", 222, 574, "#dfe6ff", 12)
  const code = [
    "config geometry = new InfinityGeometry();",
    "material.emissive = cyanPinkRamp;",
    "scene.add(new CyberdeckModel());",
    "renderer.outputColorSpace = SRGBColorSpace;",
  ]
  code.forEach((line, index) => {
    drawLabel(
      context,
      line,
      226,
      608 + index * 20,
      index === 1 ? screenPalette.magenta : screenPalette.cyanSoft,
      12,
    )
  })
  drawLabel(context, "FPS 120   GPU 77%   VRAM 2.1GB", 1010, 682, screenPalette.cyanBright, 12)
  return createTextureMaterial(canvas)
}
