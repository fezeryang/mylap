import { CanvasTexture, LinearFilter, MeshBasicMaterial, SRGBColorSpace } from "three"

class CanvasContextError extends Error {
  constructor() {
    super("The browser did not provide a 2D canvas context")
    this.name = "CanvasContextError"
  }
}

export type ScreenCanvas = {
  readonly canvas: HTMLCanvasElement
  readonly context: CanvasRenderingContext2D
}

export const screenPalette = {
  cyan: "#34d9ff",
  cyanBright: "#86f4ff",
  cyanSoft: "#68dcff",
  grid: "rgba(71, 119, 222, .16)",
  ink: "#07102b",
  label: "#a8c7ff",
  magenta: "#ff8fd8",
  panel: "rgba(8, 19, 50, .82)",
  panelEdge: "rgba(91, 132, 235, .55)",
  pearlText: "#e8ebff",
  violet: "#7657ff",
} as const

export const screenCanvas = (width: number, height: number): ScreenCanvas => {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (context === null) throw new CanvasContextError()
  context.fillStyle = screenPalette.ink
  context.fillRect(0, 0, width, height)
  return { canvas, context }
}

export const drawGrid = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  step = 32,
): void => {
  context.strokeStyle = screenPalette.grid
  context.lineWidth = 1
  for (let x = 0; x <= width; x += step) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, height)
    context.stroke()
  }
  for (let y = 0; y <= height; y += step) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(width, y)
    context.stroke()
  }
}

export const drawLabel = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string = screenPalette.label,
  size = 15,
): void => {
  context.fillStyle = color
  context.font = `600 ${size}px ui-monospace, monospace`
  context.fillText(text, x, y)
}

export const drawPanel = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  context.fillStyle = screenPalette.panel
  context.fillRect(x, y, width, height)
  context.strokeStyle = screenPalette.panelEdge
  context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1)
}

export const createTextureMaterial = (canvas: HTMLCanvasElement): MeshBasicMaterial => {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  return new MeshBasicMaterial({ map: texture, toneMapped: false })
}
