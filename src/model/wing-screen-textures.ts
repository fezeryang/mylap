import type { MeshBasicMaterial } from "three"
import {
  createTextureMaterial,
  drawGrid,
  drawLabel,
  drawPanel,
  screenCanvas,
  screenPalette,
} from "./screen-canvas"

export const createLeftScreenMaterial = (): MeshBasicMaterial => {
  const { canvas, context } = screenCanvas(800, 560)
  drawGrid(context, canvas.width, canvas.height, 28)
  drawLabel(context, "SYSTEM TELEMETRY", 32, 38, "#e6ebff", 17)
  const metrics = [
    ["CPU", "17%"],
    ["GPU", "29%"],
    ["RAM", "46%"],
    ["NET", "3.2MB/s"],
  ]
  metrics.forEach(([name, value], index) => {
    if (name === undefined || value === undefined) return
    drawLabel(context, name, 38, 82 + index * 45, "#95baff", 13)
    drawLabel(context, value, 180, 82 + index * 45, "#f0eaff", 13)
    context.fillStyle = index % 2 === 0 ? screenPalette.cyan : screenPalette.violet
    context.fillRect(38, 94 + index * 45, 110 + index * 16, 7)
  })
  const cx = 495
  const cy = 280
  context.strokeStyle = "#4ddcff"
  context.shadowBlur = 18
  context.shadowColor = screenPalette.cyan
  ;[48, 92, 136, 180].forEach((radius) => {
    context.beginPath()
    context.arc(cx, cy, radius, 0, Math.PI * 2)
    context.stroke()
  })
  context.shadowBlur = 0
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2
    context.beginPath()
    context.moveTo(cx, cy)
    context.lineTo(cx + Math.cos(angle) * 180, cy + Math.sin(angle) * 180)
    context.stroke()
  }
  context.fillStyle = "rgba(118, 87, 255, .55)"
  context.beginPath()
  context.arc(cx, cy, 62, 0, Math.PI * 2)
  context.fill()
  drawLabel(context, "SATELLITE LINK: STABLE", 34, 518, "#c8f8ff", 14)
  return createTextureMaterial(canvas)
}

export const createRightScreenMaterial = (): MeshBasicMaterial => {
  const { canvas, context } = screenCanvas(800, 560)
  drawGrid(context, canvas.width, canvas.height, 28)
  drawLabel(context, "STRUCTURE ANALYSIS", 30, 38, "#e6ebff", 17)
  drawPanel(context, 28, 62, 500, 360)
  context.strokeStyle = "#45cfff"
  context.shadowBlur = 16
  context.shadowColor = screenPalette.violet
  const cube = [
    [150, 155],
    [335, 118],
    [432, 205],
    [245, 248],
    [150, 155],
    [155, 315],
    [340, 278],
    [432, 205],
    [427, 360],
    [340, 278],
    [245, 248],
    [250, 405],
    [427, 360],
  ]
  context.beginPath()
  cube.forEach(([x, y], index) => {
    if (x === undefined || y === undefined) return
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.stroke()
  context.shadowBlur = 0
  for (let index = 0; index < 6; index += 1) {
    drawLabel(context, `CH ${index + 1}`, 560, 94 + index * 48, "#a7c3ff", 12)
    context.fillStyle = index % 2 === 0 ? screenPalette.cyan : screenPalette.violet
    context.fillRect(560, 108 + index * 48, 175 - index * 14, 8)
  }
  const buttons = ["SCAN", "ANALYZE", "SIMULATE", "DEPLOY"]
  buttons.forEach((text, index) => {
    context.fillStyle = index === 0 ? "#7059ff" : "#122353"
    context.strokeStyle = "#668cff"
    context.fillRect(28 + index * 190, 470, 170, 54)
    context.strokeRect(28 + index * 190, 470, 170, 54)
    drawLabel(context, text, 62 + index * 190, 503, "#eef1ff", 13)
  })
  return createTextureMaterial(canvas)
}
