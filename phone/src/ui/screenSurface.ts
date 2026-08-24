import type { Group } from "three"
import { CSS3DObject } from "three/addons/renderers/CSS3DRenderer.js"

export function attachScreenSurface(anchor: Group, element: HTMLElement): CSS3DObject {
  const surface = new CSS3DObject(element)
  surface.name = "interactive-screen-surface"
  surface.scale.setScalar(0.01072)
  anchor.add(surface)
  return surface
}
