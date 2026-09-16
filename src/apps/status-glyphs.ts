import { svgElement } from "./dom"

const statusGlyph = (viewBox: string): SVGSVGElement =>
  svgElement("svg", { viewBox, "aria-hidden": "true", focusable: "false" })

export const createCellularGlyph = (): SVGSVGElement => {
  const glyph = statusGlyph("0 0 18 12")
  const bars: readonly (readonly [number, number, number])[] = [
    [0, 8, 4],
    [5, 5.5, 6.5],
    [10, 3, 9],
    [15, 0.5, 11.5],
  ]
  for (const [x, y, height] of bars)
    glyph.append(
      svgElement("rect", {
        x: String(x),
        y: String(y),
        width: "3",
        height: String(height),
        rx: "1",
        fill: "currentColor",
      }),
    )
  return glyph
}

export const createWifiGlyph = (): SVGSVGElement => {
  const glyph = statusGlyph("0 0 16 12")
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.6",
    "stroke-linecap": "round",
  }
  glyph.append(
    svgElement("path", { d: "M1.5 4.2a9.5 9.5 0 0 1 13 0", ...stroke }),
    svgElement("path", { d: "M4 6.9a6 6 0 0 1 8 0", ...stroke }),
    svgElement("circle", { cx: "8", cy: "10", r: "1.4", fill: "currentColor" }),
  )
  return glyph
}

export const createBatteryGlyph = (): SVGSVGElement => {
  const glyph = statusGlyph("0 0 25 12")
  glyph.append(
    svgElement("rect", {
      x: "0.8",
      y: "0.8",
      width: "20",
      height: "10.4",
      rx: "3",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1",
      opacity: "0.5",
    }),
    svgElement("rect", {
      class: "os-battery-fill",
      x: "2.6",
      y: "2.6",
      width: "13",
      height: "6.8",
      rx: "1.6",
      fill: "currentColor",
    }),
    svgElement("path", {
      d: "M23 4.2v3.6a2.1 2.1 0 0 0 0-3.6",
      fill: "currentColor",
      opacity: "0.5",
    }),
  )
  return glyph
}

export const createLockGlyph = (): SVGSVGElement => {
  const glyph = statusGlyph("0 0 24 24")
  glyph.append(
    svgElement("path", {
      d: "M7 11V7a5 5 0 0 1 10 0v4",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.8",
      "stroke-linecap": "round",
    }),
    svgElement("rect", {
      x: "5",
      y: "11",
      width: "14",
      height: "10",
      rx: "2.5",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.8",
    }),
  )
  return glyph
}
