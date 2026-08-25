import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js"

export type ProceduralModelOptions = {
  wireframe?: boolean
  castShadow?: boolean
  receiveShadow?: boolean
  textureSize?: number
  textureAnisotropy?: number
  qualityPriority?: "reference-fidelity" | "balanced"
}

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>
  meshes: Record<string, THREE.Mesh>
  sockets: Record<string, THREE.Object3D>
  colliders: Record<string, unknown>
  destructionGroups: Record<string, THREE.Object3D[]>
}

type SculptMaterialSpec = Record<string, any>

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === "number") return value
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    for (const key of keys) {
      if (typeof record[key] === "number") return record[key] as number
    }
  }
  return fallback
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? "#" +
      hex
        .slice(1)
        .split("")
        .map((part) => part + part)
        .join("")
    : hex
  const value = /^#[0-9a-f]{6}$/i.test(normalized)
    ? Number.parseInt(normalized.slice(1), 16)
    : 0x8a7a5f
  return [
    clampAlbedoChannel((value >> 16) & 255),
    clampAlbedoChannel((value >> 8) & 255),
    clampAlbedoChannel(value & 255),
  ]
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette
  if (Array.isArray(palette) && palette.length > 0)
    return palette.filter((value) => typeof value === "string")
  const secondary = spec.albedo?.secondary
  const colors = [
    spec.baseColor ?? spec.color ?? spec.albedo?.dominant,
    ...(Array.isArray(secondary) ? secondary : []),
  ]
  return colors.filter(
    (value): value is string => typeof value === "string" && value.startsWith("#"),
  )
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)))
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value))
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value))
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source = typeof spec.baseColor === "string" ? spec.baseColor : "#8A7A5F"
  const [red, green, blue] = hexToRgb(source)
  return new THREE.Color(red / 255, green / 255, blue / 255)
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value)
}

function periodicHash(
  x: number,
  y: number,
  seed: number,
  periodX: number,
  periodY: number,
): number {
  const wrappedX = ((x % periodX) + periodX) % periodX
  const wrappedY = ((y % periodY) + periodY) % periodY
  let value =
    Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295
}

function periodicValueNoise(
  u: number,
  v: number,
  seed: number,
  periodX: number,
  periodY: number,
): number {
  const x = u * periodX
  const y = v * periodY
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = smoothCurve(x - x0)
  const ty = smoothCurve(y - y0)
  const a = periodicHash(x0, y0, seed, periodX, periodY)
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY)
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY)
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY)
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty)
}

type SurfaceBand = {
  frequency: number
  amplitude: number
  stretchX: number
  stretchY: number
  ridge: boolean
}

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : []
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return []
    const band = item as Record<string, unknown>
    const frequency = typeof band.frequency === "number" ? band.frequency : 0
    const amplitude = typeof band.amplitude === "number" ? band.amplitude : 0
    if (frequency <= 0 || amplitude <= 0) return []
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1]
    const description = `${String(band.pattern ?? "")} ${String(band.role ?? "")}`.toLowerCase()
    return [
      {
        frequency,
        amplitude,
        stretchX: typeof stretch[0] === "number" ? Math.max(0.1, stretch[0]) : 1,
        stretchY: typeof stretch[1] === "number" ? Math.max(0.1, stretch[1]) : 1,
        ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
      },
    ]
  })
  return parsed.length > 0
    ? parsed
    : [
        { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
        { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
        { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
      ]
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0
  let weight = 0
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index]
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX))
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY))
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY)
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1)
    value += sample * band.amplitude
    weight += band.amplitude
  }
  return weight > 0 ? clamp01(value / weight) : 0.5
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0]
  const scaled = clamp01(value) * (colors.length - 1)
  const index = Math.min(colors.length - 2, Math.floor(scaled))
  const mix = scaled - index
  const a = colors[index]
  const b = colors[index + 1]
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ]
}

type ColorGradientStop = { offset: number; color: string }
type ColorGradientSpec = {
  type: "linear" | "radial"
  axis: [number, number]
  stops: ColorGradientStop[]
}

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value)
  if (!match) return [138, 122, 95]
  return [
    clampAlbedoChannel(Number(match[1])),
    clampAlbedoChannel(Number(match[2])),
    clampAlbedoChannel(Number(match[3])),
  ]
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(
  gradient: ColorGradientSpec,
  u: number,
  v: number,
): [number, number, number] {
  const stops =
    gradient.stops.length >= 2
      ? gradient.stops
      : [
          { offset: 0, color: "rgba(138,122,95,1)" },
          { offset: 1, color: "rgba(138,122,95,1)" },
        ]
  let t: number
  if (gradient.type === "radial") {
    const [cx, cy] = gradient.axis
    const dx = u - cx
    const dy = v - cy
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)))
    t = clamp01(Math.hypot(dx, dy) / maxRadius)
  } else {
    const [ax, ay] = gradient.axis
    const projection = (u - 0.5) * ax + (v - 0.5) * ay
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5
    t = clamp01(projection / maxProjection + 0.5)
  }
  const scaled = t * (stops.length - 1)
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)))
  const mix = scaled - index
  const a = parseRgba(stops[index].color)
  const b = parseRgba(stops[index + 1].color)
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ]
}

function writePixel(
  data: Uint8ClampedArray,
  offset: number,
  red: number,
  green: number,
  blue: number,
): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)))
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)))
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)))
  data[offset + 3] = 255
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  return canvas
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas)
  const projection =
    spec.textureProjection && typeof spec.textureProjection === "object"
      ? spec.textureProjection
      : {}
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2]
  texture.colorSpace = colorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(
    typeof repeat[0] === "number" ? repeat[0] : 2,
    typeof repeat[1] === "number" ? repeat[1] : 2,
  )
  texture.anisotropy = Math.max(
    1,
    Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8),
  )
  texture.needsUpdate = true
  return texture
}

type ProceduralTextureSet = {
  albedo: THREE.Texture
  roughness: THREE.Texture
  height: THREE.Texture
  normal: THREE.Texture
  ao: THREE.Texture
  source: "reference-pixel-extraction" | "procedural"
}

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr
  if (!reference || typeof reference !== "object") return null
  if (reference.usable === false) return null
  const confidence =
    typeof reference.confidence === "number"
      ? reference.confidence
      : typeof reference.estimatedFidelity === "number"
        ? reference.estimatedFidelity
        : 0
  const threshold = typeof reference.targetThreshold === "number" ? reference.targetThreshold : 0.7
  if (confidence < threshold) return null
  const maps = reference.maps
  if (!maps || typeof maps !== "object") return null
  const map = (maps as Record<string, unknown>)[channel]
  if (!map || typeof map !== "object") return null
  const record = map as Record<string, unknown>
  const url = typeof record.url === "string" && record.url.trim() ? record.url : record.path
  return typeof url === "string" && url.trim() ? url : null
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url)
  const projection =
    spec.textureProjection && typeof spec.textureProjection === "object"
      ? spec.textureProjection
      : {}
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1]
  texture.colorSpace = colorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(
    typeof repeat[0] === "number" ? repeat[0] : 1,
    typeof repeat[1] === "number" ? repeat[1] : 1,
  )
  texture.anisotropy = Math.max(
    1,
    Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8),
  )
  texture.needsUpdate = true
  return texture
}

function makeReferenceTextureSet(
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, "albedo")
  const roughness = referenceMapUrl(spec, "roughness")
  const height = referenceMapUrl(spec, "height")
  const normal = referenceMapUrl(spec, "normal")
  const ao = referenceMapUrl(spec, "ao")
  if (!albedo || !roughness || !height || !normal || !ao) return null
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: "reference-pixel-extraction",
  }
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === "undefined") return null
  const qualityFirst = (options.qualityPriority ?? "reference-fidelity") === "reference-fidelity"
  const requested = options.textureSize ?? spec.textureResolution
  const requestedSize =
    typeof requested === "number" && Number.isFinite(requested)
      ? requested
      : qualityFirst
        ? 1024
        : 512
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))))
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  }
  const contexts = {
    albedo: canvases.albedo.getContext("2d"),
    roughness: canvases.roughness.getContext("2d"),
    height: canvases.height.getContext("2d"),
    normal: canvases.normal.getContext("2d"),
    ao: canvases.ao.getContext("2d"),
  }
  if (
    !contexts.albedo ||
    !contexts.roughness ||
    !contexts.height ||
    !contexts.normal ||
    !contexts.ao
  )
    return null
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  }
  const seed = hashString(id)
  const bands = surfaceBands(spec)
  const heightField = new Float32Array(size * size)
  const roughnessField = new Float32Array(size * size)
  const palette = materialPalette(spec)
  const fallback = typeof spec.baseColor === "string" ? spec.baseColor : "#8A7A5F"
  const colors = (palette.length >= 2 ? palette : [fallback, "#6E614B", "#A08F70"]).map(hexToRgb)
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ["base"], 0.76))
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ["variation"], 0.18))
  const colorAmplitude = clamp01(
    readLayerNumber(spec.colorVariation, ["amplitude", "variation"], 0.18),
  )
  const heightCorrelation = clamp01(
    readLayerNumber(spec.colorVariation, ["heightCorrelation"], 0.3),
  )
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient
  for (let y = 0; y < size; y += 1) {
    const v = y / size
    for (let x = 0; x < size; x += 1) {
      const u = x / size
      const index = y * size + x
      const height = sampleSurface(u, v, bands, seed + 101)
      const roughNoise = sampleSurface(u, v, bands, seed + 7001)
      const colorNoise = sampleSurface(u, v, bands, seed + 15013)
      heightField[index] = height
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2)
      let color: [number, number, number]
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v)
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation,
        )
        color = mixPalette(colors, paletteValue)
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2])
    }
  }
  const normalStrength = Math.max(
    0.05,
    readLayerNumber(spec.normal, ["strength", "amplitude"], 0.35),
  )
  const aoStrength = clamp01(
    readLayerNumber(spec.ambientOcclusion, ["cavityStrength", "strength"], 0.35),
  )
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size
    const down = ((y + 1) % size) * size
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size
      const right = (x + 1) % size
      const index = y * size + x
      const center = heightField[index]
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1)
      const normalX = -dx * inverseLength
      const normalY = -dy * inverseLength
      const normalZ = inverseLength
      const neighborAverage =
        (heightField[y * size + left] +
          heightField[y * size + right] +
          heightField[up + x] +
          heightField[down + x]) *
        0.25
      const cavity = Math.max(0, neighborAverage - center)
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16))
      const offset = index * 4
      const heightByte = center * 255
      const roughnessByte = roughnessField[index] * 255
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte)
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte)
      writePixel(
        images.normal.data,
        offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      )
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255)
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0)
  contexts.roughness.putImageData(images.roughness, 0, 0)
  contexts.height.putImageData(images.height, 0, 0)
  contexts.normal.putImageData(images.normal, 0, 0)
  contexts.ao.putImageData(images.ao, 0, 0)
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: "procedural",
  }
}

function createSculptMaterial(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
  denseComponent = false,
): THREE.MeshPhysicalMaterial {
  const textures =
    makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options)
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ["base"], 0.76)),
    metalness: clampPbrMetalness(readLayerNumber(spec.metalness, ["base"], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ["base", "amount"], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ["base"], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ["base", "amount"], 0)),
    ior: clampPbrIor(readLayerNumber(spec.ior, ["base", "value"], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ["base", "amount"], 0)),
    attenuationDistance: Math.max(
      0.001,
      readLayerNumber(spec.attenuationDistance, ["base", "value"], Infinity),
    ),
    attenuationColor: new THREE.Color(
      typeof spec.attenuationColor === "string" ? spec.attenuationColor : "#ffffff",
    ),
    sheen: clamp01(readLayerNumber(spec.sheen, ["base", "amount"], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === "string" ? spec.sheenColor : "#ffffff"),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ["base"], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ["base", "amount"], 0)),
    iridescenceIOR: clampPbrIor(readLayerNumber(spec.iridescenceIOR, ["base", "value"], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ["base", "amount"], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ["rotation"], 0),
    specularIntensity: clampPbrF0(
      readLayerNumber(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ["base", "value"], 1.0),
    ),
    specularColor: new THREE.Color(
      typeof spec.specularColor === "string" ? spec.specularColor : "#ffffff",
    ),
    emissive: new THREE.Color(typeof spec.emissive === "string" ? spec.emissive : "#000000"),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ["base"], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ["base"], 1)),
    transparent:
      readLayerNumber(spec.transmission, ["base", "amount"], 0) > 0 ||
      readLayerNumber(spec.opacity, ["base"], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ["cutoff", "alphaTest"], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  })
  if (textures) {
    material.map = textures.albedo
    material.roughnessMap = textures.roughness
    material.normalMap = textures.normal
    material.normalScale.setScalar(
      Math.max(0.05, readLayerNumber(spec.normal, ["strength", "amplitude"], 0.35)),
    )
    material.aoMap = textures.ao
    material.aoMap.channel = 0
    material.aoMapIntensity = readLayerNumber(
      spec.ambientOcclusion,
      ["cavityStrength", "strength"],
      0.35,
    )
    const denseMesh =
      denseComponent ||
      spec.denseMesh === true ||
      spec.geometryDensity === "dense" ||
      spec.topologyClass === "dense"
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ["amplitude", "strength"], 0))
    const effectiveBumpScale = denseMesh ? Math.max(0.05, bumpScale) : bumpScale
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height
      material.bumpScale = effectiveBumpScale
    }
    const displacementScale = Math.max(
      0,
      readLayerNumber(spec.displacement, ["amplitude", "strength"], 0),
    )
    const effectiveDisplacementScale = denseMesh
      ? Math.max(0.005, displacementScale)
      : displacementScale
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height
      material.displacementScale = effectiveDisplacementScale
      material.displacementBias = -effectiveDisplacementScale * 0.5
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ["envMapIntensity"], 0.8)
  material.userData.sculptMaterial = spec
  material.userData.proceduralMapsIndependent = true
  material.userData.pbrConstraints = {
    albedoRange: [30, 240],
    binaryMetalness: true,
    f0Range: [0.02, 1],
    iorRange: [1, 2.5],
  }
  material.userData.pbrTextureSource = textures?.source ?? "flat-fallback"
  material.userData.referencePbr = spec.referencePbr ?? null
  material.userData.referenceMaterialId =
    spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null
  material.userData.materialEvidence = spec.materialEvidence ?? null
  material.userData.validationViews = spec.materialReference?.validationViews ?? []
  material.needsUpdate = true
  return material
}

type AttachmentEndpoint = {
  start: THREE.Vector3
  midpoint: THREE.Vector3
  quaternion: THREE.Quaternion
  length: number
  baseRadius: number
  endRadius: number
}

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number")
  ) {
    return new THREE.Vector3(value[0], value[1], value[2])
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2])
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== "object") return null
  const record = attachment as Record<string, unknown>
  const start = readVector3(record.localStart, [0, 0, 0])
  const end = readVector3(record.localEnd, [0, 1, 0])
  const delta = end.clone().sub(start)
  const length = delta.length()
  if (length <= 0.0001) return null
  const direction = delta.clone().normalize()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction,
  )
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06))
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55))
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  }
}

// Generated from ObjectSculptSpec target: Cyber Desk
// Sculpt build pass: blockout
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createCyberDeskModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group()
  root.name = "Cyber Desk"
  root.userData.reconstructionEvidence = {
    itemFamily: null,
    subtype: null,
    componentAdapter: null,
    route: null,
    exactnessTier: null,
    referenceCamera: {
      solved: true,
      fovDegrees: 32,
      aspect: 1.7768331562167907,
      orientation: { yaw: -38, pitch: -26, roll: -1 },
      positionHint: [11.8, 9.3, 13.2],
      note: "Approximate perspective match from a single three-quarter product render; hidden regions remain unverified.",
    },
    approximationNotes: [],
  }
  root.userData.materialPipeline = {}
  root.userData.materialReferenceRegistry = null

  const materialMap: Record<string, THREE.Material> = {}
  materialMap["invisible-root"] = createSculptMaterial(
    "invisible-root",
    {
      id: "invisible-root",
      name: "Invisible root contract material",
      type: "standard",
      shaderModel: "MeshStandardMaterial / PBR approximation",
      baseColor: "#10131c",
      color: "#10131c",
      albedo: {
        dominant: "#10131c",
        secondary: ["#10131c"],
        samplingNotes:
          "Sampled from the named reference crop; highlight color is not baked into albedo.",
      },
      colorVariation: {
        palette: ["#10131c"],
        pattern: "subtle procedural variation",
        amplitude: 0.06,
        heightCorrelation: 0.1,
      },
      textureResolution: 1024,
      textureProjection: {
        mode: "uv",
        repeat: [2, 2],
        anisotropy: 8,
        texelDensityIntent:
          "Preserve stable world/object-scale detail; do not stretch micro detail with component scale.",
      },
      surfaceFrequencyBands: [
        { id: "macro", frequency: 2, amplitude: 0.42, role: "broad color and height breakup" },
        {
          id: "meso",
          frequency: 12,
          amplitude: 0.22,
          role: "ridges, pores, grain, dents, or equivalent visible relief",
        },
        {
          id: "micro",
          frequency: 56,
          amplitude: 0.08,
          role: "highlight breakup visible under grazing light",
        },
      ],
      roughness: {
        base: 1,
        variation: 0.08,
        map: "independent procedural roughness field",
        localResponse: "cavities rougher, exposed bevels smoother",
      },
      metalness: { base: 0, variation: 0.04 },
      normal: {
        pattern: "independent micro-grain field",
        strength: 0,
        scale: 96,
        space: "tangent",
      },
      bump: { pattern: "none", amplitude: 0, scale: 1 },
      displacement: { pattern: "none", amplitude: 0, scale: 1, silhouetteAffects: false },
      ambientOcclusion: {
        cavityStrength: 0.25,
        contactShadowBias: 0.35,
        notes: "Darken creases, seams, intersections, and recessed local features.",
      },
      wear: { edgeWear: 0, scratches: [], chips: [] },
      dirt: { amount: 0, cavityBias: 0, color: "#2F2A22" },
      localOverrides: [],
      shaderNotes: [
        "Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.",
        "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.",
        "Use normal/bump/displacement only when they map to observed surface relief.",
        "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.",
      ],
      notes: "Complete non-rendered contract material for the transform root.",
      clearcoat: 0,
      clearcoatRoughness: 0.2,
      emissive: "#000000",
      emissiveIntensity: 0,
    },
    options,
  )
  materialMap["silver-shell"] = createSculptMaterial(
    "silver-shell",
    {
      id: "silver-shell",
      name: "Pearl lavender coated metal",
      type: "standard",
      shaderModel: "MeshStandardMaterial / PBR approximation",
      baseColor: "#a8b9df",
      color: "#a8b9df",
      albedo: {
        dominant: "#a8b9df",
        secondary: ["#7f8fc0", "#d1ddf2"],
        samplingNotes:
          "Cool lavender-gray midtone sampled from detail-evidence/zone-r0c1.png; bright white sweep is excluded as illumination.",
      },
      colorVariation: {
        palette: ["#a8b9df", "#7f8fc0", "#d1ddf2"],
        pattern: "subtle procedural variation",
        amplitude: 0.06,
        heightCorrelation: 0.1,
      },
      textureResolution: 1024,
      textureProjection: {
        mode: "uv",
        repeat: [2, 2],
        anisotropy: 8,
        texelDensityIntent:
          "Preserve stable world/object-scale detail; do not stretch micro detail with component scale.",
      },
      surfaceFrequencyBands: [
        { id: "macro", frequency: 2, amplitude: 0.42, role: "broad color and height breakup" },
        {
          id: "meso",
          frequency: 12,
          amplitude: 0.22,
          role: "ridges, pores, grain, dents, or equivalent visible relief",
        },
        {
          id: "micro",
          frequency: 56,
          amplitude: 0.08,
          role: "highlight breakup visible under grazing light",
        },
      ],
      roughness: {
        base: 0.22,
        variation: 0.08,
        map: "independent procedural roughness field",
        localResponse: "cavities rougher, exposed bevels smoother",
      },
      metalness: { base: 0.76, variation: 0.04 },
      normal: {
        pattern: "independent micro-grain field",
        strength: 0.12,
        scale: 96,
        space: "tangent",
      },
      bump: { pattern: "none", amplitude: 0, scale: 1 },
      displacement: { pattern: "none", amplitude: 0, scale: 1, silhouetteAffects: false },
      ambientOcclusion: {
        cavityStrength: 0.25,
        contactShadowBias: 0.35,
        notes: "Darken creases, seams, intersections, and recessed local features.",
      },
      wear: { edgeWear: 0, scratches: [], chips: [] },
      dirt: { amount: 0, cavityBias: 0, color: "#2F2A22" },
      localOverrides: [],
      shaderNotes: [
        "Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.",
        "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.",
        "Use normal/bump/displacement only when they map to observed surface relief.",
        "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.",
      ],
      notes: "Procedural PBR material with independent response channels.",
      clearcoat: 0.42,
      clearcoatRoughness: 0.18,
      emissive: "#000000",
      emissiveIntensity: 0,
      referencePbr: {
        version: "1",
        sourceImage: "/home/fezer/projects/todou/desk/detail-evidence/zone-r0c1.png",
        extractor: "img2threejs extract_pbr_evidence.py",
        method: "single-image reference estimate",
        verdict: "pass",
        hardLimit:
          "single-image PBR extraction is an estimate; 70%+ extraction confidence still needs render screenshot review",
        usable: true,
        confidence: 0.86,
        estimatedFidelity: 0.86,
        targetThreshold: 0.7,
        maps: {
          albedo: {
            path: "/home/fezer/projects/todou/desk/material-evidence/silver-shell/silver-shell_albedo.png",
            url: "silver-shell_albedo.png",
            channel: "albedo",
            source: "reference-pixel-extraction",
          },
          roughness: {
            path: "/home/fezer/projects/todou/desk/material-evidence/silver-shell/silver-shell_roughness.png",
            url: "silver-shell_roughness.png",
            channel: "roughness",
            source: "reference-pixel-extraction",
          },
          height: {
            path: "/home/fezer/projects/todou/desk/material-evidence/silver-shell/silver-shell_height.png",
            url: "silver-shell_height.png",
            channel: "height",
            source: "reference-pixel-extraction",
          },
          normal: {
            path: "/home/fezer/projects/todou/desk/material-evidence/silver-shell/silver-shell_normal.png",
            url: "silver-shell_normal.png",
            channel: "normal",
            source: "reference-pixel-extraction",
          },
          ao: {
            path: "/home/fezer/projects/todou/desk/material-evidence/silver-shell/silver-shell_ao.png",
            url: "silver-shell_ao.png",
            channel: "ao",
            source: "reference-pixel-extraction",
          },
        },
      },
    },
    options,
  )
  materialMap["black-chassis"] = createSculptMaterial(
    "black-chassis",
    {
      id: "black-chassis",
      name: "Satin black-blue chassis",
      type: "standard",
      shaderModel: "MeshStandardMaterial / PBR approximation",
      baseColor: "#080e1b",
      color: "#080e1b",
      albedo: {
        dominant: "#080e1b",
        secondary: ["#111a2c", "#02050b"],
        samplingNotes:
          "Sampled from the named reference crop; highlight color is not baked into albedo.",
      },
      colorVariation: {
        palette: ["#080e1b", "#111a2c", "#02050b"],
        pattern: "subtle procedural variation",
        amplitude: 0.06,
        heightCorrelation: 0.1,
      },
      textureResolution: 1024,
      textureProjection: {
        mode: "uv",
        repeat: [2, 2],
        anisotropy: 8,
        texelDensityIntent:
          "Preserve stable world/object-scale detail; do not stretch micro detail with component scale.",
      },
      surfaceFrequencyBands: [
        { id: "macro", frequency: 2, amplitude: 0.42, role: "broad color and height breakup" },
        {
          id: "meso",
          frequency: 12,
          amplitude: 0.22,
          role: "ridges, pores, grain, dents, or equivalent visible relief",
        },
        {
          id: "micro",
          frequency: 56,
          amplitude: 0.08,
          role: "highlight breakup visible under grazing light",
        },
      ],
      roughness: {
        base: 0.3,
        variation: 0.1,
        map: "independent procedural roughness field",
        localResponse: "cavities rougher, exposed bevels smoother",
      },
      metalness: { base: 0.62, variation: 0.04 },
      normal: {
        pattern: "independent micro-grain field",
        strength: 0.12,
        scale: 72,
        space: "tangent",
      },
      bump: { pattern: "none", amplitude: 0, scale: 1 },
      displacement: { pattern: "none", amplitude: 0, scale: 1, silhouetteAffects: false },
      ambientOcclusion: {
        cavityStrength: 0.25,
        contactShadowBias: 0.35,
        notes: "Darken creases, seams, intersections, and recessed local features.",
      },
      wear: { edgeWear: 0, scratches: [], chips: [] },
      dirt: { amount: 0, cavityBias: 0, color: "#2F2A22" },
      localOverrides: [],
      shaderNotes: [
        "Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.",
        "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.",
        "Use normal/bump/displacement only when they map to observed surface relief.",
        "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.",
      ],
      notes: "Procedural PBR material with independent response channels.",
      clearcoat: 0,
      clearcoatRoughness: 0.2,
      emissive: "#000000",
      emissiveIntensity: 0,
    },
    options,
  )
  materialMap["desk-mat"] = createSculptMaterial(
    "desk-mat",
    {
      id: "desk-mat",
      name: "Navy woven rubber composite",
      type: "standard",
      shaderModel: "MeshStandardMaterial / PBR approximation",
      baseColor: "#07152b",
      color: "#07152b",
      albedo: {
        dominant: "#07152b",
        secondary: ["#0b2343", "#030914"],
        samplingNotes:
          "Sampled from the named reference crop; highlight color is not baked into albedo.",
      },
      colorVariation: {
        palette: ["#07152b", "#0b2343", "#030914"],
        pattern: "fine woven grain independent from albedo",
        amplitude: 0.08,
        heightCorrelation: 0.1,
      },
      textureResolution: 1024,
      textureProjection: {
        mode: "uv",
        repeat: [2, 2],
        anisotropy: 8,
        texelDensityIntent:
          "Preserve stable world/object-scale detail; do not stretch micro detail with component scale.",
      },
      surfaceFrequencyBands: [
        { id: "macro", frequency: 2, amplitude: 0.42, role: "broad color and height breakup" },
        {
          id: "meso",
          frequency: 12,
          amplitude: 0.22,
          role: "ridges, pores, grain, dents, or equivalent visible relief",
        },
        {
          id: "micro",
          frequency: 56,
          amplitude: 0.08,
          role: "highlight breakup visible under grazing light",
        },
      ],
      roughness: {
        base: 0.78,
        variation: 0.12,
        map: "independent procedural roughness field",
        localResponse: "cavities rougher, exposed bevels smoother",
      },
      metalness: { base: 0.05, variation: 0.04 },
      normal: { pattern: "cross-woven micro normal", strength: 0.24, scale: 180, space: "tangent" },
      bump: { pattern: "none", amplitude: 0, scale: 1 },
      displacement: { pattern: "none", amplitude: 0, scale: 1, silhouetteAffects: false },
      ambientOcclusion: {
        cavityStrength: 0.25,
        contactShadowBias: 0.35,
        notes: "Darken creases, seams, intersections, and recessed local features.",
      },
      wear: { edgeWear: 0, scratches: [], chips: [] },
      dirt: { amount: 0, cavityBias: 0, color: "#2F2A22" },
      localOverrides: [
        {
          id: "micro-grain",
          region: "entire inset mat",
          roughness: 0.82,
          normalStrength: 0.24,
          evidenceRef: "detail-evidence/zone-r1c1.png",
        },
      ],
      shaderNotes: [
        "Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.",
        "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.",
        "Use normal/bump/displacement only when they map to observed surface relief.",
        "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.",
      ],
      notes: "Procedural PBR material with independent response channels.",
      clearcoat: 0,
      clearcoatRoughness: 0.2,
      emissive: "#000000",
      emissiveIntensity: 0,
      referencePbr: {
        version: "1",
        sourceImage: "/home/fezer/projects/todou/desk/detail-evidence/zone-r1c1.png",
        extractor: "img2threejs extract_pbr_evidence.py",
        method: "single-image reference estimate",
        verdict: "pass",
        hardLimit:
          "single-image PBR extraction is an estimate; 70%+ extraction confidence still needs render screenshot review",
        usable: true,
        confidence: 0.86,
        estimatedFidelity: 0.86,
        targetThreshold: 0.7,
        maps: {
          albedo: {
            path: "/home/fezer/projects/todou/desk/material-evidence/desk-mat/desk-mat_albedo.png",
            url: "desk-mat_albedo.png",
            channel: "albedo",
            source: "reference-pixel-extraction",
          },
          roughness: {
            path: "/home/fezer/projects/todou/desk/material-evidence/desk-mat/desk-mat_roughness.png",
            url: "desk-mat_roughness.png",
            channel: "roughness",
            source: "reference-pixel-extraction",
          },
          height: {
            path: "/home/fezer/projects/todou/desk/material-evidence/desk-mat/desk-mat_height.png",
            url: "desk-mat_height.png",
            channel: "height",
            source: "reference-pixel-extraction",
          },
          normal: {
            path: "/home/fezer/projects/todou/desk/material-evidence/desk-mat/desk-mat_normal.png",
            url: "desk-mat_normal.png",
            channel: "normal",
            source: "reference-pixel-extraction",
          },
          ao: {
            path: "/home/fezer/projects/todou/desk/material-evidence/desk-mat/desk-mat_ao.png",
            url: "desk-mat_ao.png",
            channel: "ao",
            source: "reference-pixel-extraction",
          },
        },
      },
    },
    options,
  )
  materialMap["blue-armor"] = createSculptMaterial(
    "blue-armor",
    {
      id: "blue-armor",
      name: "Blue anodized leg armor",
      type: "standard",
      shaderModel: "MeshStandardMaterial / PBR approximation",
      baseColor: "#164b9b",
      color: "#164b9b",
      albedo: {
        dominant: "#164b9b",
        secondary: ["#079fe0", "#312f8f"],
        samplingNotes:
          "Sampled from the named reference crop; highlight color is not baked into albedo.",
      },
      colorVariation: {
        palette: ["#164b9b", "#079fe0", "#312f8f"],
        pattern: "subtle procedural variation",
        amplitude: 0.06,
        heightCorrelation: 0.1,
      },
      textureResolution: 1024,
      textureProjection: {
        mode: "uv",
        repeat: [2, 2],
        anisotropy: 8,
        texelDensityIntent:
          "Preserve stable world/object-scale detail; do not stretch micro detail with component scale.",
      },
      surfaceFrequencyBands: [
        { id: "macro", frequency: 2, amplitude: 0.42, role: "broad color and height breakup" },
        {
          id: "meso",
          frequency: 12,
          amplitude: 0.22,
          role: "ridges, pores, grain, dents, or equivalent visible relief",
        },
        {
          id: "micro",
          frequency: 56,
          amplitude: 0.08,
          role: "highlight breakup visible under grazing light",
        },
      ],
      roughness: {
        base: 0.24,
        variation: 0.08,
        map: "independent procedural roughness field",
        localResponse: "cavities rougher, exposed bevels smoother",
      },
      metalness: { base: 0.55, variation: 0.04 },
      normal: {
        pattern: "independent micro-grain field",
        strength: 0.12,
        scale: 96,
        space: "tangent",
      },
      bump: { pattern: "none", amplitude: 0, scale: 1 },
      displacement: { pattern: "none", amplitude: 0, scale: 1, silhouetteAffects: false },
      ambientOcclusion: {
        cavityStrength: 0.25,
        contactShadowBias: 0.35,
        notes: "Darken creases, seams, intersections, and recessed local features.",
      },
      wear: { edgeWear: 0, scratches: [], chips: [] },
      dirt: { amount: 0, cavityBias: 0, color: "#2F2A22" },
      localOverrides: [
        {
          id: "leg-cyan",
          region: "front inset rail",
          emissive: "#00d9ff",
          emissiveIntensity: 5.2,
          evidenceRef: "detail-evidence/zone-r2c0.png",
        },
      ],
      shaderNotes: [
        "Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.",
        "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.",
        "Use normal/bump/displacement only when they map to observed surface relief.",
        "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.",
      ],
      notes: "Procedural PBR material with independent response channels.",
      clearcoat: 0.3,
      clearcoatRoughness: 0.2,
      emissive: "#000000",
      emissiveIntensity: 0,
      referencePbr: {
        version: "1",
        sourceImage: "/home/fezer/projects/todou/desk/detail-evidence/zone-r2c0.png",
        extractor: "img2threejs extract_pbr_evidence.py",
        method: "single-image reference estimate",
        verdict: "pass",
        hardLimit:
          "single-image PBR extraction is an estimate; 70%+ extraction confidence still needs render screenshot review",
        usable: true,
        confidence: 0.86,
        estimatedFidelity: 0.86,
        targetThreshold: 0.7,
        maps: {
          albedo: {
            path: "/home/fezer/projects/todou/desk/material-evidence/blue-armor/blue-armor_albedo.png",
            url: "blue-armor_albedo.png",
            channel: "albedo",
            source: "reference-pixel-extraction",
          },
          roughness: {
            path: "/home/fezer/projects/todou/desk/material-evidence/blue-armor/blue-armor_roughness.png",
            url: "blue-armor_roughness.png",
            channel: "roughness",
            source: "reference-pixel-extraction",
          },
          height: {
            path: "/home/fezer/projects/todou/desk/material-evidence/blue-armor/blue-armor_height.png",
            url: "blue-armor_height.png",
            channel: "height",
            source: "reference-pixel-extraction",
          },
          normal: {
            path: "/home/fezer/projects/todou/desk/material-evidence/blue-armor/blue-armor_normal.png",
            url: "blue-armor_normal.png",
            channel: "normal",
            source: "reference-pixel-extraction",
          },
          ao: {
            path: "/home/fezer/projects/todou/desk/material-evidence/blue-armor/blue-armor_ao.png",
            url: "blue-armor_ao.png",
            channel: "ao",
            source: "reference-pixel-extraction",
          },
        },
      },
    },
    options,
  )
  materialMap["cyan-emissive"] = createSculptMaterial(
    "cyan-emissive",
    {
      id: "cyan-emissive",
      name: "Cyan emissive acrylic",
      type: "standard",
      shaderModel: "MeshStandardMaterial / PBR approximation",
      baseColor: "#00bde8",
      color: "#00bde8",
      albedo: {
        dominant: "#00bde8",
        secondary: ["#00f2ff"],
        samplingNotes:
          "Sampled from the named reference crop; highlight color is not baked into albedo.",
      },
      colorVariation: {
        palette: ["#00bde8", "#00f2ff"],
        pattern: "subtle procedural variation",
        amplitude: 0.06,
        heightCorrelation: 0.1,
      },
      textureResolution: 1024,
      textureProjection: {
        mode: "uv",
        repeat: [2, 2],
        anisotropy: 8,
        texelDensityIntent:
          "Preserve stable world/object-scale detail; do not stretch micro detail with component scale.",
      },
      surfaceFrequencyBands: [
        { id: "macro", frequency: 2, amplitude: 0.42, role: "broad color and height breakup" },
        {
          id: "meso",
          frequency: 12,
          amplitude: 0.22,
          role: "ridges, pores, grain, dents, or equivalent visible relief",
        },
        {
          id: "micro",
          frequency: 56,
          amplitude: 0.08,
          role: "highlight breakup visible under grazing light",
        },
      ],
      roughness: {
        base: 0.16,
        variation: 0.08,
        map: "independent procedural roughness field",
        localResponse: "cavities rougher, exposed bevels smoother",
      },
      metalness: { base: 0.08, variation: 0.04 },
      normal: {
        pattern: "independent micro-grain field",
        strength: 0.12,
        scale: 96,
        space: "tangent",
      },
      bump: { pattern: "none", amplitude: 0, scale: 1 },
      displacement: { pattern: "none", amplitude: 0, scale: 1, silhouetteAffects: false },
      ambientOcclusion: {
        cavityStrength: 0.25,
        contactShadowBias: 0.35,
        notes: "Darken creases, seams, intersections, and recessed local features.",
      },
      wear: { edgeWear: 0, scratches: [], chips: [] },
      dirt: { amount: 0, cavityBias: 0, color: "#2F2A22" },
      localOverrides: [
        {
          id: "cyan-rail",
          region: "tabletop perimeter and work-surface HUD",
          emissive: "#00e6ff",
          emissiveIntensity: 5.5,
          evidenceRef: "detail-evidence/zone-r0c1.png",
        },
        {
          id: "leg-cyan",
          region: "leg armor face strips",
          emissive: "#00d9ff",
          emissiveIntensity: 5.2,
          evidenceRef: "detail-evidence/zone-r2c0.png",
        },
      ],
      shaderNotes: [
        "Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.",
        "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.",
        "Use normal/bump/displacement only when they map to observed surface relief.",
        "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.",
      ],
      notes: "Procedural PBR material with independent response channels.",
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
      emissive: "#00dfff",
      emissiveIntensity: 5.5,
    },
    options,
  )
  materialMap["magenta-emissive"] = createSculptMaterial(
    "magenta-emissive",
    {
      id: "magenta-emissive",
      name: "Magenta emissive acrylic",
      type: "standard",
      shaderModel: "MeshStandardMaterial / PBR approximation",
      baseColor: "#ee18ef",
      color: "#ee18ef",
      albedo: {
        dominant: "#ee18ef",
        secondary: ["#8c20ff", "#ff42d0"],
        samplingNotes:
          "Sampled from the named reference crop; highlight color is not baked into albedo.",
      },
      colorVariation: {
        palette: ["#ee18ef", "#8c20ff", "#ff42d0"],
        pattern: "subtle procedural variation",
        amplitude: 0.06,
        heightCorrelation: 0.1,
      },
      textureResolution: 1024,
      textureProjection: {
        mode: "uv",
        repeat: [2, 2],
        anisotropy: 8,
        texelDensityIntent:
          "Preserve stable world/object-scale detail; do not stretch micro detail with component scale.",
      },
      surfaceFrequencyBands: [
        { id: "macro", frequency: 2, amplitude: 0.42, role: "broad color and height breakup" },
        {
          id: "meso",
          frequency: 12,
          amplitude: 0.22,
          role: "ridges, pores, grain, dents, or equivalent visible relief",
        },
        {
          id: "micro",
          frequency: 56,
          amplitude: 0.08,
          role: "highlight breakup visible under grazing light",
        },
      ],
      roughness: {
        base: 0.18,
        variation: 0.08,
        map: "independent procedural roughness field",
        localResponse: "cavities rougher, exposed bevels smoother",
      },
      metalness: { base: 0.08, variation: 0.04 },
      normal: {
        pattern: "independent micro-grain field",
        strength: 0.12,
        scale: 96,
        space: "tangent",
      },
      bump: { pattern: "none", amplitude: 0, scale: 1 },
      displacement: { pattern: "none", amplitude: 0, scale: 1, silhouetteAffects: false },
      ambientOcclusion: {
        cavityStrength: 0.25,
        contactShadowBias: 0.35,
        notes: "Darken creases, seams, intersections, and recessed local features.",
      },
      wear: { edgeWear: 0, scratches: [], chips: [] },
      dirt: { amount: 0, cavityBias: 0, color: "#2F2A22" },
      localOverrides: [
        {
          id: "magenta-rail",
          region: "corner and front perimeter segments",
          emissive: "#ff18f4",
          emissiveIntensity: 4.8,
          evidenceRef: "detail-evidence/zone-r1c1.png",
        },
      ],
      shaderNotes: [
        "Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.",
        "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.",
        "Use normal/bump/displacement only when they map to observed surface relief.",
        "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.",
      ],
      notes: "Procedural PBR material with independent response channels.",
      clearcoat: 0.48,
      clearcoatRoughness: 0.2,
      emissive: "#ff18f4",
      emissiveIntensity: 4.8,
    },
    options,
  )
  materialMap["orange-emissive"] = createSculptMaterial(
    "orange-emissive",
    {
      id: "orange-emissive",
      name: "Amber status emitter",
      type: "standard",
      shaderModel: "MeshStandardMaterial / PBR approximation",
      baseColor: "#ff6a00",
      color: "#ff6a00",
      albedo: {
        dominant: "#ff6a00",
        secondary: ["#ff6a00"],
        samplingNotes:
          "Sampled from the named reference crop; highlight color is not baked into albedo.",
      },
      colorVariation: {
        palette: ["#ff6a00"],
        pattern: "subtle procedural variation",
        amplitude: 0.06,
        heightCorrelation: 0.1,
      },
      textureResolution: 1024,
      textureProjection: {
        mode: "uv",
        repeat: [2, 2],
        anisotropy: 8,
        texelDensityIntent:
          "Preserve stable world/object-scale detail; do not stretch micro detail with component scale.",
      },
      surfaceFrequencyBands: [
        { id: "macro", frequency: 2, amplitude: 0.42, role: "broad color and height breakup" },
        {
          id: "meso",
          frequency: 12,
          amplitude: 0.22,
          role: "ridges, pores, grain, dents, or equivalent visible relief",
        },
        {
          id: "micro",
          frequency: 56,
          amplitude: 0.08,
          role: "highlight breakup visible under grazing light",
        },
      ],
      roughness: {
        base: 0.2,
        variation: 0.08,
        map: "independent procedural roughness field",
        localResponse: "cavities rougher, exposed bevels smoother",
      },
      metalness: { base: 0.05, variation: 0.04 },
      normal: {
        pattern: "independent micro-grain field",
        strength: 0.12,
        scale: 96,
        space: "tangent",
      },
      bump: { pattern: "none", amplitude: 0, scale: 1 },
      displacement: { pattern: "none", amplitude: 0, scale: 1, silhouetteAffects: false },
      ambientOcclusion: {
        cavityStrength: 0.25,
        contactShadowBias: 0.35,
        notes: "Darken creases, seams, intersections, and recessed local features.",
      },
      wear: { edgeWear: 0, scratches: [], chips: [] },
      dirt: { amount: 0, cavityBias: 0, color: "#2F2A22" },
      localOverrides: [],
      shaderNotes: [
        "Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.",
        "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.",
        "Use normal/bump/displacement only when they map to observed surface relief.",
        "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.",
      ],
      notes: "Procedural PBR material with independent response channels.",
      clearcoat: 0,
      clearcoatRoughness: 0.2,
      emissive: "#ff6200",
      emissiveIntensity: 4.4,
    },
    options,
  )

  const nodes: Record<string, THREE.Object3D> = { root }
  const meshes: Record<string, THREE.Mesh> = {}
  const sockets: Record<string, THREE.Object3D> = {}
  const colliders: Record<string, unknown> = {}
  const destructionGroups: Record<string, THREE.Object3D[]> = {}

  const attachment_root_0 = null
  const endpoint_root_0 = makeAttachmentEndpoint(attachment_root_0)
  const node_root_0 = new THREE.Group()
  node_root_0.name = "Cyber Desk__pivot"
  node_root_0.scale.set(1, 1, 1)
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start)
    node_root_0.rotation.set(0.0, 0.0, 0.0)
  } else {
    node_root_0.position.set(0.0, 0.0, 0.0)
    node_root_0.rotation.set(0.0, 0.0, 0.0)
  }
  node_root_0.userData.sculptComponent = {
    id: "root",
    name: "Cyber Desk",
    level: "macro",
    role: "body",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Transform-only root container with compound runtime collider.",
    geometryDescriptor: {
      topologyIntent: "Transform-only root container with compound runtime collider.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.35200000000000004, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: null,
    attachment: null,
    dimensions: { width: 12, height: 4.4, depth: 5.8, units: "model-units", confidence: 0.9 },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "root",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [12, 4.4, 5.8],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "tabletop",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 12,
        debrisMaterial: "invisible-root",
      },
    },
    material: "invisible-root",
    materialLayers: ["invisible-root"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(16, 19, 28, 1.0)",
      secondaryAlbedo: "rgba(16, 19, 28, 0.0)",
      materialClass: "unknown",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_root_0.userData.actionProfile = {
    animationRole: "root",
    pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [12, 4.4, 5.8],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "tabletop",
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 12,
      debrisMaterial: "invisible-root",
    },
  }
  ;(nodes["root"] ?? root).add(node_root_0)
  nodes["root"] = node_root_0
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(
        endpoint_root_0.endRadius,
        endpoint_root_0.baseRadius,
        endpoint_root_0.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_root_0) {
    mesh_root_0Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["invisible-root"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_root_0.name = "Cyber Desk"
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint)
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion)
  }
  mesh_root_0.castShadow = options.castShadow ?? true
  mesh_root_0.receiveShadow = options.receiveShadow ?? true
  mesh_root_0.userData.sculptComponent = {
    id: "root",
    name: "Cyber Desk",
    level: "macro",
    role: "body",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Transform-only root container with compound runtime collider.",
    geometryDescriptor: {
      topologyIntent: "Transform-only root container with compound runtime collider.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.35200000000000004, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: null,
    attachment: null,
    dimensions: { width: 12, height: 4.4, depth: 5.8, units: "model-units", confidence: 0.9 },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "root",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [12, 4.4, 5.8],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "tabletop",
        seamRefs: [],
        detachableFragments: [],
        breakImpulse: 12,
        debrisMaterial: "invisible-root",
      },
    },
    material: "invisible-root",
    materialLayers: ["invisible-root"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(16, 19, 28, 1.0)",
      secondaryAlbedo: "rgba(16, 19, 28, 0.0)",
      materialClass: "unknown",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_root_0.add(mesh_root_0)
  meshes["root"] = mesh_root_0
  colliders["root"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [12, 4.4, 5.8],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["tabletop"] ??= []
  destructionGroups["tabletop"].push(node_root_0)

  const attachment_upper_shell_1 = null
  const endpoint_upper_shell_1 = makeAttachmentEndpoint(attachment_upper_shell_1)
  const node_upper_shell_1 = new THREE.Group()
  node_upper_shell_1.name = "Clipped upper shell__pivot"
  node_upper_shell_1.scale.set(1, 1, 1)
  if (endpoint_upper_shell_1) {
    node_upper_shell_1.position.copy(endpoint_upper_shell_1.start)
    node_upper_shell_1.rotation.set(0.0, 0.0, 0.0)
  } else {
    node_upper_shell_1.position.set(0.0, 2.1, 0.0)
    node_upper_shell_1.rotation.set(0.0, 0.0, 0.0)
  }
  node_upper_shell_1.userData.sculptComponent = {
    id: "upper-shell",
    name: "Clipped upper shell",
    level: "macro",
    role: "static-part",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid clipped-corner plate with countable beveled faces; authored as an extruded profile.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid clipped-corner plate with countable beveled faces; authored as an extruded profile.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0304, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "root",
    attachment: null,
    dimensions: { width: 12, height: 0.38, depth: 5.8, units: "model-units", confidence: 0.9 },
    transform: { position: [0, 2.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "static-part",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [12, 0.38, 5.8],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "tabletop",
        seamRefs: ["root/upper-shell"],
        detachableFragments: ["upper-shell"],
        breakImpulse: 12,
        debrisMaterial: "silver-shell",
      },
    },
    material: "silver-shell",
    materialLayers: ["silver-shell"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "edge-bevel",
        type: "bevel",
        placement: "clipped perimeter",
        geometryEffect: "0.12 unit chamfer",
        confidence: 0.94,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(168, 185, 223, 1.0)",
      secondaryAlbedo: "rgba(127, 143, 192, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_upper_shell_1.userData.actionProfile = {
    animationRole: "static-part",
    pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [12, 0.38, 5.8],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "tabletop",
      seamRefs: ["root/upper-shell"],
      detachableFragments: ["upper-shell"],
      breakImpulse: 12,
      debrisMaterial: "silver-shell",
    },
  }
  ;(nodes["root"] ?? root).add(node_upper_shell_1)
  nodes["upper-shell"] = node_upper_shell_1
  const mesh_upper_shell_1Geometry = endpoint_upper_shell_1
    ? new THREE.CylinderGeometry(
        endpoint_upper_shell_1.endRadius,
        endpoint_upper_shell_1.baseRadius,
        endpoint_upper_shell_1.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_upper_shell_1) {
    mesh_upper_shell_1Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_upper_shell_1 = new THREE.Mesh(
    mesh_upper_shell_1Geometry,
    materialMap["silver-shell"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_upper_shell_1.name = "Clipped upper shell"
  if (endpoint_upper_shell_1) {
    mesh_upper_shell_1.position.copy(endpoint_upper_shell_1.midpoint)
    mesh_upper_shell_1.quaternion.copy(endpoint_upper_shell_1.quaternion)
  }
  mesh_upper_shell_1.castShadow = options.castShadow ?? true
  mesh_upper_shell_1.receiveShadow = options.receiveShadow ?? true
  mesh_upper_shell_1.userData.sculptComponent = {
    id: "upper-shell",
    name: "Clipped upper shell",
    level: "macro",
    role: "static-part",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale:
      "Rigid clipped-corner plate with countable beveled faces; authored as an extruded profile.",
    geometryDescriptor: {
      topologyIntent:
        "Rigid clipped-corner plate with countable beveled faces; authored as an extruded profile.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0304, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "root",
    attachment: null,
    dimensions: { width: 12, height: 0.38, depth: 5.8, units: "model-units", confidence: 0.9 },
    transform: { position: [0, 2.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "static-part",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [12, 0.38, 5.8],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "tabletop",
        seamRefs: ["root/upper-shell"],
        detachableFragments: ["upper-shell"],
        breakImpulse: 12,
        debrisMaterial: "silver-shell",
      },
    },
    material: "silver-shell",
    materialLayers: ["silver-shell"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "edge-bevel",
        type: "bevel",
        placement: "clipped perimeter",
        geometryEffect: "0.12 unit chamfer",
        confidence: 0.94,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(168, 185, 223, 1.0)",
      secondaryAlbedo: "rgba(127, 143, 192, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_upper_shell_1.add(mesh_upper_shell_1)
  meshes["upper-shell"] = mesh_upper_shell_1
  colliders["upper-shell"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [12, 0.38, 5.8],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["tabletop"] ??= []
  destructionGroups["tabletop"].push(node_upper_shell_1)

  const attachment_lower_chassis_2 = null
  const endpoint_lower_chassis_2 = makeAttachmentEndpoint(attachment_lower_chassis_2)
  const node_lower_chassis_2 = new THREE.Group()
  node_lower_chassis_2.name = "Lower perimeter chassis__pivot"
  node_lower_chassis_2.scale.set(1, 1, 1)
  if (endpoint_lower_chassis_2) {
    node_lower_chassis_2.position.copy(endpoint_lower_chassis_2.start)
    node_lower_chassis_2.rotation.set(0.0, 0.0, 0.0)
  } else {
    node_lower_chassis_2.position.set(0.0, 1.82, 0.0)
    node_lower_chassis_2.rotation.set(0.0, 0.0, 0.0)
  }
  node_lower_chassis_2.userData.sculptComponent = {
    id: "lower-chassis",
    name: "Lower perimeter chassis",
    level: "meso",
    role: "static-part",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Rigid black bumper assembled beneath the shell.",
    geometryDescriptor: {
      topologyIntent: "Rigid black bumper assembled beneath the shell.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.027200000000000002, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "root",
    attachment: null,
    dimensions: { width: 12.15, height: 0.34, depth: 5.9, units: "model-units", confidence: 0.9 },
    transform: { position: [0, 1.82, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "static-part",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [12.15, 0.34, 5.9],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "tabletop",
        seamRefs: ["root/lower-chassis"],
        detachableFragments: ["lower-chassis"],
        breakImpulse: 12,
        debrisMaterial: "black-chassis",
      },
    },
    material: "black-chassis",
    materialLayers: ["black-chassis"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "orange-status-array",
        type: "emissive",
        placement: "front and side bumpers",
        geometryEffect: "raised light bars",
        confidence: 0.91,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(8, 14, 27, 1.0)",
      secondaryAlbedo: "rgba(17, 26, 44, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_lower_chassis_2.userData.actionProfile = {
    animationRole: "static-part",
    pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [12.15, 0.34, 5.9],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "tabletop",
      seamRefs: ["root/lower-chassis"],
      detachableFragments: ["lower-chassis"],
      breakImpulse: 12,
      debrisMaterial: "black-chassis",
    },
  }
  ;(nodes["root"] ?? root).add(node_lower_chassis_2)
  nodes["lower-chassis"] = node_lower_chassis_2
  const mesh_lower_chassis_2Geometry = endpoint_lower_chassis_2
    ? new THREE.CylinderGeometry(
        endpoint_lower_chassis_2.endRadius,
        endpoint_lower_chassis_2.baseRadius,
        endpoint_lower_chassis_2.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_lower_chassis_2) {
    mesh_lower_chassis_2Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_lower_chassis_2 = new THREE.Mesh(
    mesh_lower_chassis_2Geometry,
    materialMap["black-chassis"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_lower_chassis_2.name = "Lower perimeter chassis"
  if (endpoint_lower_chassis_2) {
    mesh_lower_chassis_2.position.copy(endpoint_lower_chassis_2.midpoint)
    mesh_lower_chassis_2.quaternion.copy(endpoint_lower_chassis_2.quaternion)
  }
  mesh_lower_chassis_2.castShadow = options.castShadow ?? true
  mesh_lower_chassis_2.receiveShadow = options.receiveShadow ?? true
  mesh_lower_chassis_2.userData.sculptComponent = {
    id: "lower-chassis",
    name: "Lower perimeter chassis",
    level: "meso",
    role: "static-part",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Rigid black bumper assembled beneath the shell.",
    geometryDescriptor: {
      topologyIntent: "Rigid black bumper assembled beneath the shell.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.027200000000000002, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "root",
    attachment: null,
    dimensions: { width: 12.15, height: 0.34, depth: 5.9, units: "model-units", confidence: 0.9 },
    transform: { position: [0, 1.82, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "static-part",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [12.15, 0.34, 5.9],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "tabletop",
        seamRefs: ["root/lower-chassis"],
        detachableFragments: ["lower-chassis"],
        breakImpulse: 12,
        debrisMaterial: "black-chassis",
      },
    },
    material: "black-chassis",
    materialLayers: ["black-chassis"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "orange-status-array",
        type: "emissive",
        placement: "front and side bumpers",
        geometryEffect: "raised light bars",
        confidence: 0.91,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(8, 14, 27, 1.0)",
      secondaryAlbedo: "rgba(17, 26, 44, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_lower_chassis_2.add(mesh_lower_chassis_2)
  meshes["lower-chassis"] = mesh_lower_chassis_2
  colliders["lower-chassis"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [12.15, 0.34, 5.9],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["tabletop"] ??= []
  destructionGroups["tabletop"].push(node_lower_chassis_2)

  const attachment_work_surface_3 = null
  const endpoint_work_surface_3 = makeAttachmentEndpoint(attachment_work_surface_3)
  const node_work_surface_3 = new THREE.Group()
  node_work_surface_3.name = "Inset work surface__pivot"
  node_work_surface_3.scale.set(1, 1, 1)
  if (endpoint_work_surface_3) {
    node_work_surface_3.position.copy(endpoint_work_surface_3.start)
    node_work_surface_3.rotation.set(0.0, 0.0, 0.0)
  } else {
    node_work_surface_3.position.set(0.0, 0.23, 0.0)
    node_work_surface_3.rotation.set(0.0, 0.0, 0.0)
  }
  node_work_surface_3.userData.sculptComponent = {
    id: "work-surface",
    name: "Inset work surface",
    level: "macro",
    role: "static-part",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "conforming-shell",
    topologyRationale: "Thin conforming inset following the tabletop aperture.",
    geometryDescriptor: {
      topologyIntent: "Thin conforming inset following the tabletop aperture.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0072, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "upper-shell",
    attachment: null,
    dimensions: { width: 8.9, height: 0.09, depth: 3.48, units: "model-units", confidence: 0.9 },
    transform: { position: [0, 0.23, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "static-part",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [8.9, 0.09, 3.48],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "tabletop",
        seamRefs: ["upper-shell/work-surface"],
        detachableFragments: ["work-surface"],
        breakImpulse: 12,
        debrisMaterial: "desk-mat",
      },
    },
    material: "desk-mat",
    materialLayers: ["desk-mat"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "zone-linework",
        type: "linework",
        placement: "three work zones",
        geometryEffect: "thin emissive carriers",
        confidence: 0.95,
      },
      {
        id: "targeting-rings",
        type: "linework",
        placement: "surface center",
        geometryEffect: "concentric tubes",
        confidence: 0.93,
      },
      {
        id: "corner-chevrons",
        type: "linework",
        placement: "four inset corners",
        geometryEffect: "raised chevron strips",
        confidence: 0.94,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(7, 21, 43, 1.0)",
      secondaryAlbedo: "rgba(11, 35, 67, 1.0)",
      materialClass: "rubber",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_work_surface_3.userData.actionProfile = {
    animationRole: "static-part",
    pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [8.9, 0.09, 3.48],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "tabletop",
      seamRefs: ["upper-shell/work-surface"],
      detachableFragments: ["work-surface"],
      breakImpulse: 12,
      debrisMaterial: "desk-mat",
    },
  }
  ;(nodes["upper-shell"] ?? root).add(node_work_surface_3)
  nodes["work-surface"] = node_work_surface_3
  const mesh_work_surface_3Geometry = endpoint_work_surface_3
    ? new THREE.CylinderGeometry(
        endpoint_work_surface_3.endRadius,
        endpoint_work_surface_3.baseRadius,
        endpoint_work_surface_3.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_work_surface_3) {
    mesh_work_surface_3Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_work_surface_3 = new THREE.Mesh(
    mesh_work_surface_3Geometry,
    materialMap["desk-mat"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_work_surface_3.name = "Inset work surface"
  if (endpoint_work_surface_3) {
    mesh_work_surface_3.position.copy(endpoint_work_surface_3.midpoint)
    mesh_work_surface_3.quaternion.copy(endpoint_work_surface_3.quaternion)
  }
  mesh_work_surface_3.castShadow = options.castShadow ?? true
  mesh_work_surface_3.receiveShadow = options.receiveShadow ?? true
  mesh_work_surface_3.userData.sculptComponent = {
    id: "work-surface",
    name: "Inset work surface",
    level: "macro",
    role: "static-part",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "conforming-shell",
    topologyRationale: "Thin conforming inset following the tabletop aperture.",
    geometryDescriptor: {
      topologyIntent: "Thin conforming inset following the tabletop aperture.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0072, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "upper-shell",
    attachment: null,
    dimensions: { width: 8.9, height: 0.09, depth: 3.48, units: "model-units", confidence: 0.9 },
    transform: { position: [0, 0.23, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "static-part",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [8.9, 0.09, 3.48],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "tabletop",
        seamRefs: ["upper-shell/work-surface"],
        detachableFragments: ["work-surface"],
        breakImpulse: 12,
        debrisMaterial: "desk-mat",
      },
    },
    material: "desk-mat",
    materialLayers: ["desk-mat"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "zone-linework",
        type: "linework",
        placement: "three work zones",
        geometryEffect: "thin emissive carriers",
        confidence: 0.95,
      },
      {
        id: "targeting-rings",
        type: "linework",
        placement: "surface center",
        geometryEffect: "concentric tubes",
        confidence: 0.93,
      },
      {
        id: "corner-chevrons",
        type: "linework",
        placement: "four inset corners",
        geometryEffect: "raised chevron strips",
        confidence: 0.94,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(7, 21, 43, 1.0)",
      secondaryAlbedo: "rgba(11, 35, 67, 1.0)",
      materialClass: "rubber",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_work_surface_3.add(mesh_work_surface_3)
  meshes["work-surface"] = mesh_work_surface_3
  colliders["work-surface"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [8.9, 0.09, 3.48],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["tabletop"] ??= []
  destructionGroups["tabletop"].push(node_work_surface_3)

  const attachment_work_surface_linework_4 = null
  const endpoint_work_surface_linework_4 = makeAttachmentEndpoint(
    attachment_work_surface_linework_4,
  )
  const node_work_surface_linework_4 = new THREE.Group()
  node_work_surface_linework_4.name = "Work surface HUD linework__pivot"
  node_work_surface_linework_4.scale.set(1, 1, 1)
  if (endpoint_work_surface_linework_4) {
    node_work_surface_linework_4.position.copy(endpoint_work_surface_linework_4.start)
    node_work_surface_linework_4.rotation.set(0.0, 0.0, 0.0)
  } else {
    node_work_surface_linework_4.position.set(0.0, 0.06, 0.0)
    node_work_surface_linework_4.rotation.set(0.0, 0.0, 0.0)
  }
  node_work_surface_linework_4.userData.sculptComponent = {
    id: "work-surface-linework",
    name: "Work surface HUD linework",
    level: "micro",
    role: "static-part",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "surface-relief",
    topologyRationale: "Raised emissive micro relief parented to the mat.",
    geometryDescriptor: {
      topologyIntent: "Raised emissive micro relief parented to the mat.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0016, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "work-surface",
    attachment: null,
    dimensions: { width: 8.5, height: 0.02, depth: 3.2, units: "model-units", confidence: 0.9 },
    transform: { position: [0, 0.06, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "static-part",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [8.5, 0.02, 3.2],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "tabletop",
        seamRefs: ["work-surface/work-surface-linework"],
        detachableFragments: ["work-surface-linework"],
        breakImpulse: 12,
        debrisMaterial: "cyan-emissive",
      },
    },
    material: "cyan-emissive",
    materialLayers: ["cyan-emissive"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(0, 189, 232, 1.0)",
      secondaryAlbedo: "rgba(0, 242, 255, 1.0)",
      materialClass: "plastic",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_work_surface_linework_4.userData.actionProfile = {
    animationRole: "static-part",
    pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [8.5, 0.02, 3.2],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: false,
      fractureGroup: "tabletop",
      seamRefs: ["work-surface/work-surface-linework"],
      detachableFragments: ["work-surface-linework"],
      breakImpulse: 12,
      debrisMaterial: "cyan-emissive",
    },
  }
  ;(nodes["work-surface"] ?? root).add(node_work_surface_linework_4)
  nodes["work-surface-linework"] = node_work_surface_linework_4
  const mesh_work_surface_linework_4Geometry = endpoint_work_surface_linework_4
    ? new THREE.CylinderGeometry(
        endpoint_work_surface_linework_4.endRadius,
        endpoint_work_surface_linework_4.baseRadius,
        endpoint_work_surface_linework_4.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_work_surface_linework_4) {
    mesh_work_surface_linework_4Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_work_surface_linework_4 = new THREE.Mesh(
    mesh_work_surface_linework_4Geometry,
    materialMap["cyan-emissive"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_work_surface_linework_4.name = "Work surface HUD linework"
  if (endpoint_work_surface_linework_4) {
    mesh_work_surface_linework_4.position.copy(endpoint_work_surface_linework_4.midpoint)
    mesh_work_surface_linework_4.quaternion.copy(endpoint_work_surface_linework_4.quaternion)
  }
  mesh_work_surface_linework_4.castShadow = options.castShadow ?? true
  mesh_work_surface_linework_4.receiveShadow = options.receiveShadow ?? true
  mesh_work_surface_linework_4.userData.sculptComponent = {
    id: "work-surface-linework",
    name: "Work surface HUD linework",
    level: "micro",
    role: "static-part",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "surface-relief",
    topologyRationale: "Raised emissive micro relief parented to the mat.",
    geometryDescriptor: {
      topologyIntent: "Raised emissive micro relief parented to the mat.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0016, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "work-surface",
    attachment: null,
    dimensions: { width: 8.5, height: 0.02, depth: 3.2, units: "model-units", confidence: 0.9 },
    transform: { position: [0, 0.06, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "static-part",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [8.5, 0.02, 3.2],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: false,
        fractureGroup: "tabletop",
        seamRefs: ["work-surface/work-surface-linework"],
        detachableFragments: ["work-surface-linework"],
        breakImpulse: 12,
        debrisMaterial: "cyan-emissive",
      },
    },
    material: "cyan-emissive",
    materialLayers: ["cyan-emissive"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(0, 189, 232, 1.0)",
      secondaryAlbedo: "rgba(0, 242, 255, 1.0)",
      materialClass: "plastic",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_work_surface_linework_4.add(mesh_work_surface_linework_4)
  meshes["work-surface-linework"] = mesh_work_surface_linework_4
  colliders["work-surface-linework"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [8.5, 0.02, 3.2],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["tabletop"] ??= []
  destructionGroups["tabletop"].push(node_work_surface_linework_4)

  const attachment_light_rails_5 = null
  const endpoint_light_rails_5 = makeAttachmentEndpoint(attachment_light_rails_5)
  const node_light_rails_5 = new THREE.Group()
  node_light_rails_5.name = "Segmented perimeter light rails__pivot"
  node_light_rails_5.scale.set(1, 1, 1)
  if (endpoint_light_rails_5) {
    node_light_rails_5.position.copy(endpoint_light_rails_5.start)
    node_light_rails_5.rotation.set(0.0, 0.0, 0.0)
  } else {
    node_light_rails_5.position.set(0.0, -0.06, 0.0)
    node_light_rails_5.rotation.set(0.0, 0.0, 0.0)
  }
  node_light_rails_5.userData.sculptComponent = {
    id: "light-rails",
    name: "Segmented perimeter light rails",
    level: "meso",
    role: "static-part",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "surface-relief",
    topologyRationale: "Thin emissive strips mounted within shell channels.",
    geometryDescriptor: {
      topologyIntent: "Thin emissive strips mounted within shell channels.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.008, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "upper-shell",
    attachment: null,
    dimensions: { width: 11.4, height: 0.1, depth: 5.35, units: "model-units", confidence: 0.9 },
    transform: { position: [0, -0.06, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "static-part",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [11.4, 0.1, 5.35],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "tabletop",
        seamRefs: ["upper-shell/light-rails"],
        detachableFragments: ["light-rails"],
        breakImpulse: 12,
        debrisMaterial: "cyan-emissive",
      },
    },
    material: "cyan-emissive",
    materialLayers: ["cyan-emissive"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(0, 189, 232, 1.0)",
      secondaryAlbedo: "rgba(0, 242, 255, 1.0)",
      materialClass: "plastic",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_light_rails_5.userData.actionProfile = {
    animationRole: "static-part",
    pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [11.4, 0.1, 5.35],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "tabletop",
      seamRefs: ["upper-shell/light-rails"],
      detachableFragments: ["light-rails"],
      breakImpulse: 12,
      debrisMaterial: "cyan-emissive",
    },
  }
  ;(nodes["upper-shell"] ?? root).add(node_light_rails_5)
  nodes["light-rails"] = node_light_rails_5
  const mesh_light_rails_5Geometry = endpoint_light_rails_5
    ? new THREE.CylinderGeometry(
        endpoint_light_rails_5.endRadius,
        endpoint_light_rails_5.baseRadius,
        endpoint_light_rails_5.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_light_rails_5) {
    mesh_light_rails_5Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_light_rails_5 = new THREE.Mesh(
    mesh_light_rails_5Geometry,
    materialMap["cyan-emissive"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_light_rails_5.name = "Segmented perimeter light rails"
  if (endpoint_light_rails_5) {
    mesh_light_rails_5.position.copy(endpoint_light_rails_5.midpoint)
    mesh_light_rails_5.quaternion.copy(endpoint_light_rails_5.quaternion)
  }
  mesh_light_rails_5.castShadow = options.castShadow ?? true
  mesh_light_rails_5.receiveShadow = options.receiveShadow ?? true
  mesh_light_rails_5.userData.sculptComponent = {
    id: "light-rails",
    name: "Segmented perimeter light rails",
    level: "meso",
    role: "static-part",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "surface-relief",
    topologyRationale: "Thin emissive strips mounted within shell channels.",
    geometryDescriptor: {
      topologyIntent: "Thin emissive strips mounted within shell channels.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.008, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "upper-shell",
    attachment: null,
    dimensions: { width: 11.4, height: 0.1, depth: 5.35, units: "model-units", confidence: 0.9 },
    transform: { position: [0, -0.06, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "static-part",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [11.4, 0.1, 5.35],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "tabletop",
        seamRefs: ["upper-shell/light-rails"],
        detachableFragments: ["light-rails"],
        breakImpulse: 12,
        debrisMaterial: "cyan-emissive",
      },
    },
    material: "cyan-emissive",
    materialLayers: ["cyan-emissive"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(0, 189, 232, 1.0)",
      secondaryAlbedo: "rgba(0, 242, 255, 1.0)",
      materialClass: "plastic",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_light_rails_5.add(mesh_light_rails_5)
  meshes["light-rails"] = mesh_light_rails_5
  colliders["light-rails"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [11.4, 0.1, 5.35],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["tabletop"] ??= []
  destructionGroups["tabletop"].push(node_light_rails_5)

  const attachment_control_pods_6 = null
  const endpoint_control_pods_6 = makeAttachmentEndpoint(attachment_control_pods_6)
  const node_control_pods_6 = new THREE.Group()
  node_control_pods_6.name = "Corner control pod system__pivot"
  node_control_pods_6.scale.set(1, 1, 1)
  if (endpoint_control_pods_6) {
    node_control_pods_6.position.copy(endpoint_control_pods_6.start)
    node_control_pods_6.rotation.set(0.0, 0.0, 0.0)
  } else {
    node_control_pods_6.position.set(0.0, 0.17, 0.0)
    node_control_pods_6.rotation.set(0.0, 0.0, 0.0)
  }
  node_control_pods_6.userData.sculptComponent = {
    id: "control-pods",
    name: "Corner control pod system",
    level: "meso",
    role: "static-part",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Four discrete rigid pods integrated into the shell corners.",
    geometryDescriptor: {
      topologyIntent: "Four discrete rigid pods integrated into the shell corners.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.011200000000000002, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "upper-shell",
    attachment: null,
    dimensions: { width: 11.1, height: 0.14, depth: 4.9, units: "model-units", confidence: 0.9 },
    transform: { position: [0, 0.17, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "static-part",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [11.1, 0.14, 4.9],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "tabletop",
        seamRefs: ["upper-shell/control-pods"],
        detachableFragments: ["control-pods"],
        breakImpulse: 12,
        debrisMaterial: "black-chassis",
      },
    },
    material: "black-chassis",
    materialLayers: ["black-chassis"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "triangle-buttons",
        type: "emissive",
        placement: "four upper corners",
        geometryEffect: "inset extruded triangles",
        confidence: 0.92,
      },
      {
        id: "vent-slots",
        type: "hole",
        placement: "corner pod arrays",
        geometryEffect: "recessed dark slots with cyan cores",
        confidence: 0.87,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(8, 14, 27, 1.0)",
      secondaryAlbedo: "rgba(17, 26, 44, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_control_pods_6.userData.actionProfile = {
    animationRole: "static-part",
    pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [11.1, 0.14, 4.9],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "tabletop",
      seamRefs: ["upper-shell/control-pods"],
      detachableFragments: ["control-pods"],
      breakImpulse: 12,
      debrisMaterial: "black-chassis",
    },
  }
  ;(nodes["upper-shell"] ?? root).add(node_control_pods_6)
  nodes["control-pods"] = node_control_pods_6
  const mesh_control_pods_6Geometry = endpoint_control_pods_6
    ? new THREE.CylinderGeometry(
        endpoint_control_pods_6.endRadius,
        endpoint_control_pods_6.baseRadius,
        endpoint_control_pods_6.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_control_pods_6) {
    mesh_control_pods_6Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_control_pods_6 = new THREE.Mesh(
    mesh_control_pods_6Geometry,
    materialMap["black-chassis"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_control_pods_6.name = "Corner control pod system"
  if (endpoint_control_pods_6) {
    mesh_control_pods_6.position.copy(endpoint_control_pods_6.midpoint)
    mesh_control_pods_6.quaternion.copy(endpoint_control_pods_6.quaternion)
  }
  mesh_control_pods_6.castShadow = options.castShadow ?? true
  mesh_control_pods_6.receiveShadow = options.receiveShadow ?? true
  mesh_control_pods_6.userData.sculptComponent = {
    id: "control-pods",
    name: "Corner control pod system",
    level: "meso",
    role: "static-part",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Four discrete rigid pods integrated into the shell corners.",
    geometryDescriptor: {
      topologyIntent: "Four discrete rigid pods integrated into the shell corners.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.011200000000000002, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "upper-shell",
    attachment: null,
    dimensions: { width: 11.1, height: 0.14, depth: 4.9, units: "model-units", confidence: 0.9 },
    transform: { position: [0, 0.17, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "static-part",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [11.1, 0.14, 4.9],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "tabletop",
        seamRefs: ["upper-shell/control-pods"],
        detachableFragments: ["control-pods"],
        breakImpulse: 12,
        debrisMaterial: "black-chassis",
      },
    },
    material: "black-chassis",
    materialLayers: ["black-chassis"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "triangle-buttons",
        type: "emissive",
        placement: "four upper corners",
        geometryEffect: "inset extruded triangles",
        confidence: 0.92,
      },
      {
        id: "vent-slots",
        type: "hole",
        placement: "corner pod arrays",
        geometryEffect: "recessed dark slots with cyan cores",
        confidence: 0.87,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(8, 14, 27, 1.0)",
      secondaryAlbedo: "rgba(17, 26, 44, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_control_pods_6.add(mesh_control_pods_6)
  meshes["control-pods"] = mesh_control_pods_6
  colliders["control-pods"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [11.1, 0.14, 4.9],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["tabletop"] ??= []
  destructionGroups["tabletop"].push(node_control_pods_6)

  const attachment_front_latch_7 = null
  const endpoint_front_latch_7 = makeAttachmentEndpoint(attachment_front_latch_7)
  const node_front_latch_7 = new THREE.Group()
  node_front_latch_7.name = "Front center latch__pivot"
  node_front_latch_7.scale.set(1, 1, 1)
  if (endpoint_front_latch_7) {
    node_front_latch_7.position.copy(endpoint_front_latch_7.start)
    node_front_latch_7.rotation.set(0.0, 0.0, 0.0)
  } else {
    node_front_latch_7.position.set(0.0, 0.0, 2.96)
    node_front_latch_7.rotation.set(0.0, 0.0, 0.0)
  }
  node_front_latch_7.userData.sculptComponent = {
    id: "front-latch",
    name: "Front center latch",
    level: "micro",
    role: "static-part",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Small rigid latch seated in the front bumper.",
    geometryDescriptor: {
      topologyIntent: "Small rigid latch seated in the front bumper.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0144, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "lower-chassis",
    attachment: null,
    dimensions: { width: 0.68, height: 0.22, depth: 0.18, units: "model-units", confidence: 0.9 },
    transform: { position: [0, 0, 2.96], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "static-part",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.68, 0.22, 0.18],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "tabletop",
        seamRefs: ["lower-chassis/front-latch"],
        detachableFragments: ["front-latch"],
        breakImpulse: 12,
        debrisMaterial: "silver-shell",
      },
    },
    material: "silver-shell",
    materialLayers: ["silver-shell"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(168, 185, 223, 1.0)",
      secondaryAlbedo: "rgba(127, 143, 192, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_front_latch_7.userData.actionProfile = {
    animationRole: "static-part",
    pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [0.68, 0.22, 0.18],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "tabletop",
      seamRefs: ["lower-chassis/front-latch"],
      detachableFragments: ["front-latch"],
      breakImpulse: 12,
      debrisMaterial: "silver-shell",
    },
  }
  ;(nodes["lower-chassis"] ?? root).add(node_front_latch_7)
  nodes["front-latch"] = node_front_latch_7
  const mesh_front_latch_7Geometry = endpoint_front_latch_7
    ? new THREE.CylinderGeometry(
        endpoint_front_latch_7.endRadius,
        endpoint_front_latch_7.baseRadius,
        endpoint_front_latch_7.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_front_latch_7) {
    mesh_front_latch_7Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_front_latch_7 = new THREE.Mesh(
    mesh_front_latch_7Geometry,
    materialMap["silver-shell"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_front_latch_7.name = "Front center latch"
  if (endpoint_front_latch_7) {
    mesh_front_latch_7.position.copy(endpoint_front_latch_7.midpoint)
    mesh_front_latch_7.quaternion.copy(endpoint_front_latch_7.quaternion)
  }
  mesh_front_latch_7.castShadow = options.castShadow ?? true
  mesh_front_latch_7.receiveShadow = options.receiveShadow ?? true
  mesh_front_latch_7.userData.sculptComponent = {
    id: "front-latch",
    name: "Front center latch",
    level: "micro",
    role: "static-part",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Small rigid latch seated in the front bumper.",
    geometryDescriptor: {
      topologyIntent: "Small rigid latch seated in the front bumper.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0144, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "lower-chassis",
    attachment: null,
    dimensions: { width: 0.68, height: 0.22, depth: 0.18, units: "model-units", confidence: 0.9 },
    transform: { position: [0, 0, 2.96], rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "static-part",
      pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.68, 0.22, 0.18],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "tabletop",
        seamRefs: ["lower-chassis/front-latch"],
        detachableFragments: ["front-latch"],
        breakImpulse: 12,
        debrisMaterial: "silver-shell",
      },
    },
    material: "silver-shell",
    materialLayers: ["silver-shell"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(168, 185, 223, 1.0)",
      secondaryAlbedo: "rgba(127, 143, 192, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_front_latch_7.add(mesh_front_latch_7)
  meshes["front-latch"] = mesh_front_latch_7
  colliders["front-latch"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [0.68, 0.22, 0.18],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["tabletop"] ??= []
  destructionGroups["tabletop"].push(node_front_latch_7)

  const attachment_leg_left_rear_hip_8 = {
    parentId: "lower-chassis",
    parentSocket: "socket-leg-left-rear",
    localStart: [-4.6, 1.55, -2.1],
    localEnd: [-5.05, 0.15, -2.35],
    baseRadius: 0.38,
    endRadius: 0.28,
    overlap: 0.12,
    embedDepth: 0.08,
    contactType: "socket",
    gapTolerance: 0.02,
    evidenceRefs: ["full-object"],
  }
  const endpoint_leg_left_rear_hip_8 = makeAttachmentEndpoint(attachment_leg_left_rear_hip_8)
  const node_leg_left_rear_hip_8 = new THREE.Group()
  node_leg_left_rear_hip_8.name = "left-rear hip joint__pivot"
  node_leg_left_rear_hip_8.scale.set(1, 1, 1)
  if (endpoint_leg_left_rear_hip_8) {
    node_leg_left_rear_hip_8.position.copy(endpoint_leg_left_rear_hip_8.start)
    node_leg_left_rear_hip_8.rotation.set(1.5707963267948966, 0.0, 0.0)
  } else {
    node_leg_left_rear_hip_8.position.set(-4.6, 1.55, -2.1)
    node_leg_left_rear_hip_8.rotation.set(1.5707963267948966, 0.0, 0.0)
  }
  node_leg_left_rear_hip_8.userData.sculptComponent = {
    id: "leg-left-rear-hip",
    name: "left-rear hip joint",
    level: "meso",
    role: "joint",
    importance: 1,
    confidence: 0.9,
    primitive: "cylinder",
    topologyClass: "assembled-solid",
    topologyRationale: "Cylindrical socket joint connecting leg to chassis.",
    geometryDescriptor: {
      topologyIntent: "Cylindrical socket joint connecting leg to chassis.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0336, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "lower-chassis",
    attachment: {
      parentId: "lower-chassis",
      parentSocket: "socket-leg-left-rear",
      localStart: [-4.6, 1.55, -2.1],
      localEnd: [-5.05, 0.15, -2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "socket",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.76, height: 0.42, depth: 0.76, units: "model-units", confidence: 0.9 },
    transform: {
      position: [-4.6, 1.55, -2.1],
      rotation: [1.5707963267948966, 0, 0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "joint",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "cylinder",
        offset: [0, 0, 0],
        scale: [0.76, 0.42, 0.76],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-left-rear",
        seamRefs: ["lower-chassis/leg-left-rear-hip"],
        detachableFragments: ["leg-left-rear-hip"],
        breakImpulse: 8,
        debrisMaterial: "black-chassis",
      },
    },
    material: "black-chassis",
    materialLayers: ["black-chassis"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "joint-rings",
        type: "emissive",
        placement: "hip axes",
        geometryEffect: "torus ring",
        confidence: 0.9,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(8, 14, 27, 1.0)",
      secondaryAlbedo: "rgba(17, 26, 44, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_left_rear_hip_8.userData.actionProfile = {
    animationRole: "joint",
    pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "cylinder",
      offset: [0, 0, 0],
      scale: [0.76, 0.42, 0.76],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "leg-left-rear",
      seamRefs: ["lower-chassis/leg-left-rear-hip"],
      detachableFragments: ["leg-left-rear-hip"],
      breakImpulse: 8,
      debrisMaterial: "black-chassis",
    },
  }
  ;(nodes["lower-chassis"] ?? root).add(node_leg_left_rear_hip_8)
  nodes["leg-left-rear-hip"] = node_leg_left_rear_hip_8
  const mesh_leg_left_rear_hip_8Geometry = endpoint_leg_left_rear_hip_8
    ? new THREE.CylinderGeometry(
        endpoint_leg_left_rear_hip_8.endRadius,
        endpoint_leg_left_rear_hip_8.baseRadius,
        endpoint_leg_left_rear_hip_8.length,
        32,
        12,
      )
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16)
  if (!endpoint_leg_left_rear_hip_8) {
    mesh_leg_left_rear_hip_8Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_leg_left_rear_hip_8 = new THREE.Mesh(
    mesh_leg_left_rear_hip_8Geometry,
    materialMap["black-chassis"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_leg_left_rear_hip_8.name = "left-rear hip joint"
  if (endpoint_leg_left_rear_hip_8) {
    mesh_leg_left_rear_hip_8.position.copy(endpoint_leg_left_rear_hip_8.midpoint)
    mesh_leg_left_rear_hip_8.quaternion.copy(endpoint_leg_left_rear_hip_8.quaternion)
  }
  mesh_leg_left_rear_hip_8.castShadow = options.castShadow ?? true
  mesh_leg_left_rear_hip_8.receiveShadow = options.receiveShadow ?? true
  mesh_leg_left_rear_hip_8.userData.sculptComponent = {
    id: "leg-left-rear-hip",
    name: "left-rear hip joint",
    level: "meso",
    role: "joint",
    importance: 1,
    confidence: 0.9,
    primitive: "cylinder",
    topologyClass: "assembled-solid",
    topologyRationale: "Cylindrical socket joint connecting leg to chassis.",
    geometryDescriptor: {
      topologyIntent: "Cylindrical socket joint connecting leg to chassis.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0336, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "lower-chassis",
    attachment: {
      parentId: "lower-chassis",
      parentSocket: "socket-leg-left-rear",
      localStart: [-4.6, 1.55, -2.1],
      localEnd: [-5.05, 0.15, -2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "socket",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.76, height: 0.42, depth: 0.76, units: "model-units", confidence: 0.9 },
    transform: {
      position: [-4.6, 1.55, -2.1],
      rotation: [1.5707963267948966, 0, 0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "joint",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "cylinder",
        offset: [0, 0, 0],
        scale: [0.76, 0.42, 0.76],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-left-rear",
        seamRefs: ["lower-chassis/leg-left-rear-hip"],
        detachableFragments: ["leg-left-rear-hip"],
        breakImpulse: 8,
        debrisMaterial: "black-chassis",
      },
    },
    material: "black-chassis",
    materialLayers: ["black-chassis"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "joint-rings",
        type: "emissive",
        placement: "hip axes",
        geometryEffect: "torus ring",
        confidence: 0.9,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(8, 14, 27, 1.0)",
      secondaryAlbedo: "rgba(17, 26, 44, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_left_rear_hip_8.add(mesh_leg_left_rear_hip_8)
  meshes["leg-left-rear-hip"] = mesh_leg_left_rear_hip_8
  colliders["leg-left-rear-hip"] = {
    type: "cylinder",
    offset: [0, 0, 0],
    scale: [0.76, 0.42, 0.76],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["leg-left-rear"] ??= []
  destructionGroups["leg-left-rear"].push(node_leg_left_rear_hip_8)

  const attachment_leg_left_rear_upper_9 = {
    parentId: "leg-left-rear-hip",
    parentSocket: "socket-strut-left-rear",
    localStart: [-4.6, 1.55, -2.1],
    localEnd: [-5.05, 0.15, -2.35],
    baseRadius: 0.38,
    endRadius: 0.28,
    overlap: 0.12,
    embedDepth: 0.08,
    contactType: "overlap",
    gapTolerance: 0.02,
    evidenceRefs: ["full-object"],
  }
  const endpoint_leg_left_rear_upper_9 = makeAttachmentEndpoint(attachment_leg_left_rear_upper_9)
  const node_leg_left_rear_upper_9 = new THREE.Group()
  node_leg_left_rear_upper_9.name = "left-rear upper strut__pivot"
  node_leg_left_rear_upper_9.scale.set(1, 1, 1)
  if (endpoint_leg_left_rear_upper_9) {
    node_leg_left_rear_upper_9.position.copy(endpoint_leg_left_rear_upper_9.start)
    node_leg_left_rear_upper_9.rotation.set(0.0, 0.0, 0.28)
  } else {
    node_leg_left_rear_upper_9.position.set(-5.05, 0.15, -2.35)
    node_leg_left_rear_upper_9.rotation.set(0.0, 0.0, 0.28)
  }
  node_leg_left_rear_upper_9.userData.sculptComponent = {
    id: "leg-left-rear-upper",
    name: "left-rear upper strut",
    level: "macro",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored strut with rigid countable faces.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored strut with rigid countable faces.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0464, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-left-rear-hip",
    attachment: {
      parentId: "leg-left-rear-hip",
      parentSocket: "socket-strut-left-rear",
      localStart: [-4.6, 1.55, -2.1],
      localEnd: [-5.05, 0.15, -2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.72, height: 1.9, depth: 0.58, units: "model-units", confidence: 0.9 },
    transform: { position: [-5.05, 0.15, -2.35], rotation: [0, 0, 0.28], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.72, 1.9, 0.58],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-left-rear",
        seamRefs: ["leg-left-rear-hip/leg-left-rear-upper"],
        detachableFragments: ["leg-left-rear-upper"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_left_rear_upper_9.userData.actionProfile = {
    animationRole: "leg",
    pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [0.72, 1.9, 0.58],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "leg-left-rear",
      seamRefs: ["leg-left-rear-hip/leg-left-rear-upper"],
      detachableFragments: ["leg-left-rear-upper"],
      breakImpulse: 8,
      debrisMaterial: "blue-armor",
    },
  }
  ;(nodes["leg-left-rear-hip"] ?? root).add(node_leg_left_rear_upper_9)
  nodes["leg-left-rear-upper"] = node_leg_left_rear_upper_9
  const mesh_leg_left_rear_upper_9Geometry = endpoint_leg_left_rear_upper_9
    ? new THREE.CylinderGeometry(
        endpoint_leg_left_rear_upper_9.endRadius,
        endpoint_leg_left_rear_upper_9.baseRadius,
        endpoint_leg_left_rear_upper_9.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_leg_left_rear_upper_9) {
    mesh_leg_left_rear_upper_9Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_leg_left_rear_upper_9 = new THREE.Mesh(
    mesh_leg_left_rear_upper_9Geometry,
    materialMap["blue-armor"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_leg_left_rear_upper_9.name = "left-rear upper strut"
  if (endpoint_leg_left_rear_upper_9) {
    mesh_leg_left_rear_upper_9.position.copy(endpoint_leg_left_rear_upper_9.midpoint)
    mesh_leg_left_rear_upper_9.quaternion.copy(endpoint_leg_left_rear_upper_9.quaternion)
  }
  mesh_leg_left_rear_upper_9.castShadow = options.castShadow ?? true
  mesh_leg_left_rear_upper_9.receiveShadow = options.receiveShadow ?? true
  mesh_leg_left_rear_upper_9.userData.sculptComponent = {
    id: "leg-left-rear-upper",
    name: "left-rear upper strut",
    level: "macro",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored strut with rigid countable faces.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored strut with rigid countable faces.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0464, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-left-rear-hip",
    attachment: {
      parentId: "leg-left-rear-hip",
      parentSocket: "socket-strut-left-rear",
      localStart: [-4.6, 1.55, -2.1],
      localEnd: [-5.05, 0.15, -2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.72, height: 1.9, depth: 0.58, units: "model-units", confidence: 0.9 },
    transform: { position: [-5.05, 0.15, -2.35], rotation: [0, 0, 0.28], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.72, 1.9, 0.58],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-left-rear",
        seamRefs: ["leg-left-rear-hip/leg-left-rear-upper"],
        detachableFragments: ["leg-left-rear-upper"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_left_rear_upper_9.add(mesh_leg_left_rear_upper_9)
  meshes["leg-left-rear-upper"] = mesh_leg_left_rear_upper_9
  colliders["leg-left-rear-upper"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [0.72, 1.9, 0.58],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["leg-left-rear"] ??= []
  destructionGroups["leg-left-rear"].push(node_leg_left_rear_upper_9)

  const attachment_leg_left_rear_lower_10 = {
    parentId: "leg-left-rear-upper",
    parentSocket: "socket-knee-left-rear",
    localStart: [-5.05, 0.15, -2.35],
    localEnd: [-5.45, -1.55, -2.65],
    baseRadius: 0.38,
    endRadius: 0.28,
    overlap: 0.12,
    embedDepth: 0.08,
    contactType: "overlap",
    gapTolerance: 0.02,
    evidenceRefs: ["full-object"],
  }
  const endpoint_leg_left_rear_lower_10 = makeAttachmentEndpoint(attachment_leg_left_rear_lower_10)
  const node_leg_left_rear_lower_10 = new THREE.Group()
  node_leg_left_rear_lower_10.name = "left-rear lower strut and foot__pivot"
  node_leg_left_rear_lower_10.scale.set(1, 1, 1)
  if (endpoint_leg_left_rear_lower_10) {
    node_leg_left_rear_lower_10.position.copy(endpoint_leg_left_rear_lower_10.start)
    node_leg_left_rear_lower_10.rotation.set(0.0, 0.0, 0.34)
  } else {
    node_leg_left_rear_lower_10.position.set(-5.45, -1.55, -2.65)
    node_leg_left_rear_lower_10.rotation.set(0.0, 0.0, 0.34)
  }
  node_leg_left_rear_lower_10.userData.sculptComponent = {
    id: "leg-left-rear-lower",
    name: "left-rear lower strut and foot",
    level: "meso",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored lower strut ending in a broad contact foot.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored lower strut ending in a broad contact foot.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.055999999999999994, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-left-rear-upper",
    attachment: {
      parentId: "leg-left-rear-upper",
      parentSocket: "socket-knee-left-rear",
      localStart: [-5.05, 0.15, -2.35],
      localEnd: [-5.45, -1.55, -2.65],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.82, height: 1.95, depth: 0.7, units: "model-units", confidence: 0.9 },
    transform: { position: [-5.45, -1.55, -2.65], rotation: [0, 0, 0.34], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.82, 1.95, 0.7],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-left-rear",
        seamRefs: ["leg-left-rear-upper/leg-left-rear-lower"],
        detachableFragments: ["leg-left-rear-lower"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_left_rear_lower_10.userData.actionProfile = {
    animationRole: "leg",
    pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [0.82, 1.95, 0.7],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "leg-left-rear",
      seamRefs: ["leg-left-rear-upper/leg-left-rear-lower"],
      detachableFragments: ["leg-left-rear-lower"],
      breakImpulse: 8,
      debrisMaterial: "blue-armor",
    },
  }
  ;(nodes["leg-left-rear-upper"] ?? root).add(node_leg_left_rear_lower_10)
  nodes["leg-left-rear-lower"] = node_leg_left_rear_lower_10
  const mesh_leg_left_rear_lower_10Geometry = endpoint_leg_left_rear_lower_10
    ? new THREE.CylinderGeometry(
        endpoint_leg_left_rear_lower_10.endRadius,
        endpoint_leg_left_rear_lower_10.baseRadius,
        endpoint_leg_left_rear_lower_10.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_leg_left_rear_lower_10) {
    mesh_leg_left_rear_lower_10Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_leg_left_rear_lower_10 = new THREE.Mesh(
    mesh_leg_left_rear_lower_10Geometry,
    materialMap["blue-armor"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_leg_left_rear_lower_10.name = "left-rear lower strut and foot"
  if (endpoint_leg_left_rear_lower_10) {
    mesh_leg_left_rear_lower_10.position.copy(endpoint_leg_left_rear_lower_10.midpoint)
    mesh_leg_left_rear_lower_10.quaternion.copy(endpoint_leg_left_rear_lower_10.quaternion)
  }
  mesh_leg_left_rear_lower_10.castShadow = options.castShadow ?? true
  mesh_leg_left_rear_lower_10.receiveShadow = options.receiveShadow ?? true
  mesh_leg_left_rear_lower_10.userData.sculptComponent = {
    id: "leg-left-rear-lower",
    name: "left-rear lower strut and foot",
    level: "meso",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored lower strut ending in a broad contact foot.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored lower strut ending in a broad contact foot.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.055999999999999994, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-left-rear-upper",
    attachment: {
      parentId: "leg-left-rear-upper",
      parentSocket: "socket-knee-left-rear",
      localStart: [-5.05, 0.15, -2.35],
      localEnd: [-5.45, -1.55, -2.65],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.82, height: 1.95, depth: 0.7, units: "model-units", confidence: 0.9 },
    transform: { position: [-5.45, -1.55, -2.65], rotation: [0, 0, 0.34], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.82, 1.95, 0.7],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-left-rear",
        seamRefs: ["leg-left-rear-upper/leg-left-rear-lower"],
        detachableFragments: ["leg-left-rear-lower"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_left_rear_lower_10.add(mesh_leg_left_rear_lower_10)
  meshes["leg-left-rear-lower"] = mesh_leg_left_rear_lower_10
  colliders["leg-left-rear-lower"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [0.82, 1.95, 0.7],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["leg-left-rear"] ??= []
  destructionGroups["leg-left-rear"].push(node_leg_left_rear_lower_10)

  const attachment_leg_left_front_hip_11 = {
    parentId: "lower-chassis",
    parentSocket: "socket-leg-left-front",
    localStart: [-4.6, 1.55, 2.1],
    localEnd: [-5.05, 0.15, 2.35],
    baseRadius: 0.38,
    endRadius: 0.28,
    overlap: 0.12,
    embedDepth: 0.08,
    contactType: "socket",
    gapTolerance: 0.02,
    evidenceRefs: ["full-object"],
  }
  const endpoint_leg_left_front_hip_11 = makeAttachmentEndpoint(attachment_leg_left_front_hip_11)
  const node_leg_left_front_hip_11 = new THREE.Group()
  node_leg_left_front_hip_11.name = "left-front hip joint__pivot"
  node_leg_left_front_hip_11.scale.set(1, 1, 1)
  if (endpoint_leg_left_front_hip_11) {
    node_leg_left_front_hip_11.position.copy(endpoint_leg_left_front_hip_11.start)
    node_leg_left_front_hip_11.rotation.set(1.5707963267948966, 0.0, 0.0)
  } else {
    node_leg_left_front_hip_11.position.set(-4.6, 1.55, 2.1)
    node_leg_left_front_hip_11.rotation.set(1.5707963267948966, 0.0, 0.0)
  }
  node_leg_left_front_hip_11.userData.sculptComponent = {
    id: "leg-left-front-hip",
    name: "left-front hip joint",
    level: "meso",
    role: "joint",
    importance: 1,
    confidence: 0.9,
    primitive: "cylinder",
    topologyClass: "assembled-solid",
    topologyRationale: "Cylindrical socket joint connecting leg to chassis.",
    geometryDescriptor: {
      topologyIntent: "Cylindrical socket joint connecting leg to chassis.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0336, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "lower-chassis",
    attachment: {
      parentId: "lower-chassis",
      parentSocket: "socket-leg-left-front",
      localStart: [-4.6, 1.55, 2.1],
      localEnd: [-5.05, 0.15, 2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "socket",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.76, height: 0.42, depth: 0.76, units: "model-units", confidence: 0.9 },
    transform: {
      position: [-4.6, 1.55, 2.1],
      rotation: [1.5707963267948966, 0, 0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "joint",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "cylinder",
        offset: [0, 0, 0],
        scale: [0.76, 0.42, 0.76],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-left-front",
        seamRefs: ["lower-chassis/leg-left-front-hip"],
        detachableFragments: ["leg-left-front-hip"],
        breakImpulse: 8,
        debrisMaterial: "black-chassis",
      },
    },
    material: "black-chassis",
    materialLayers: ["black-chassis"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "joint-rings",
        type: "emissive",
        placement: "hip axes",
        geometryEffect: "torus ring",
        confidence: 0.9,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(8, 14, 27, 1.0)",
      secondaryAlbedo: "rgba(17, 26, 44, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_left_front_hip_11.userData.actionProfile = {
    animationRole: "joint",
    pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "cylinder",
      offset: [0, 0, 0],
      scale: [0.76, 0.42, 0.76],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "leg-left-front",
      seamRefs: ["lower-chassis/leg-left-front-hip"],
      detachableFragments: ["leg-left-front-hip"],
      breakImpulse: 8,
      debrisMaterial: "black-chassis",
    },
  }
  ;(nodes["lower-chassis"] ?? root).add(node_leg_left_front_hip_11)
  nodes["leg-left-front-hip"] = node_leg_left_front_hip_11
  const mesh_leg_left_front_hip_11Geometry = endpoint_leg_left_front_hip_11
    ? new THREE.CylinderGeometry(
        endpoint_leg_left_front_hip_11.endRadius,
        endpoint_leg_left_front_hip_11.baseRadius,
        endpoint_leg_left_front_hip_11.length,
        32,
        12,
      )
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16)
  if (!endpoint_leg_left_front_hip_11) {
    mesh_leg_left_front_hip_11Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_leg_left_front_hip_11 = new THREE.Mesh(
    mesh_leg_left_front_hip_11Geometry,
    materialMap["black-chassis"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_leg_left_front_hip_11.name = "left-front hip joint"
  if (endpoint_leg_left_front_hip_11) {
    mesh_leg_left_front_hip_11.position.copy(endpoint_leg_left_front_hip_11.midpoint)
    mesh_leg_left_front_hip_11.quaternion.copy(endpoint_leg_left_front_hip_11.quaternion)
  }
  mesh_leg_left_front_hip_11.castShadow = options.castShadow ?? true
  mesh_leg_left_front_hip_11.receiveShadow = options.receiveShadow ?? true
  mesh_leg_left_front_hip_11.userData.sculptComponent = {
    id: "leg-left-front-hip",
    name: "left-front hip joint",
    level: "meso",
    role: "joint",
    importance: 1,
    confidence: 0.9,
    primitive: "cylinder",
    topologyClass: "assembled-solid",
    topologyRationale: "Cylindrical socket joint connecting leg to chassis.",
    geometryDescriptor: {
      topologyIntent: "Cylindrical socket joint connecting leg to chassis.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0336, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "lower-chassis",
    attachment: {
      parentId: "lower-chassis",
      parentSocket: "socket-leg-left-front",
      localStart: [-4.6, 1.55, 2.1],
      localEnd: [-5.05, 0.15, 2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "socket",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.76, height: 0.42, depth: 0.76, units: "model-units", confidence: 0.9 },
    transform: {
      position: [-4.6, 1.55, 2.1],
      rotation: [1.5707963267948966, 0, 0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "joint",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "cylinder",
        offset: [0, 0, 0],
        scale: [0.76, 0.42, 0.76],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-left-front",
        seamRefs: ["lower-chassis/leg-left-front-hip"],
        detachableFragments: ["leg-left-front-hip"],
        breakImpulse: 8,
        debrisMaterial: "black-chassis",
      },
    },
    material: "black-chassis",
    materialLayers: ["black-chassis"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "joint-rings",
        type: "emissive",
        placement: "hip axes",
        geometryEffect: "torus ring",
        confidence: 0.9,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(8, 14, 27, 1.0)",
      secondaryAlbedo: "rgba(17, 26, 44, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_left_front_hip_11.add(mesh_leg_left_front_hip_11)
  meshes["leg-left-front-hip"] = mesh_leg_left_front_hip_11
  colliders["leg-left-front-hip"] = {
    type: "cylinder",
    offset: [0, 0, 0],
    scale: [0.76, 0.42, 0.76],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["leg-left-front"] ??= []
  destructionGroups["leg-left-front"].push(node_leg_left_front_hip_11)

  const attachment_leg_left_front_upper_12 = {
    parentId: "leg-left-front-hip",
    parentSocket: "socket-strut-left-front",
    localStart: [-4.6, 1.55, 2.1],
    localEnd: [-5.05, 0.15, 2.35],
    baseRadius: 0.38,
    endRadius: 0.28,
    overlap: 0.12,
    embedDepth: 0.08,
    contactType: "overlap",
    gapTolerance: 0.02,
    evidenceRefs: ["full-object"],
  }
  const endpoint_leg_left_front_upper_12 = makeAttachmentEndpoint(
    attachment_leg_left_front_upper_12,
  )
  const node_leg_left_front_upper_12 = new THREE.Group()
  node_leg_left_front_upper_12.name = "left-front upper strut__pivot"
  node_leg_left_front_upper_12.scale.set(1, 1, 1)
  if (endpoint_leg_left_front_upper_12) {
    node_leg_left_front_upper_12.position.copy(endpoint_leg_left_front_upper_12.start)
    node_leg_left_front_upper_12.rotation.set(0.0, 0.0, 0.28)
  } else {
    node_leg_left_front_upper_12.position.set(-5.05, 0.15, 2.35)
    node_leg_left_front_upper_12.rotation.set(0.0, 0.0, 0.28)
  }
  node_leg_left_front_upper_12.userData.sculptComponent = {
    id: "leg-left-front-upper",
    name: "left-front upper strut",
    level: "macro",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored strut with rigid countable faces.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored strut with rigid countable faces.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0464, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-left-front-hip",
    attachment: {
      parentId: "leg-left-front-hip",
      parentSocket: "socket-strut-left-front",
      localStart: [-4.6, 1.55, 2.1],
      localEnd: [-5.05, 0.15, 2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.72, height: 1.9, depth: 0.58, units: "model-units", confidence: 0.9 },
    transform: { position: [-5.05, 0.15, 2.35], rotation: [0, 0, 0.28], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.72, 1.9, 0.58],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-left-front",
        seamRefs: ["leg-left-front-hip/leg-left-front-upper"],
        detachableFragments: ["leg-left-front-upper"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_left_front_upper_12.userData.actionProfile = {
    animationRole: "leg",
    pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [0.72, 1.9, 0.58],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "leg-left-front",
      seamRefs: ["leg-left-front-hip/leg-left-front-upper"],
      detachableFragments: ["leg-left-front-upper"],
      breakImpulse: 8,
      debrisMaterial: "blue-armor",
    },
  }
  ;(nodes["leg-left-front-hip"] ?? root).add(node_leg_left_front_upper_12)
  nodes["leg-left-front-upper"] = node_leg_left_front_upper_12
  const mesh_leg_left_front_upper_12Geometry = endpoint_leg_left_front_upper_12
    ? new THREE.CylinderGeometry(
        endpoint_leg_left_front_upper_12.endRadius,
        endpoint_leg_left_front_upper_12.baseRadius,
        endpoint_leg_left_front_upper_12.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_leg_left_front_upper_12) {
    mesh_leg_left_front_upper_12Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_leg_left_front_upper_12 = new THREE.Mesh(
    mesh_leg_left_front_upper_12Geometry,
    materialMap["blue-armor"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_leg_left_front_upper_12.name = "left-front upper strut"
  if (endpoint_leg_left_front_upper_12) {
    mesh_leg_left_front_upper_12.position.copy(endpoint_leg_left_front_upper_12.midpoint)
    mesh_leg_left_front_upper_12.quaternion.copy(endpoint_leg_left_front_upper_12.quaternion)
  }
  mesh_leg_left_front_upper_12.castShadow = options.castShadow ?? true
  mesh_leg_left_front_upper_12.receiveShadow = options.receiveShadow ?? true
  mesh_leg_left_front_upper_12.userData.sculptComponent = {
    id: "leg-left-front-upper",
    name: "left-front upper strut",
    level: "macro",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored strut with rigid countable faces.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored strut with rigid countable faces.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0464, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-left-front-hip",
    attachment: {
      parentId: "leg-left-front-hip",
      parentSocket: "socket-strut-left-front",
      localStart: [-4.6, 1.55, 2.1],
      localEnd: [-5.05, 0.15, 2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.72, height: 1.9, depth: 0.58, units: "model-units", confidence: 0.9 },
    transform: { position: [-5.05, 0.15, 2.35], rotation: [0, 0, 0.28], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.72, 1.9, 0.58],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-left-front",
        seamRefs: ["leg-left-front-hip/leg-left-front-upper"],
        detachableFragments: ["leg-left-front-upper"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_left_front_upper_12.add(mesh_leg_left_front_upper_12)
  meshes["leg-left-front-upper"] = mesh_leg_left_front_upper_12
  colliders["leg-left-front-upper"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [0.72, 1.9, 0.58],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["leg-left-front"] ??= []
  destructionGroups["leg-left-front"].push(node_leg_left_front_upper_12)

  const attachment_leg_left_front_lower_13 = {
    parentId: "leg-left-front-upper",
    parentSocket: "socket-knee-left-front",
    localStart: [-5.05, 0.15, 2.35],
    localEnd: [-5.45, -1.55, 2.65],
    baseRadius: 0.38,
    endRadius: 0.28,
    overlap: 0.12,
    embedDepth: 0.08,
    contactType: "overlap",
    gapTolerance: 0.02,
    evidenceRefs: ["full-object"],
  }
  const endpoint_leg_left_front_lower_13 = makeAttachmentEndpoint(
    attachment_leg_left_front_lower_13,
  )
  const node_leg_left_front_lower_13 = new THREE.Group()
  node_leg_left_front_lower_13.name = "left-front lower strut and foot__pivot"
  node_leg_left_front_lower_13.scale.set(1, 1, 1)
  if (endpoint_leg_left_front_lower_13) {
    node_leg_left_front_lower_13.position.copy(endpoint_leg_left_front_lower_13.start)
    node_leg_left_front_lower_13.rotation.set(0.0, 0.0, 0.34)
  } else {
    node_leg_left_front_lower_13.position.set(-5.45, -1.55, 2.65)
    node_leg_left_front_lower_13.rotation.set(0.0, 0.0, 0.34)
  }
  node_leg_left_front_lower_13.userData.sculptComponent = {
    id: "leg-left-front-lower",
    name: "left-front lower strut and foot",
    level: "meso",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored lower strut ending in a broad contact foot.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored lower strut ending in a broad contact foot.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.055999999999999994, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-left-front-upper",
    attachment: {
      parentId: "leg-left-front-upper",
      parentSocket: "socket-knee-left-front",
      localStart: [-5.05, 0.15, 2.35],
      localEnd: [-5.45, -1.55, 2.65],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.82, height: 1.95, depth: 0.7, units: "model-units", confidence: 0.9 },
    transform: { position: [-5.45, -1.55, 2.65], rotation: [0, 0, 0.34], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.82, 1.95, 0.7],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-left-front",
        seamRefs: ["leg-left-front-upper/leg-left-front-lower"],
        detachableFragments: ["leg-left-front-lower"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_left_front_lower_13.userData.actionProfile = {
    animationRole: "leg",
    pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [0.82, 1.95, 0.7],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "leg-left-front",
      seamRefs: ["leg-left-front-upper/leg-left-front-lower"],
      detachableFragments: ["leg-left-front-lower"],
      breakImpulse: 8,
      debrisMaterial: "blue-armor",
    },
  }
  ;(nodes["leg-left-front-upper"] ?? root).add(node_leg_left_front_lower_13)
  nodes["leg-left-front-lower"] = node_leg_left_front_lower_13
  const mesh_leg_left_front_lower_13Geometry = endpoint_leg_left_front_lower_13
    ? new THREE.CylinderGeometry(
        endpoint_leg_left_front_lower_13.endRadius,
        endpoint_leg_left_front_lower_13.baseRadius,
        endpoint_leg_left_front_lower_13.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_leg_left_front_lower_13) {
    mesh_leg_left_front_lower_13Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_leg_left_front_lower_13 = new THREE.Mesh(
    mesh_leg_left_front_lower_13Geometry,
    materialMap["blue-armor"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_leg_left_front_lower_13.name = "left-front lower strut and foot"
  if (endpoint_leg_left_front_lower_13) {
    mesh_leg_left_front_lower_13.position.copy(endpoint_leg_left_front_lower_13.midpoint)
    mesh_leg_left_front_lower_13.quaternion.copy(endpoint_leg_left_front_lower_13.quaternion)
  }
  mesh_leg_left_front_lower_13.castShadow = options.castShadow ?? true
  mesh_leg_left_front_lower_13.receiveShadow = options.receiveShadow ?? true
  mesh_leg_left_front_lower_13.userData.sculptComponent = {
    id: "leg-left-front-lower",
    name: "left-front lower strut and foot",
    level: "meso",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored lower strut ending in a broad contact foot.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored lower strut ending in a broad contact foot.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.055999999999999994, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-left-front-upper",
    attachment: {
      parentId: "leg-left-front-upper",
      parentSocket: "socket-knee-left-front",
      localStart: [-5.05, 0.15, 2.35],
      localEnd: [-5.45, -1.55, 2.65],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.82, height: 1.95, depth: 0.7, units: "model-units", confidence: 0.9 },
    transform: { position: [-5.45, -1.55, 2.65], rotation: [0, 0, 0.34], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.82, 1.95, 0.7],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-left-front",
        seamRefs: ["leg-left-front-upper/leg-left-front-lower"],
        detachableFragments: ["leg-left-front-lower"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_left_front_lower_13.add(mesh_leg_left_front_lower_13)
  meshes["leg-left-front-lower"] = mesh_leg_left_front_lower_13
  colliders["leg-left-front-lower"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [0.82, 1.95, 0.7],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["leg-left-front"] ??= []
  destructionGroups["leg-left-front"].push(node_leg_left_front_lower_13)

  const attachment_leg_right_rear_hip_14 = {
    parentId: "lower-chassis",
    parentSocket: "socket-leg-right-rear",
    localStart: [4.6, 1.55, -2.1],
    localEnd: [5.05, 0.15, -2.35],
    baseRadius: 0.38,
    endRadius: 0.28,
    overlap: 0.12,
    embedDepth: 0.08,
    contactType: "socket",
    gapTolerance: 0.02,
    evidenceRefs: ["full-object"],
  }
  const endpoint_leg_right_rear_hip_14 = makeAttachmentEndpoint(attachment_leg_right_rear_hip_14)
  const node_leg_right_rear_hip_14 = new THREE.Group()
  node_leg_right_rear_hip_14.name = "right-rear hip joint__pivot"
  node_leg_right_rear_hip_14.scale.set(1, 1, 1)
  if (endpoint_leg_right_rear_hip_14) {
    node_leg_right_rear_hip_14.position.copy(endpoint_leg_right_rear_hip_14.start)
    node_leg_right_rear_hip_14.rotation.set(1.5707963267948966, 0.0, 0.0)
  } else {
    node_leg_right_rear_hip_14.position.set(4.6, 1.55, -2.1)
    node_leg_right_rear_hip_14.rotation.set(1.5707963267948966, 0.0, 0.0)
  }
  node_leg_right_rear_hip_14.userData.sculptComponent = {
    id: "leg-right-rear-hip",
    name: "right-rear hip joint",
    level: "meso",
    role: "joint",
    importance: 1,
    confidence: 0.9,
    primitive: "cylinder",
    topologyClass: "assembled-solid",
    topologyRationale: "Cylindrical socket joint connecting leg to chassis.",
    geometryDescriptor: {
      topologyIntent: "Cylindrical socket joint connecting leg to chassis.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0336, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "lower-chassis",
    attachment: {
      parentId: "lower-chassis",
      parentSocket: "socket-leg-right-rear",
      localStart: [4.6, 1.55, -2.1],
      localEnd: [5.05, 0.15, -2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "socket",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.76, height: 0.42, depth: 0.76, units: "model-units", confidence: 0.9 },
    transform: {
      position: [4.6, 1.55, -2.1],
      rotation: [1.5707963267948966, 0, 0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "joint",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "cylinder",
        offset: [0, 0, 0],
        scale: [0.76, 0.42, 0.76],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-right-rear",
        seamRefs: ["lower-chassis/leg-right-rear-hip"],
        detachableFragments: ["leg-right-rear-hip"],
        breakImpulse: 8,
        debrisMaterial: "black-chassis",
      },
    },
    material: "black-chassis",
    materialLayers: ["black-chassis"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "joint-rings",
        type: "emissive",
        placement: "hip axes",
        geometryEffect: "torus ring",
        confidence: 0.9,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(8, 14, 27, 1.0)",
      secondaryAlbedo: "rgba(17, 26, 44, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_right_rear_hip_14.userData.actionProfile = {
    animationRole: "joint",
    pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "cylinder",
      offset: [0, 0, 0],
      scale: [0.76, 0.42, 0.76],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "leg-right-rear",
      seamRefs: ["lower-chassis/leg-right-rear-hip"],
      detachableFragments: ["leg-right-rear-hip"],
      breakImpulse: 8,
      debrisMaterial: "black-chassis",
    },
  }
  ;(nodes["lower-chassis"] ?? root).add(node_leg_right_rear_hip_14)
  nodes["leg-right-rear-hip"] = node_leg_right_rear_hip_14
  const mesh_leg_right_rear_hip_14Geometry = endpoint_leg_right_rear_hip_14
    ? new THREE.CylinderGeometry(
        endpoint_leg_right_rear_hip_14.endRadius,
        endpoint_leg_right_rear_hip_14.baseRadius,
        endpoint_leg_right_rear_hip_14.length,
        32,
        12,
      )
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16)
  if (!endpoint_leg_right_rear_hip_14) {
    mesh_leg_right_rear_hip_14Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_leg_right_rear_hip_14 = new THREE.Mesh(
    mesh_leg_right_rear_hip_14Geometry,
    materialMap["black-chassis"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_leg_right_rear_hip_14.name = "right-rear hip joint"
  if (endpoint_leg_right_rear_hip_14) {
    mesh_leg_right_rear_hip_14.position.copy(endpoint_leg_right_rear_hip_14.midpoint)
    mesh_leg_right_rear_hip_14.quaternion.copy(endpoint_leg_right_rear_hip_14.quaternion)
  }
  mesh_leg_right_rear_hip_14.castShadow = options.castShadow ?? true
  mesh_leg_right_rear_hip_14.receiveShadow = options.receiveShadow ?? true
  mesh_leg_right_rear_hip_14.userData.sculptComponent = {
    id: "leg-right-rear-hip",
    name: "right-rear hip joint",
    level: "meso",
    role: "joint",
    importance: 1,
    confidence: 0.9,
    primitive: "cylinder",
    topologyClass: "assembled-solid",
    topologyRationale: "Cylindrical socket joint connecting leg to chassis.",
    geometryDescriptor: {
      topologyIntent: "Cylindrical socket joint connecting leg to chassis.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0336, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "lower-chassis",
    attachment: {
      parentId: "lower-chassis",
      parentSocket: "socket-leg-right-rear",
      localStart: [4.6, 1.55, -2.1],
      localEnd: [5.05, 0.15, -2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "socket",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.76, height: 0.42, depth: 0.76, units: "model-units", confidence: 0.9 },
    transform: {
      position: [4.6, 1.55, -2.1],
      rotation: [1.5707963267948966, 0, 0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "joint",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "cylinder",
        offset: [0, 0, 0],
        scale: [0.76, 0.42, 0.76],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-right-rear",
        seamRefs: ["lower-chassis/leg-right-rear-hip"],
        detachableFragments: ["leg-right-rear-hip"],
        breakImpulse: 8,
        debrisMaterial: "black-chassis",
      },
    },
    material: "black-chassis",
    materialLayers: ["black-chassis"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "joint-rings",
        type: "emissive",
        placement: "hip axes",
        geometryEffect: "torus ring",
        confidence: 0.9,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(8, 14, 27, 1.0)",
      secondaryAlbedo: "rgba(17, 26, 44, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_right_rear_hip_14.add(mesh_leg_right_rear_hip_14)
  meshes["leg-right-rear-hip"] = mesh_leg_right_rear_hip_14
  colliders["leg-right-rear-hip"] = {
    type: "cylinder",
    offset: [0, 0, 0],
    scale: [0.76, 0.42, 0.76],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["leg-right-rear"] ??= []
  destructionGroups["leg-right-rear"].push(node_leg_right_rear_hip_14)

  const attachment_leg_right_rear_upper_15 = {
    parentId: "leg-right-rear-hip",
    parentSocket: "socket-strut-right-rear",
    localStart: [4.6, 1.55, -2.1],
    localEnd: [5.05, 0.15, -2.35],
    baseRadius: 0.38,
    endRadius: 0.28,
    overlap: 0.12,
    embedDepth: 0.08,
    contactType: "overlap",
    gapTolerance: 0.02,
    evidenceRefs: ["full-object"],
  }
  const endpoint_leg_right_rear_upper_15 = makeAttachmentEndpoint(
    attachment_leg_right_rear_upper_15,
  )
  const node_leg_right_rear_upper_15 = new THREE.Group()
  node_leg_right_rear_upper_15.name = "right-rear upper strut__pivot"
  node_leg_right_rear_upper_15.scale.set(1, 1, 1)
  if (endpoint_leg_right_rear_upper_15) {
    node_leg_right_rear_upper_15.position.copy(endpoint_leg_right_rear_upper_15.start)
    node_leg_right_rear_upper_15.rotation.set(0.0, 0.0, -0.28)
  } else {
    node_leg_right_rear_upper_15.position.set(5.05, 0.15, -2.35)
    node_leg_right_rear_upper_15.rotation.set(0.0, 0.0, -0.28)
  }
  node_leg_right_rear_upper_15.userData.sculptComponent = {
    id: "leg-right-rear-upper",
    name: "right-rear upper strut",
    level: "macro",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored strut with rigid countable faces.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored strut with rigid countable faces.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0464, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-right-rear-hip",
    attachment: {
      parentId: "leg-right-rear-hip",
      parentSocket: "socket-strut-right-rear",
      localStart: [4.6, 1.55, -2.1],
      localEnd: [5.05, 0.15, -2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.72, height: 1.9, depth: 0.58, units: "model-units", confidence: 0.9 },
    transform: { position: [5.05, 0.15, -2.35], rotation: [0, 0, -0.28], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.72, 1.9, 0.58],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-right-rear",
        seamRefs: ["leg-right-rear-hip/leg-right-rear-upper"],
        detachableFragments: ["leg-right-rear-upper"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_right_rear_upper_15.userData.actionProfile = {
    animationRole: "leg",
    pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [0.72, 1.9, 0.58],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "leg-right-rear",
      seamRefs: ["leg-right-rear-hip/leg-right-rear-upper"],
      detachableFragments: ["leg-right-rear-upper"],
      breakImpulse: 8,
      debrisMaterial: "blue-armor",
    },
  }
  ;(nodes["leg-right-rear-hip"] ?? root).add(node_leg_right_rear_upper_15)
  nodes["leg-right-rear-upper"] = node_leg_right_rear_upper_15
  const mesh_leg_right_rear_upper_15Geometry = endpoint_leg_right_rear_upper_15
    ? new THREE.CylinderGeometry(
        endpoint_leg_right_rear_upper_15.endRadius,
        endpoint_leg_right_rear_upper_15.baseRadius,
        endpoint_leg_right_rear_upper_15.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_leg_right_rear_upper_15) {
    mesh_leg_right_rear_upper_15Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_leg_right_rear_upper_15 = new THREE.Mesh(
    mesh_leg_right_rear_upper_15Geometry,
    materialMap["blue-armor"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_leg_right_rear_upper_15.name = "right-rear upper strut"
  if (endpoint_leg_right_rear_upper_15) {
    mesh_leg_right_rear_upper_15.position.copy(endpoint_leg_right_rear_upper_15.midpoint)
    mesh_leg_right_rear_upper_15.quaternion.copy(endpoint_leg_right_rear_upper_15.quaternion)
  }
  mesh_leg_right_rear_upper_15.castShadow = options.castShadow ?? true
  mesh_leg_right_rear_upper_15.receiveShadow = options.receiveShadow ?? true
  mesh_leg_right_rear_upper_15.userData.sculptComponent = {
    id: "leg-right-rear-upper",
    name: "right-rear upper strut",
    level: "macro",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored strut with rigid countable faces.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored strut with rigid countable faces.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0464, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-right-rear-hip",
    attachment: {
      parentId: "leg-right-rear-hip",
      parentSocket: "socket-strut-right-rear",
      localStart: [4.6, 1.55, -2.1],
      localEnd: [5.05, 0.15, -2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.72, height: 1.9, depth: 0.58, units: "model-units", confidence: 0.9 },
    transform: { position: [5.05, 0.15, -2.35], rotation: [0, 0, -0.28], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.72, 1.9, 0.58],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-right-rear",
        seamRefs: ["leg-right-rear-hip/leg-right-rear-upper"],
        detachableFragments: ["leg-right-rear-upper"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_right_rear_upper_15.add(mesh_leg_right_rear_upper_15)
  meshes["leg-right-rear-upper"] = mesh_leg_right_rear_upper_15
  colliders["leg-right-rear-upper"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [0.72, 1.9, 0.58],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["leg-right-rear"] ??= []
  destructionGroups["leg-right-rear"].push(node_leg_right_rear_upper_15)

  const attachment_leg_right_rear_lower_16 = {
    parentId: "leg-right-rear-upper",
    parentSocket: "socket-knee-right-rear",
    localStart: [5.05, 0.15, -2.35],
    localEnd: [5.45, -1.55, -2.65],
    baseRadius: 0.38,
    endRadius: 0.28,
    overlap: 0.12,
    embedDepth: 0.08,
    contactType: "overlap",
    gapTolerance: 0.02,
    evidenceRefs: ["full-object"],
  }
  const endpoint_leg_right_rear_lower_16 = makeAttachmentEndpoint(
    attachment_leg_right_rear_lower_16,
  )
  const node_leg_right_rear_lower_16 = new THREE.Group()
  node_leg_right_rear_lower_16.name = "right-rear lower strut and foot__pivot"
  node_leg_right_rear_lower_16.scale.set(1, 1, 1)
  if (endpoint_leg_right_rear_lower_16) {
    node_leg_right_rear_lower_16.position.copy(endpoint_leg_right_rear_lower_16.start)
    node_leg_right_rear_lower_16.rotation.set(0.0, 0.0, -0.34)
  } else {
    node_leg_right_rear_lower_16.position.set(5.45, -1.55, -2.65)
    node_leg_right_rear_lower_16.rotation.set(0.0, 0.0, -0.34)
  }
  node_leg_right_rear_lower_16.userData.sculptComponent = {
    id: "leg-right-rear-lower",
    name: "right-rear lower strut and foot",
    level: "meso",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored lower strut ending in a broad contact foot.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored lower strut ending in a broad contact foot.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.055999999999999994, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-right-rear-upper",
    attachment: {
      parentId: "leg-right-rear-upper",
      parentSocket: "socket-knee-right-rear",
      localStart: [5.05, 0.15, -2.35],
      localEnd: [5.45, -1.55, -2.65],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.82, height: 1.95, depth: 0.7, units: "model-units", confidence: 0.9 },
    transform: { position: [5.45, -1.55, -2.65], rotation: [0, 0, -0.34], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.82, 1.95, 0.7],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-right-rear",
        seamRefs: ["leg-right-rear-upper/leg-right-rear-lower"],
        detachableFragments: ["leg-right-rear-lower"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_right_rear_lower_16.userData.actionProfile = {
    animationRole: "leg",
    pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [0.82, 1.95, 0.7],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "leg-right-rear",
      seamRefs: ["leg-right-rear-upper/leg-right-rear-lower"],
      detachableFragments: ["leg-right-rear-lower"],
      breakImpulse: 8,
      debrisMaterial: "blue-armor",
    },
  }
  ;(nodes["leg-right-rear-upper"] ?? root).add(node_leg_right_rear_lower_16)
  nodes["leg-right-rear-lower"] = node_leg_right_rear_lower_16
  const mesh_leg_right_rear_lower_16Geometry = endpoint_leg_right_rear_lower_16
    ? new THREE.CylinderGeometry(
        endpoint_leg_right_rear_lower_16.endRadius,
        endpoint_leg_right_rear_lower_16.baseRadius,
        endpoint_leg_right_rear_lower_16.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_leg_right_rear_lower_16) {
    mesh_leg_right_rear_lower_16Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_leg_right_rear_lower_16 = new THREE.Mesh(
    mesh_leg_right_rear_lower_16Geometry,
    materialMap["blue-armor"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_leg_right_rear_lower_16.name = "right-rear lower strut and foot"
  if (endpoint_leg_right_rear_lower_16) {
    mesh_leg_right_rear_lower_16.position.copy(endpoint_leg_right_rear_lower_16.midpoint)
    mesh_leg_right_rear_lower_16.quaternion.copy(endpoint_leg_right_rear_lower_16.quaternion)
  }
  mesh_leg_right_rear_lower_16.castShadow = options.castShadow ?? true
  mesh_leg_right_rear_lower_16.receiveShadow = options.receiveShadow ?? true
  mesh_leg_right_rear_lower_16.userData.sculptComponent = {
    id: "leg-right-rear-lower",
    name: "right-rear lower strut and foot",
    level: "meso",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored lower strut ending in a broad contact foot.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored lower strut ending in a broad contact foot.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.055999999999999994, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-right-rear-upper",
    attachment: {
      parentId: "leg-right-rear-upper",
      parentSocket: "socket-knee-right-rear",
      localStart: [5.05, 0.15, -2.35],
      localEnd: [5.45, -1.55, -2.65],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.82, height: 1.95, depth: 0.7, units: "model-units", confidence: 0.9 },
    transform: { position: [5.45, -1.55, -2.65], rotation: [0, 0, -0.34], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.82, 1.95, 0.7],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-right-rear",
        seamRefs: ["leg-right-rear-upper/leg-right-rear-lower"],
        detachableFragments: ["leg-right-rear-lower"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_right_rear_lower_16.add(mesh_leg_right_rear_lower_16)
  meshes["leg-right-rear-lower"] = mesh_leg_right_rear_lower_16
  colliders["leg-right-rear-lower"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [0.82, 1.95, 0.7],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["leg-right-rear"] ??= []
  destructionGroups["leg-right-rear"].push(node_leg_right_rear_lower_16)

  const attachment_leg_right_front_hip_17 = {
    parentId: "lower-chassis",
    parentSocket: "socket-leg-right-front",
    localStart: [4.6, 1.55, 2.1],
    localEnd: [5.05, 0.15, 2.35],
    baseRadius: 0.38,
    endRadius: 0.28,
    overlap: 0.12,
    embedDepth: 0.08,
    contactType: "socket",
    gapTolerance: 0.02,
    evidenceRefs: ["full-object"],
  }
  const endpoint_leg_right_front_hip_17 = makeAttachmentEndpoint(attachment_leg_right_front_hip_17)
  const node_leg_right_front_hip_17 = new THREE.Group()
  node_leg_right_front_hip_17.name = "right-front hip joint__pivot"
  node_leg_right_front_hip_17.scale.set(1, 1, 1)
  if (endpoint_leg_right_front_hip_17) {
    node_leg_right_front_hip_17.position.copy(endpoint_leg_right_front_hip_17.start)
    node_leg_right_front_hip_17.rotation.set(1.5707963267948966, 0.0, 0.0)
  } else {
    node_leg_right_front_hip_17.position.set(4.6, 1.55, 2.1)
    node_leg_right_front_hip_17.rotation.set(1.5707963267948966, 0.0, 0.0)
  }
  node_leg_right_front_hip_17.userData.sculptComponent = {
    id: "leg-right-front-hip",
    name: "right-front hip joint",
    level: "meso",
    role: "joint",
    importance: 1,
    confidence: 0.9,
    primitive: "cylinder",
    topologyClass: "assembled-solid",
    topologyRationale: "Cylindrical socket joint connecting leg to chassis.",
    geometryDescriptor: {
      topologyIntent: "Cylindrical socket joint connecting leg to chassis.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0336, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "lower-chassis",
    attachment: {
      parentId: "lower-chassis",
      parentSocket: "socket-leg-right-front",
      localStart: [4.6, 1.55, 2.1],
      localEnd: [5.05, 0.15, 2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "socket",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.76, height: 0.42, depth: 0.76, units: "model-units", confidence: 0.9 },
    transform: {
      position: [4.6, 1.55, 2.1],
      rotation: [1.5707963267948966, 0, 0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "joint",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "cylinder",
        offset: [0, 0, 0],
        scale: [0.76, 0.42, 0.76],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-right-front",
        seamRefs: ["lower-chassis/leg-right-front-hip"],
        detachableFragments: ["leg-right-front-hip"],
        breakImpulse: 8,
        debrisMaterial: "black-chassis",
      },
    },
    material: "black-chassis",
    materialLayers: ["black-chassis"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "joint-rings",
        type: "emissive",
        placement: "hip axes",
        geometryEffect: "torus ring",
        confidence: 0.9,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(8, 14, 27, 1.0)",
      secondaryAlbedo: "rgba(17, 26, 44, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_right_front_hip_17.userData.actionProfile = {
    animationRole: "joint",
    pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "cylinder",
      offset: [0, 0, 0],
      scale: [0.76, 0.42, 0.76],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "leg-right-front",
      seamRefs: ["lower-chassis/leg-right-front-hip"],
      detachableFragments: ["leg-right-front-hip"],
      breakImpulse: 8,
      debrisMaterial: "black-chassis",
    },
  }
  ;(nodes["lower-chassis"] ?? root).add(node_leg_right_front_hip_17)
  nodes["leg-right-front-hip"] = node_leg_right_front_hip_17
  const mesh_leg_right_front_hip_17Geometry = endpoint_leg_right_front_hip_17
    ? new THREE.CylinderGeometry(
        endpoint_leg_right_front_hip_17.endRadius,
        endpoint_leg_right_front_hip_17.baseRadius,
        endpoint_leg_right_front_hip_17.length,
        32,
        12,
      )
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16)
  if (!endpoint_leg_right_front_hip_17) {
    mesh_leg_right_front_hip_17Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_leg_right_front_hip_17 = new THREE.Mesh(
    mesh_leg_right_front_hip_17Geometry,
    materialMap["black-chassis"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_leg_right_front_hip_17.name = "right-front hip joint"
  if (endpoint_leg_right_front_hip_17) {
    mesh_leg_right_front_hip_17.position.copy(endpoint_leg_right_front_hip_17.midpoint)
    mesh_leg_right_front_hip_17.quaternion.copy(endpoint_leg_right_front_hip_17.quaternion)
  }
  mesh_leg_right_front_hip_17.castShadow = options.castShadow ?? true
  mesh_leg_right_front_hip_17.receiveShadow = options.receiveShadow ?? true
  mesh_leg_right_front_hip_17.userData.sculptComponent = {
    id: "leg-right-front-hip",
    name: "right-front hip joint",
    level: "meso",
    role: "joint",
    importance: 1,
    confidence: 0.9,
    primitive: "cylinder",
    topologyClass: "assembled-solid",
    topologyRationale: "Cylindrical socket joint connecting leg to chassis.",
    geometryDescriptor: {
      topologyIntent: "Cylindrical socket joint connecting leg to chassis.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0336, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "lower-chassis",
    attachment: {
      parentId: "lower-chassis",
      parentSocket: "socket-leg-right-front",
      localStart: [4.6, 1.55, 2.1],
      localEnd: [5.05, 0.15, 2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "socket",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.76, height: 0.42, depth: 0.76, units: "model-units", confidence: 0.9 },
    transform: {
      position: [4.6, 1.55, 2.1],
      rotation: [1.5707963267948966, 0, 0],
      scale: [1, 1, 1],
    },
    actionProfile: {
      animationRole: "joint",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "cylinder",
        offset: [0, 0, 0],
        scale: [0.76, 0.42, 0.76],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-right-front",
        seamRefs: ["lower-chassis/leg-right-front-hip"],
        detachableFragments: ["leg-right-front-hip"],
        breakImpulse: 8,
        debrisMaterial: "black-chassis",
      },
    },
    material: "black-chassis",
    materialLayers: ["black-chassis"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [
      {
        id: "joint-rings",
        type: "emissive",
        placement: "hip axes",
        geometryEffect: "torus ring",
        confidence: 0.9,
      },
    ],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(8, 14, 27, 1.0)",
      secondaryAlbedo: "rgba(17, 26, 44, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_right_front_hip_17.add(mesh_leg_right_front_hip_17)
  meshes["leg-right-front-hip"] = mesh_leg_right_front_hip_17
  colliders["leg-right-front-hip"] = {
    type: "cylinder",
    offset: [0, 0, 0],
    scale: [0.76, 0.42, 0.76],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["leg-right-front"] ??= []
  destructionGroups["leg-right-front"].push(node_leg_right_front_hip_17)

  const attachment_leg_right_front_upper_18 = {
    parentId: "leg-right-front-hip",
    parentSocket: "socket-strut-right-front",
    localStart: [4.6, 1.55, 2.1],
    localEnd: [5.05, 0.15, 2.35],
    baseRadius: 0.38,
    endRadius: 0.28,
    overlap: 0.12,
    embedDepth: 0.08,
    contactType: "overlap",
    gapTolerance: 0.02,
    evidenceRefs: ["full-object"],
  }
  const endpoint_leg_right_front_upper_18 = makeAttachmentEndpoint(
    attachment_leg_right_front_upper_18,
  )
  const node_leg_right_front_upper_18 = new THREE.Group()
  node_leg_right_front_upper_18.name = "right-front upper strut__pivot"
  node_leg_right_front_upper_18.scale.set(1, 1, 1)
  if (endpoint_leg_right_front_upper_18) {
    node_leg_right_front_upper_18.position.copy(endpoint_leg_right_front_upper_18.start)
    node_leg_right_front_upper_18.rotation.set(0.0, 0.0, -0.28)
  } else {
    node_leg_right_front_upper_18.position.set(5.05, 0.15, 2.35)
    node_leg_right_front_upper_18.rotation.set(0.0, 0.0, -0.28)
  }
  node_leg_right_front_upper_18.userData.sculptComponent = {
    id: "leg-right-front-upper",
    name: "right-front upper strut",
    level: "macro",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored strut with rigid countable faces.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored strut with rigid countable faces.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0464, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-right-front-hip",
    attachment: {
      parentId: "leg-right-front-hip",
      parentSocket: "socket-strut-right-front",
      localStart: [4.6, 1.55, 2.1],
      localEnd: [5.05, 0.15, 2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.72, height: 1.9, depth: 0.58, units: "model-units", confidence: 0.9 },
    transform: { position: [5.05, 0.15, 2.35], rotation: [0, 0, -0.28], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.72, 1.9, 0.58],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-right-front",
        seamRefs: ["leg-right-front-hip/leg-right-front-upper"],
        detachableFragments: ["leg-right-front-upper"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_right_front_upper_18.userData.actionProfile = {
    animationRole: "leg",
    pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [0.72, 1.9, 0.58],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "leg-right-front",
      seamRefs: ["leg-right-front-hip/leg-right-front-upper"],
      detachableFragments: ["leg-right-front-upper"],
      breakImpulse: 8,
      debrisMaterial: "blue-armor",
    },
  }
  ;(nodes["leg-right-front-hip"] ?? root).add(node_leg_right_front_upper_18)
  nodes["leg-right-front-upper"] = node_leg_right_front_upper_18
  const mesh_leg_right_front_upper_18Geometry = endpoint_leg_right_front_upper_18
    ? new THREE.CylinderGeometry(
        endpoint_leg_right_front_upper_18.endRadius,
        endpoint_leg_right_front_upper_18.baseRadius,
        endpoint_leg_right_front_upper_18.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_leg_right_front_upper_18) {
    mesh_leg_right_front_upper_18Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_leg_right_front_upper_18 = new THREE.Mesh(
    mesh_leg_right_front_upper_18Geometry,
    materialMap["blue-armor"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_leg_right_front_upper_18.name = "right-front upper strut"
  if (endpoint_leg_right_front_upper_18) {
    mesh_leg_right_front_upper_18.position.copy(endpoint_leg_right_front_upper_18.midpoint)
    mesh_leg_right_front_upper_18.quaternion.copy(endpoint_leg_right_front_upper_18.quaternion)
  }
  mesh_leg_right_front_upper_18.castShadow = options.castShadow ?? true
  mesh_leg_right_front_upper_18.receiveShadow = options.receiveShadow ?? true
  mesh_leg_right_front_upper_18.userData.sculptComponent = {
    id: "leg-right-front-upper",
    name: "right-front upper strut",
    level: "macro",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored strut with rigid countable faces.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored strut with rigid countable faces.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.0464, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-right-front-hip",
    attachment: {
      parentId: "leg-right-front-hip",
      parentSocket: "socket-strut-right-front",
      localStart: [4.6, 1.55, 2.1],
      localEnd: [5.05, 0.15, 2.35],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.72, height: 1.9, depth: 0.58, units: "model-units", confidence: 0.9 },
    transform: { position: [5.05, 0.15, 2.35], rotation: [0, 0, -0.28], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.72, 1.9, 0.58],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-right-front",
        seamRefs: ["leg-right-front-hip/leg-right-front-upper"],
        detachableFragments: ["leg-right-front-upper"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_right_front_upper_18.add(mesh_leg_right_front_upper_18)
  meshes["leg-right-front-upper"] = mesh_leg_right_front_upper_18
  colliders["leg-right-front-upper"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [0.72, 1.9, 0.58],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["leg-right-front"] ??= []
  destructionGroups["leg-right-front"].push(node_leg_right_front_upper_18)

  const attachment_leg_right_front_lower_19 = {
    parentId: "leg-right-front-upper",
    parentSocket: "socket-knee-right-front",
    localStart: [5.05, 0.15, 2.35],
    localEnd: [5.45, -1.55, 2.65],
    baseRadius: 0.38,
    endRadius: 0.28,
    overlap: 0.12,
    embedDepth: 0.08,
    contactType: "overlap",
    gapTolerance: 0.02,
    evidenceRefs: ["full-object"],
  }
  const endpoint_leg_right_front_lower_19 = makeAttachmentEndpoint(
    attachment_leg_right_front_lower_19,
  )
  const node_leg_right_front_lower_19 = new THREE.Group()
  node_leg_right_front_lower_19.name = "right-front lower strut and foot__pivot"
  node_leg_right_front_lower_19.scale.set(1, 1, 1)
  if (endpoint_leg_right_front_lower_19) {
    node_leg_right_front_lower_19.position.copy(endpoint_leg_right_front_lower_19.start)
    node_leg_right_front_lower_19.rotation.set(0.0, 0.0, -0.34)
  } else {
    node_leg_right_front_lower_19.position.set(5.45, -1.55, 2.65)
    node_leg_right_front_lower_19.rotation.set(0.0, 0.0, -0.34)
  }
  node_leg_right_front_lower_19.userData.sculptComponent = {
    id: "leg-right-front-lower",
    name: "right-front lower strut and foot",
    level: "meso",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored lower strut ending in a broad contact foot.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored lower strut ending in a broad contact foot.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.055999999999999994, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-right-front-upper",
    attachment: {
      parentId: "leg-right-front-upper",
      parentSocket: "socket-knee-right-front",
      localStart: [5.05, 0.15, 2.35],
      localEnd: [5.45, -1.55, 2.65],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.82, height: 1.95, depth: 0.7, units: "model-units", confidence: 0.9 },
    transform: { position: [5.45, -1.55, 2.65], rotation: [0, 0, -0.34], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.82, 1.95, 0.7],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-right-front",
        seamRefs: ["leg-right-front-upper/leg-right-front-lower"],
        detachableFragments: ["leg-right-front-lower"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_right_front_lower_19.userData.actionProfile = {
    animationRole: "leg",
    pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      bend: false,
      twist: false,
      detach: false,
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: "box",
      offset: [0, 0, 0],
      scale: [0.82, 1.95, 0.7],
      isTrigger: false,
      notes: "Runtime proxy; visual meshes are not physics colliders.",
    },
    constraints: [],
    destruction: {
      breakable: true,
      fractureGroup: "leg-right-front",
      seamRefs: ["leg-right-front-upper/leg-right-front-lower"],
      detachableFragments: ["leg-right-front-lower"],
      breakImpulse: 8,
      debrisMaterial: "blue-armor",
    },
  }
  ;(nodes["leg-right-front-upper"] ?? root).add(node_leg_right_front_lower_19)
  nodes["leg-right-front-lower"] = node_leg_right_front_lower_19
  const mesh_leg_right_front_lower_19Geometry = endpoint_leg_right_front_lower_19
    ? new THREE.CylinderGeometry(
        endpoint_leg_right_front_lower_19.endRadius,
        endpoint_leg_right_front_lower_19.baseRadius,
        endpoint_leg_right_front_lower_19.length,
        32,
        12,
      )
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)
  if (!endpoint_leg_right_front_lower_19) {
    mesh_leg_right_front_lower_19Geometry.scale(1.0, 1.0, 1.0)
  }
  const mesh_leg_right_front_lower_19 = new THREE.Mesh(
    mesh_leg_right_front_lower_19Geometry,
    materialMap["blue-armor"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  mesh_leg_right_front_lower_19.name = "right-front lower strut and foot"
  if (endpoint_leg_right_front_lower_19) {
    mesh_leg_right_front_lower_19.position.copy(endpoint_leg_right_front_lower_19.midpoint)
    mesh_leg_right_front_lower_19.quaternion.copy(endpoint_leg_right_front_lower_19.quaternion)
  }
  mesh_leg_right_front_lower_19.castShadow = options.castShadow ?? true
  mesh_leg_right_front_lower_19.receiveShadow = options.receiveShadow ?? true
  mesh_leg_right_front_lower_19.userData.sculptComponent = {
    id: "leg-right-front-lower",
    name: "right-front lower strut and foot",
    level: "meso",
    role: "leg",
    importance: 1,
    confidence: 0.9,
    primitive: "box",
    topologyClass: "assembled-solid",
    topologyRationale: "Tapered armored lower strut ending in a broad contact foot.",
    geometryDescriptor: {
      topologyIntent: "Tapered armored lower strut ending in a broad contact foot.",
      edgeTreatment: { type: "chamfer", bevelRadius: 0.055999999999999994, segments: 3 },
      deformationStack: [],
      uvStrategy: "generated procedural coordinates",
      normalStrategy: "vertex normals from generated geometry",
    },
    parent: "leg-right-front-upper",
    attachment: {
      parentId: "leg-right-front-upper",
      parentSocket: "socket-knee-right-front",
      localStart: [5.05, 0.15, 2.35],
      localEnd: [5.45, -1.55, 2.65],
      baseRadius: 0.38,
      endRadius: 0.28,
      overlap: 0.12,
      embedDepth: 0.08,
      contactType: "overlap",
      gapTolerance: 0.02,
      evidenceRefs: ["full-object"],
    },
    dimensions: { width: 0.82, height: 1.95, depth: 0.7, units: "model-units", confidence: 0.9 },
    transform: { position: [5.45, -1.55, 2.65], rotation: [0, 0, -0.34], scale: [1, 1, 1] },
    actionProfile: {
      animationRole: "leg",
      pivot: { mode: "socket", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.9 },
      transformChannels: {
        translate: true,
        rotate: true,
        scale: true,
        bend: false,
        twist: false,
        detach: false,
        visibility: true,
        materialState: true,
      },
      sockets: [],
      collider: {
        type: "box",
        offset: [0, 0, 0],
        scale: [0.82, 1.95, 0.7],
        isTrigger: false,
        notes: "Runtime proxy; visual meshes are not physics colliders.",
      },
      constraints: [],
      destruction: {
        breakable: true,
        fractureGroup: "leg-right-front",
        seamRefs: ["leg-right-front-upper/leg-right-front-lower"],
        detachableFragments: ["leg-right-front-lower"],
        breakImpulse: 8,
        debrisMaterial: "blue-armor",
      },
    },
    material: "blue-armor",
    materialLayers: ["blue-armor"],
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: [],
    surfaceDetail: {
      macroRoughness: 0,
      microRoughness: 0,
      bumpAmplitude: 0,
      normalPattern: "",
      displacementPattern: "",
      occlusionPattern: "",
      edgeWearPattern: "",
      notes: "",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: "blockout",
    colorMaterialRecipe: {
      dominantAlbedo: "rgba(22, 75, 155, 1.0)",
      secondaryAlbedo: "rgba(7, 159, 224, 1.0)",
      materialClass: "metal",
      materialClassConfidence: 0.9,
      evidenceRefs: ["full-object"],
    },
  }
  node_leg_right_front_lower_19.add(mesh_leg_right_front_lower_19)
  meshes["leg-right-front-lower"] = mesh_leg_right_front_lower_19
  colliders["leg-right-front-lower"] = {
    type: "box",
    offset: [0, 0, 0],
    scale: [0.82, 1.95, 0.7],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  destructionGroups["leg-right-front"] ??= []
  destructionGroups["leg-right-front"].push(node_leg_right_front_lower_19)

  root.userData.sculptRuntime = {
    nodes,
    meshes,
    sockets,
    colliders,
    destructionGroups,
  } satisfies ProceduralModelRuntime
  root.userData.lookDevTargets = {
    neutral: "Broad soft key and cool fill reveal albedo and tabletop chamfers.",
    grazing: "Low cyan-white key reveals woven mat normal response and metallic bevels.",
    reference:
      "Cool frontal key, cyan/magenta emissive accents, restrained bloom and transparent background.",
  }
  root.userData.actionReadiness = {
    note: "Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.",
  }
  return root
}

export function createCyberDeskLookDevLights(
  mode: "neutral" | "grazing" | "reference" = "neutral",
): THREE.Group {
  const lights = new THREE.Group()
  lights.name = "Cyber Desk look-dev lights"
  const hemi = new THREE.HemisphereLight(
    mode === "reference" ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === "grazing" ? 0.28 : mode === "reference" ? 0.72 : 0.85,
  )
  lights.add(hemi)
  const key = new THREE.DirectionalLight(
    mode === "reference" ? 0xffcf8a : 0xfff4e8,
    mode === "grazing" ? 4.2 : mode === "reference" ? 2.6 : 2.15,
  )
  if (mode === "grazing") key.position.set(7.5, 1.1, 4.0)
  else if (mode === "reference") key.position.set(-4.5, 7.5, 5.0)
  else key.position.set(-4.0, 6.0, 5.5)
  key.castShadow = true
  key.shadow.mapSize.set(4096, 4096)
  key.shadow.bias = -0.00025
  key.shadow.normalBias = 0.018
  key.shadow.radius = 7
  key.shadow.blurSamples = 24
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 30
  key.shadow.camera.left = -2.6
  key.shadow.camera.right = 2.6
  key.shadow.camera.top = 2.6
  key.shadow.camera.bottom = -2.6
  key.shadow.camera.updateProjectionMatrix()
  lights.add(key)
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === "grazing" ? 0.12 : 0.42)
  fill.position.set(4.0, 3.0, 3.5)
  lights.add(fill)
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === "grazing" ? 0.28 : 0.85)
  rim.position.set(0.5, 4.5, -6.0)
  lights.add(rim)
  lights.userData.reviewMode = mode
  lights.userData.lightingFromPhoto = [
    {
      id: "key",
      type: "directional",
      direction: [-0.5, 1, 0.55],
      color: "#dce8ff",
      intensity: 3.2,
      shadowSoftness: 0.55,
    },
    { id: "fill", type: "hemisphere", direction: [0, 1, 0], color: "#8e9dff", intensity: 0.85 },
    {
      id: "rim",
      type: "directional",
      direction: [0.8, 0.4, -0.65],
      color: "#24dfff",
      intensity: 2,
    },
    {
      id: "render-intent",
      type: "render-profile",
      exposure: 1.05,
      toneMapping: "ACESFilmic",
      contactShadow: "soft ground contact shadow opacity 0.22",
    },
  ]
  lights.userData.lookDevTargets = {
    neutral: "Broad soft key and cool fill reveal albedo and tabletop chamfers.",
    grazing: "Low cyan-white key reveals woven mat normal response and metallic bevels.",
    reference:
      "Cool frontal key, cyan/magenta emissive accents, restrained bloom and transparent background.",
  }
  return lights
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createCyberDeskEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  return texture
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameCyberDeskCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const margin = options.margin ?? 1.15
  const maxDim = Math.max(size.x, size.y, size.z) * margin
  const fov = (camera.fov * Math.PI) / 180
  // distance so the largest object dimension fits vertically in the frame
  const distance = maxDim / 2 / Math.tan(fov / 2)
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  )
  camera.position.copy(center).addScaledVector(dir, distance)
  camera.near = Math.max(0.01, distance - maxDim)
  camera.far = distance + maxDim * 2
  camera.lookAt(center)
  camera.updateProjectionMatrix()
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createCyberDeskPresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: {
    dof?: boolean
    bloom?: boolean
    bloomStrength?: number
    dofFocus?: number
    dofAperture?: number
  } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  if (options.dof) {
    composer.addPass(
      new BokehPass(scene, camera, {
        focus: options.dofFocus ?? 10.0,
        aperture: options.dofAperture ?? 0.0002,
        maxblur: 0.01,
      }),
    )
  }
  if (options.bloom) {
    const size = new THREE.Vector2()
    renderer.getSize(size)
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85))
  }
  return composer
}

export function configureCyberDeskRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace
}

export function createCyberDeskInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement)
  controls.enableDamping = true
  controls.minDistance = 1.0
  controls.maxDistance = 8.0
  controls.autoRotate = false
  return controls
}
