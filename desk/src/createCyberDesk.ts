import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"

export interface CyberDeskOptions {
  readonly castShadow?: boolean
  readonly receiveShadow?: boolean
}

export interface CyberDeskPartManifestEntry {
  readonly id: string
  readonly meshNames: readonly string[]
  readonly destructionGroup: string
}

export interface CyberDeskRuntime {
  readonly nodes: ReadonlyMap<string, THREE.Object3D>
  readonly meshes: ReadonlyMap<string, THREE.Mesh>
  readonly sockets: ReadonlyMap<string, THREE.Object3D>
  readonly colliders: ReadonlyMap<string, THREE.Object3D>
  readonly destructionGroups: ReadonlyMap<string, readonly string[]>
  readonly partManifest: readonly CyberDeskPartManifestEntry[]
  readonly setExplosion: (amount: number) => void
  readonly setLightsEnabled: (enabled: boolean) => void
  readonly resolvePart: (object: THREE.Object3D) => THREE.Group | null
  readonly dispose: () => void
}

export interface CyberDeskModel extends THREE.Group {
  readonly userData: THREE.Object3D["userData"] & {
    sculptRuntime: CyberDeskRuntime
  }
}

interface MaterialSet {
  readonly black: THREE.MeshPhysicalMaterial
  readonly blue: THREE.MeshPhysicalMaterial
  readonly cyan: THREE.MeshPhysicalMaterial
  readonly magenta: THREE.MeshPhysicalMaterial
  readonly mat: THREE.MeshPhysicalMaterial
  readonly orange: THREE.MeshPhysicalMaterial
  readonly silver: THREE.MeshPhysicalMaterial
}

const up = new THREE.Vector3(0, 1, 0)

function createNoiseTextures(seed: number): {
  readonly albedo: THREE.DataTexture
  readonly normal: THREE.DataTexture
  readonly roughness: THREE.DataTexture
} {
  const size = 128
  const albedoData = new Uint8Array(size * size * 4)
  const normalData = new Uint8Array(size * size * 4)
  const roughnessData = new Uint8Array(size * size * 4)
  let state = seed >>> 0
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0xffffffff
  }
  for (let index = 0; index < size * size; index += 1) {
    const offset = index * 4
    const x = index % size
    const y = Math.floor(index / size)
    const weave = ((x % 5 === 0 ? 1 : 0) + (y % 7 === 0 ? 1 : 0)) * 2
    const noise = Math.round((random() - 0.5) * 4)
    albedoData[offset] = 7 + weave + noise
    albedoData[offset + 1] = 18 + weave + noise
    albedoData[offset + 2] = 38 + weave + noise
    albedoData[offset + 3] = 255
    normalData[offset] = 128 + (x % 5 === 0 ? 9 : -3)
    normalData[offset + 1] = 128 + (y % 7 === 0 ? 9 : -3)
    normalData[offset + 2] = 246
    normalData[offset + 3] = 255
    const roughness = 194 + Math.round(random() * 34)
    roughnessData[offset] = roughness
    roughnessData[offset + 1] = roughness
    roughnessData[offset + 2] = roughness
    roughnessData[offset + 3] = 255
  }
  const makeTexture = (data: Uint8Array, colorSpace: THREE.ColorSpace) => {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
    texture.colorSpace = colorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(8, 4)
    texture.needsUpdate = true
    return texture
  }
  return {
    albedo: makeTexture(albedoData, THREE.SRGBColorSpace),
    normal: makeTexture(normalData, THREE.NoColorSpace),
    roughness: makeTexture(roughnessData, THREE.NoColorSpace),
  }
}

function createMaterials(): {
  readonly materials: MaterialSet
  readonly textures: readonly THREE.Texture[]
} {
  const matTextures = createNoiseTextures(0xc7be12)
  const materials: MaterialSet = {
    silver: new THREE.MeshPhysicalMaterial({
      color: 0xcbd7f4,
      metalness: 0.9,
      roughness: 0.13,
      clearcoat: 0.85,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.8,
    }),
    black: new THREE.MeshPhysicalMaterial({
      color: 0x070d19,
      metalness: 0.78,
      roughness: 0.22,
      clearcoat: 0.38,
      envMapIntensity: 1.5,
    }),
    mat: new THREE.MeshPhysicalMaterial({
      color: 0x0b1c39,
      map: matTextures.albedo,
      roughness: 0.8,
      roughnessMap: matTextures.roughness,
      normalMap: matTextures.normal,
      normalScale: new THREE.Vector2(0.24, 0.24),
      metalness: 0.04,
      envMapIntensity: 0.42,
    }),
    blue: new THREE.MeshPhysicalMaterial({
      color: 0x0e347c,
      metalness: 0.82,
      roughness: 0.17,
      clearcoat: 0.72,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.75,
    }),
    cyan: new THREE.MeshPhysicalMaterial({
      color: 0x00bde8,
      emissive: 0x00dfff,
      emissiveIntensity: 5.5,
      roughness: 0.16,
      clearcoat: 0.5,
      toneMapped: false,
    }),
    magenta: new THREE.MeshPhysicalMaterial({
      color: 0xee18ef,
      emissive: 0xff18f4,
      emissiveIntensity: 4.8,
      roughness: 0.18,
      clearcoat: 0.48,
      toneMapped: false,
    }),
    orange: new THREE.MeshPhysicalMaterial({
      color: 0xff7300,
      emissive: 0xff5a00,
      emissiveIntensity: 4.4,
      roughness: 0.2,
      toneMapped: false,
    }),
  }
  return { materials, textures: Object.values(matTextures) }
}

function clippedShape(width: number, depth: number, clip: number): THREE.Shape {
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const shape = new THREE.Shape()
  shape.moveTo(-halfWidth + clip, -halfDepth)
  shape.lineTo(halfWidth - clip, -halfDepth)
  shape.lineTo(halfWidth, -halfDepth + clip)
  shape.lineTo(halfWidth, halfDepth - clip)
  shape.lineTo(halfWidth - clip, halfDepth)
  shape.lineTo(-halfWidth + clip, halfDepth)
  shape.lineTo(-halfWidth, halfDepth - clip)
  shape.lineTo(-halfWidth, -halfDepth + clip)
  shape.closePath()
  return shape
}

function createClippedPlate(
  width: number,
  depth: number,
  height: number,
  clip: number,
  bevel: number,
): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(clippedShape(width, depth, clip), {
    depth: height,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
    steps: 1,
  })
  geometry.rotateX(Math.PI / 2)
  geometry.center()
  geometry.computeVertexNormals()
  return geometry
}

function createBeam(
  start: THREE.Vector3,
  end: THREE.Vector3,
  width: number,
  depth: number,
  material: THREE.Material,
  name: string,
): THREE.Mesh {
  const direction = end.clone().sub(start)
  const radius = Math.min(width, depth) * 0.18
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(width, direction.length(), depth, 3, radius),
    material,
  )
  mesh.name = name
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(up, direction.clone().normalize())
  return mesh
}

function createCylinderBeam(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  name: string,
): THREE.Mesh {
  const direction = end.clone().sub(start)
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.05, direction.length(), 18, 2),
    material,
  )
  mesh.name = name
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(up, direction.clone().normalize())
  return mesh
}

function setSurfaceDetail(mesh: THREE.Mesh, partId: string): void {
  mesh.userData.partId = partId
  mesh.userData.explodeWithParent = true
}

export function createCyberDeskModel(options: CyberDeskOptions = {}): CyberDeskModel {
  const root = new THREE.Group() as CyberDeskModel
  root.name = "cyber-desk"
  const { materials, textures } = createMaterials()
  const materialList = Object.values(materials)
  const nodes = new Map<string, THREE.Object3D>([["root", root]])
  const meshes = new Map<string, THREE.Mesh>()
  const sockets = new Map<string, THREE.Object3D>()
  const colliders = new Map<string, THREE.Object3D>()
  const parts = new Map<string, THREE.Group>()
  const destructionGroups = new Map<string, string[]>([
    ["tabletop", []],
    ["leg-left-front", []],
    ["leg-right-front", []],
    ["leg-left-rear", []],
    ["leg-right-rear", []],
  ])
  const emissiveMaterials = [materials.cyan, materials.magenta, materials.orange]
  const emissiveStrengths = emissiveMaterials.map((material) => material.emissiveIntensity)
  const emissiveColors = emissiveMaterials.map((material) => material.color.clone())
  const inactiveColors = [
    new THREE.Color(0x071c25),
    new THREE.Color(0x240923),
    new THREE.Color(0x251006),
  ]
  const castShadow = options.castShadow ?? true
  const receiveShadow = options.receiveShadow ?? true

  const addPart = (
    id: string,
    destructionGroup: string,
    explodeVector: THREE.Vector3,
  ): THREE.Group => {
    const part = new THREE.Group()
    part.name = id
    part.userData.partId = id
    part.userData.explodeVector = explodeVector.toArray()
    root.add(part)
    parts.set(id, part)
    nodes.set(id, part)
    const group = destructionGroups.get(destructionGroup)
    if (group !== undefined) group.push(id)
    return part
  }

  const addMesh = (part: THREE.Group, mesh: THREE.Mesh, selectable = true): THREE.Mesh => {
    const partId = part.name
    mesh.castShadow = castShadow
    mesh.receiveShadow = receiveShadow
    if (selectable) mesh.userData.partId = partId
    part.add(mesh)
    meshes.set(mesh.name, mesh)
    return mesh
  }

  const upperShell = addPart("upper-shell", "tabletop", new THREE.Vector3(0, 0.72, 0))
  const upperMesh = new THREE.Mesh(createClippedPlate(12, 5.8, 0.34, 0.58, 0.1), materials.silver)
  upperMesh.name = "upper-shell-plate"
  upperMesh.position.y = 2.08
  addMesh(upperShell, upperMesh)

  const lowerChassis = addPart("lower-chassis", "tabletop", new THREE.Vector3(0, -0.42, 0))
  const lowerMesh = new THREE.Mesh(
    createClippedPlate(12.16, 5.94, 0.36, 0.62, 0.08),
    materials.black,
  )
  lowerMesh.name = "lower-chassis-frame"
  lowerMesh.position.y = 1.76
  addMesh(lowerChassis, lowerMesh)
  for (const [index, x] of [-5.15, -3.65, 3.65, 5.15].entries()) {
    const statusLight = new THREE.Mesh(
      new RoundedBoxGeometry(0.48, 0.12, 0.08, 3, 0.025),
      materials.orange,
    )
    statusLight.name = `front-orange-status-${index}`
    statusLight.position.set(x, 1.7, 3.085)
    setSurfaceDetail(statusLight, "lower-chassis")
    lowerChassis.add(statusLight)
    meshes.set(statusLight.name, statusLight)
  }
  for (const [index, sideX] of [-1, 1].entries()) {
    const statusLight = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.075, 0.38), materials.orange)
    statusLight.name = `side-orange-status-${index}`
    statusLight.position.set(sideX * 6.12, 1.76, 1.72)
    setSurfaceDetail(statusLight, "lower-chassis")
    lowerChassis.add(statusLight)
    meshes.set(statusLight.name, statusLight)
  }

  for (const [index, x] of [-5.45, -4.75, 4.75, 5.45].entries()) {
    const socketHousing = new THREE.Mesh(
      new RoundedBoxGeometry(0.46, 0.22, 0.16, 3, 0.035),
      materials.black,
    )
    socketHousing.name = `front-recessed-hardware-${index}`
    socketHousing.position.set(x, 1.58, 3.06)
    setSurfaceDetail(socketHousing, "lower-chassis")
    lowerChassis.add(socketHousing)
    meshes.set(socketHousing.name, socketHousing)
  }

  const insetFrame = new THREE.Mesh(
    createClippedPlate(9.55, 4.18, 0.13, 0.42, 0.07),
    materials.black,
  )
  insetFrame.name = "inset-work-surface-frame"
  insetFrame.position.y = 2.29
  setSurfaceDetail(insetFrame, "upper-shell")
  upperShell.add(insetFrame)
  meshes.set(insetFrame.name, insetFrame)

  const shellPanels: readonly [string, number, number, number, number, number][] = [
    ["rear-left", -3.95, -2.63, 2.8, 0.34, -0.04],
    ["rear-center", 0, -2.7, 3.5, 0.28, 0],
    ["rear-right", 3.95, -2.63, 2.8, 0.34, 0.04],
    ["front-left", -3.95, 2.63, 2.8, 0.34, 0.04],
    ["front-right", 3.95, 2.63, 2.8, 0.34, -0.04],
  ]
  for (const [name, x, z, width, depth, rotation] of shellPanels) {
    const underlay = new THREE.Mesh(
      new RoundedBoxGeometry(width + 0.16, 0.065, depth + 0.12, 3, 0.05),
      materials.black,
    )
    underlay.name = `shell-panel-${name}-seam`
    underlay.position.set(x, 2.305, z)
    underlay.rotation.y = rotation
    setSurfaceDetail(underlay, "upper-shell")
    upperShell.add(underlay)
    meshes.set(underlay.name, underlay)

    const inlay = new THREE.Mesh(
      new RoundedBoxGeometry(width, 0.075, depth, 3, 0.045),
      materials.silver,
    )
    inlay.name = `shell-panel-${name}-armor`
    inlay.position.set(x, 2.35, z)
    inlay.rotation.y = rotation
    setSurfaceDetail(inlay, "upper-shell")
    upperShell.add(inlay)
    meshes.set(inlay.name, inlay)
  }
  for (const [index, position] of [
    [-5.42, -2.44],
    [5.42, -2.44],
    [-5.42, 2.44],
    [5.42, 2.44],
    [-4.55, -2.66],
    [4.55, -2.66],
    [-4.55, 2.66],
    [4.55, 2.66],
  ].entries()) {
    const [x, z] = position
    if (x === undefined || z === undefined) continue
    const fastener = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.055, 12),
      materials.black,
    )
    fastener.name = `shell-fastener-${index}`
    fastener.position.set(x, 2.4, z)
    setSurfaceDetail(fastener, "upper-shell")
    upperShell.add(fastener)
    meshes.set(fastener.name, fastener)
  }

  const workSurface = addPart("work-surface", "tabletop", new THREE.Vector3(0, 1.08, 0))
  const matMesh = new THREE.Mesh(createClippedPlate(9.1, 3.72, 0.08, 0.34, 0.035), materials.mat)
  matMesh.name = "work-surface-mat"
  matMesh.position.y = 2.38
  addMesh(workSurface, matMesh)

  const surfaceLinework = addPart(
    "work-surface-linework",
    "tabletop",
    new THREE.Vector3(0, 1.32, 0),
  )
  surfaceLinework.userData.explodeWithParent = true
  const lineY = 2.438
  const borderMaterial = new THREE.LineBasicMaterial({
    color: 0x00dfff,
    transparent: true,
    opacity: 0.72,
    toneMapped: false,
  })
  const borderPoints = clippedShape(8.78, 3.42, 0.3)
    .getPoints(8)
    .map((point) => new THREE.Vector3(point.x, lineY, point.y))
  borderPoints.push(borderPoints[0]?.clone() ?? new THREE.Vector3())
  const border = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(borderPoints),
    borderMaterial,
  )
  border.name = "mat-cyan-border"
  border.userData.partId = "work-surface"
  border.userData.explodeWithParent = true
  surfaceLinework.add(border)
  nodes.set(border.name, border)

  for (const x of [-2.9, 2.9]) {
    const divider = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 3.18), materials.cyan)
    divider.name = `mat-zone-divider-${x < 0 ? "left" : "right"}`
    divider.position.set(x, lineY, 0)
    setSurfaceDetail(divider, "work-surface")
    surfaceLinework.add(divider)
    meshes.set(divider.name, divider)
  }

  for (const radius of [0.22, 0.42, 0.7, 1.04]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, radius < 0.3 ? 0.026 : 0.012, 8, 64),
      materials.cyan,
    )
    ring.name = `hud-ring-${radius}`
    ring.rotation.x = Math.PI / 2
    ring.position.y = lineY + 0.008
    setSurfaceDetail(ring, "work-surface")
    surfaceLinework.add(ring)
    meshes.set(ring.name, ring)
  }

  const tickGeometry = new THREE.BoxGeometry(0.12, 0.014, 0.018)
  const tickInstances = new THREE.InstancedMesh(tickGeometry, materials.cyan, 24)
  tickInstances.name = "hud-radial-ticks"
  const tickMatrix = new THREE.Matrix4()
  const tickQuaternion = new THREE.Quaternion()
  for (let index = 0; index < 24; index += 1) {
    const angle = (index / 24) * Math.PI * 2
    tickQuaternion.setFromAxisAngle(up, -angle)
    tickMatrix.compose(
      new THREE.Vector3(Math.cos(angle) * 0.88, lineY + 0.01, Math.sin(angle) * 0.88),
      tickQuaternion,
      new THREE.Vector3(1, 1, 1),
    )
    tickInstances.setMatrixAt(index, tickMatrix)
  }
  tickInstances.instanceMatrix.needsUpdate = true
  tickInstances.userData.partId = "work-surface"
  tickInstances.userData.explodeWithParent = true
  surfaceLinework.add(tickInstances)
  meshes.set(tickInstances.name, tickInstances)

  const addChevron = (x: number, z: number, flipX: number, flipZ: number, index: number) => {
    const chevron = new THREE.Group()
    chevron.name = `mat-corner-chevron-${index}`
    chevron.position.set(x, lineY + 0.012, z)
    const first = createBeam(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.34 * flipX, 0, 0.34 * flipZ),
      0.045,
      0.025,
      materials.cyan,
      `${chevron.name}-a`,
    )
    const second = createBeam(
      new THREE.Vector3(0.34 * flipX, 0, 0.34 * flipZ),
      new THREE.Vector3(0.72 * flipX, 0, 0.34 * flipZ),
      0.045,
      0.025,
      materials.cyan,
      `${chevron.name}-b`,
    )
    for (const beam of [first, second]) {
      setSurfaceDetail(beam, "work-surface")
      chevron.add(beam)
      meshes.set(beam.name, beam)
    }
    surfaceLinework.add(chevron)
  }
  addChevron(-4.02, -1.36, 1, 1, 0)
  addChevron(4.02, -1.36, -1, 1, 1)
  addChevron(-4.02, 1.36, 1, -1, 2)
  addChevron(4.02, 1.36, -1, -1, 3)

  const lightRails = addPart("light-rails", "tabletop", new THREE.Vector3(0, -0.9, 0))
  const railY = 1.9
  const railSegments: readonly [string, THREE.Vector3, THREE.Vector3, THREE.Material][] = [
    [
      "front-cyan-left",
      new THREE.Vector3(-5.2, railY, 3.02),
      new THREE.Vector3(-0.9, railY, 3.02),
      materials.cyan,
    ],
    [
      "front-magenta-center",
      new THREE.Vector3(-0.7, railY, 3.02),
      new THREE.Vector3(1.2, railY, 3.02),
      materials.magenta,
    ],
    [
      "front-cyan-right",
      new THREE.Vector3(1.4, railY, 3.02),
      new THREE.Vector3(5.25, railY, 3.02),
      materials.cyan,
    ],
    [
      "rear-cyan-left",
      new THREE.Vector3(-5.2, railY, -3.02),
      new THREE.Vector3(-0.55, railY, -3.02),
      materials.cyan,
    ],
    [
      "rear-magenta-right",
      new THREE.Vector3(0.4, railY, -3.02),
      new THREE.Vector3(5.1, railY, -3.02),
      materials.magenta,
    ],
    [
      "left-magenta",
      new THREE.Vector3(-6.05, railY, -2.12),
      new THREE.Vector3(-6.05, railY, -0.6),
      materials.magenta,
    ],
    [
      "left-cyan",
      new THREE.Vector3(-6.05, railY, -0.38),
      new THREE.Vector3(-6.05, railY, 2.12),
      materials.cyan,
    ],
    [
      "right-cyan",
      new THREE.Vector3(6.05, railY, -2.1),
      new THREE.Vector3(6.05, railY, 0.9),
      materials.cyan,
    ],
    [
      "right-magenta",
      new THREE.Vector3(6.05, railY, 1.12),
      new THREE.Vector3(6.05, railY, 2.12),
      materials.magenta,
    ],
  ]
  for (const [name, start, end, material] of railSegments) {
    const rail = createBeam(start, end, 0.1, 0.1, material, `rail-${name}`)
    addMesh(lightRails, rail)
  }

  const controlPods = addPart("control-pods", "tabletop", new THREE.Vector3(0, 0.95, 0))
  const corners: readonly [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]
  for (const [index, corner] of corners.entries()) {
    const [sideX, sideZ] = corner
    if (sideX === undefined || sideZ === undefined) continue
    const pod = new THREE.Mesh(createClippedPlate(1.3, 0.8, 0.15, 0.18, 0.04), materials.black)
    pod.name = `corner-control-pod-${index}`
    pod.position.set(sideX * 5.18, 2.33, sideZ * 2.18)
    addMesh(controlPods, pod)
    const buttonGeometry = new THREE.ConeGeometry(0.16, 0.05, 3)
    const button = new THREE.Mesh(
      buttonGeometry,
      index % 2 === 0 ? materials.cyan : materials.magenta,
    )
    button.name = `triangle-control-button-${index}`
    button.position.set(sideX * 5.24, 2.45, sideZ * 2.14)
    button.rotation.x = Math.PI
    button.rotation.y = sideX * sideZ * 0.55
    setSurfaceDetail(button, "control-pods")
    controlPods.add(button)
    meshes.set(button.name, button)
    const secondaryButton = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.055, 12),
      index % 2 === 0 ? materials.magenta : materials.cyan,
    )
    secondaryButton.name = `round-control-button-${index}`
    secondaryButton.position.set(sideX * 4.83, 2.45, sideZ * 2.14)
    setSurfaceDetail(secondaryButton, "control-pods")
    controlPods.add(secondaryButton)
    meshes.set(secondaryButton.name, secondaryButton)
    for (let slot = 0; slot < 4; slot += 1) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.28), materials.cyan)
      vent.name = `control-vent-${index}-${slot}`
      vent.position.set(sideX * (4.88 + slot * 0.12), 2.44, sideZ * 2.43)
      setSurfaceDetail(vent, "control-pods")
      controlPods.add(vent)
      meshes.set(vent.name, vent)
    }
  }

  const latchPart = addPart("front-latch", "tabletop", new THREE.Vector3(0, -1.25, 1.2))
  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.16), materials.silver)
  latch.name = "front-center-latch"
  latch.position.set(0, 1.73, 3.03)
  latch.rotation.x = -0.18
  addMesh(latchPart, latch)

  const createLeg = (sideX: -1 | 1, sideZ: -1 | 1) => {
    const sideName = sideX < 0 ? "left" : "right"
    const depthName = sideZ < 0 ? "rear" : "front"
    const assemblyId = `leg-${sideName}-${depthName}`
    const hipId = `${assemblyId}-hip`
    const upperId = `${assemblyId}-upper`
    const lowerId = `${assemblyId}-lower`
    const hipPart = addPart(hipId, assemblyId, new THREE.Vector3(sideX * 1.75, -0.82, sideZ * 1.2))
    const upperPart = addPart(
      upperId,
      assemblyId,
      new THREE.Vector3(sideX * 2, -1.08, sideZ * 1.35),
    )
    const lowerPart = addPart(
      lowerId,
      assemblyId,
      new THREE.Vector3(sideX * 2.25, -1.3, sideZ * 1.55),
    )
    for (const part of [hipPart, upperPart, lowerPart])
      part.position.set(sideX * 4.62, 1.38, sideZ * 2.08)
    const upperEnd = new THREE.Vector3(sideX * 0.48, -1.38, sideZ * 0.22)
    const lowerEnd = new THREE.Vector3(sideX * 0.92, -3.05, sideZ * 0.48)

    const hip = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.42, 32), materials.black)
    hip.name = `${assemblyId}-hip-joint`
    hip.rotation.x = Math.PI / 2
    addMesh(hipPart, hip)
    const jointRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.065, 10, 32),
      materials.magenta,
    )
    jointRing.name = `${assemblyId}-joint-ring`
    jointRing.position.z = sideZ * 0.245
    setSurfaceDetail(jointRing, hipId)
    hipPart.add(jointRing)
    meshes.set(jointRing.name, jointRing)

    const upperCore = createBeam(
      new THREE.Vector3(),
      upperEnd,
      0.7,
      0.58,
      materials.black,
      `${assemblyId}-upper-core`,
    )
    const upperArmor = createBeam(
      new THREE.Vector3(0, -0.08, 0),
      upperEnd.clone().multiplyScalar(0.94),
      0.52,
      0.64,
      materials.blue,
      `${assemblyId}-upper-armor`,
    )
    addMesh(upperPart, upperCore)
    addMesh(upperPart, upperArmor)
    const upperCheek = createBeam(
      new THREE.Vector3(sideX * 0.16, -0.18, 0),
      upperEnd
        .clone()
        .multiplyScalar(0.84)
        .add(new THREE.Vector3(sideX * 0.16, 0, 0)),
      0.18,
      0.7,
      materials.silver,
      `${assemblyId}-upper-cheek`,
    )
    setSurfaceDetail(upperCheek, upperId)
    upperPart.add(upperCheek)
    meshes.set(upperCheek.name, upperCheek)
    const upperPiston = createCylinderBeam(
      new THREE.Vector3(sideX * -0.2, -0.16, sideZ * -0.18),
      upperEnd
        .clone()
        .multiplyScalar(0.82)
        .add(new THREE.Vector3(sideX * -0.2, 0, sideZ * -0.18)),
      0.095,
      materials.silver,
      `${assemblyId}-upper-piston`,
    )
    setSurfaceDetail(upperPiston, upperId)
    upperPart.add(upperPiston)
    meshes.set(upperPiston.name, upperPiston)

    const lowerCore = createBeam(
      upperEnd,
      lowerEnd,
      0.78,
      0.68,
      materials.black,
      `${assemblyId}-lower-core`,
    )
    const lowerArmor = createBeam(
      upperEnd.clone().lerp(lowerEnd, 0.08),
      upperEnd.clone().lerp(lowerEnd, 0.9),
      0.58,
      0.73,
      materials.blue,
      `${assemblyId}-lower-armor`,
    )
    addMesh(lowerPart, lowerCore)
    addMesh(lowerPart, lowerArmor)
    const knee = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.52, 24), materials.black)
    knee.name = `${assemblyId}-knee-joint`
    knee.position.copy(upperEnd)
    knee.rotation.x = Math.PI / 2
    setSurfaceDetail(knee, lowerId)
    lowerPart.add(knee)
    meshes.set(knee.name, knee)
    const kneeRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.055, 8, 28), materials.cyan)
    kneeRing.name = `${assemblyId}-knee-ring`
    kneeRing.position.copy(upperEnd).add(new THREE.Vector3(0, 0, sideZ * 0.29))
    setSurfaceDetail(kneeRing, lowerId)
    lowerPart.add(kneeRing)
    meshes.set(kneeRing.name, kneeRing)
    const lowerCheek = createBeam(
      upperEnd
        .clone()
        .lerp(lowerEnd, 0.17)
        .add(new THREE.Vector3(sideX * 0.18, 0, 0)),
      upperEnd
        .clone()
        .lerp(lowerEnd, 0.78)
        .add(new THREE.Vector3(sideX * 0.18, 0, 0)),
      0.2,
      0.8,
      materials.silver,
      `${assemblyId}-lower-cheek`,
    )
    setSurfaceDetail(lowerCheek, lowerId)
    lowerPart.add(lowerCheek)
    meshes.set(lowerCheek.name, lowerCheek)
    const lowerPiston = createCylinderBeam(
      upperEnd
        .clone()
        .lerp(lowerEnd, 0.2)
        .add(new THREE.Vector3(sideX * -0.22, 0, sideZ * -0.2)),
      upperEnd
        .clone()
        .lerp(lowerEnd, 0.76)
        .add(new THREE.Vector3(sideX * -0.22, 0, sideZ * -0.2)),
      0.085,
      materials.silver,
      `${assemblyId}-lower-piston`,
    )
    setSurfaceDetail(lowerPiston, lowerId)
    lowerPart.add(lowerPiston)
    meshes.set(lowerPiston.name, lowerPiston)

    const cyanStrip = createBeam(
      new THREE.Vector3(0, -0.2, sideZ * 0.36),
      upperEnd
        .clone()
        .multiplyScalar(0.85)
        .add(new THREE.Vector3(0, 0, sideZ * 0.36)),
      0.11,
      0.055,
      materials.cyan,
      `${assemblyId}-cyan-strip`,
    )
    setSurfaceDetail(cyanStrip, upperId)
    upperPart.add(cyanStrip)
    meshes.set(cyanStrip.name, cyanStrip)
    const magentaStrip = createBeam(
      upperEnd.clone().add(new THREE.Vector3(sideX * 0.31, -0.08, 0)),
      lowerEnd
        .clone()
        .lerp(upperEnd, 0.14)
        .add(new THREE.Vector3(sideX * 0.31, 0, 0)),
      0.1,
      0.06,
      materials.magenta,
      `${assemblyId}-magenta-strip`,
    )
    setSurfaceDetail(magentaStrip, lowerId)
    lowerPart.add(magentaStrip)
    meshes.set(magentaStrip.name, magentaStrip)
    const outerMagentaStrip = createBeam(
      new THREE.Vector3(sideX * 0.38, -0.18, sideZ * -0.25),
      upperEnd
        .clone()
        .multiplyScalar(0.82)
        .add(new THREE.Vector3(sideX * 0.2, 0, sideZ * -0.25)),
      0.09,
      0.05,
      materials.magenta,
      `${assemblyId}-outer-magenta-strip`,
    )
    setSurfaceDetail(outerMagentaStrip, upperId)
    upperPart.add(outerMagentaStrip)
    meshes.set(outerMagentaStrip.name, outerMagentaStrip)

    const foot = new THREE.Mesh(createClippedPlate(1.15, 0.92, 0.38, 0.18, 0.07), materials.black)
    foot.name = `${assemblyId}-foot`
    foot.position.copy(lowerEnd).add(new THREE.Vector3(sideX * 0.16, -0.12, sideZ * 0.12))
    foot.rotation.z = sideX * -0.24
    addMesh(lowerPart, foot)
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.76), materials.silver)
    toe.name = `${assemblyId}-toe-cap`
    toe.position.copy(foot.position).add(new THREE.Vector3(sideX * 0.25, 0.06, sideZ * 0.1))
    toe.rotation.z = sideX * -0.24
    setSurfaceDetail(toe, lowerId)
    lowerPart.add(toe)
    meshes.set(toe.name, toe)

    const socket = new THREE.Object3D()
    socket.name = `socket-${assemblyId}`
    socket.position.set(0, 0, 0)
    hipPart.add(socket)
    sockets.set(socket.name, socket)
    const collider = new THREE.Object3D()
    collider.name = `collider-${assemblyId}`
    collider.userData.shape = "compound-boxes"
    collider.userData.parts = ["upper", "lower", "foot"]
    lowerPart.add(collider)
    colliders.set(collider.name, collider)
  }
  createLeg(-1, -1)
  createLeg(1, -1)
  createLeg(-1, 1)
  createLeg(1, 1)

  for (const [index, anchorPosition] of [
    new THREE.Vector3(-3, 2.47, 0),
    new THREE.Vector3(0, 2.47, 0),
    new THREE.Vector3(3, 2.47, 0),
    new THREE.Vector3(-1.8, 2.47, -0.95),
    new THREE.Vector3(1.8, 2.47, -0.95),
  ].entries()) {
    const socket = new THREE.Object3D()
    socket.name = `socket-desktop-asset-${index + 1}`
    socket.position.copy(anchorPosition)
    root.add(socket)
    sockets.set(socket.name, socket)
  }

  const tabletopCollider = new THREE.Object3D()
  tabletopCollider.name = "collider-tabletop"
  tabletopCollider.position.y = 2
  tabletopCollider.userData.shape = "box"
  tabletopCollider.userData.size = [12, 0.7, 5.8]
  root.add(tabletopCollider)
  colliders.set(tabletopCollider.name, tabletopCollider)

  const originals = new Map<string, THREE.Vector3>()
  for (const [id, part] of parts) originals.set(id, part.position.clone())

  const setExplosion = (amount: number) => {
    const clamped = THREE.MathUtils.clamp(amount, 0, 1)
    const eased = clamped * clamped * (3 - 2 * clamped)
    for (const [id, part] of parts) {
      const original = originals.get(id)
      const explodeArray = part.userData.explodeVector
      if (original === undefined || !Array.isArray(explodeArray) || explodeArray.length !== 3)
        continue
      const explode = new THREE.Vector3(
        Number(explodeArray[0]),
        Number(explodeArray[1]),
        Number(explodeArray[2]),
      )
      part.position.copy(original).addScaledVector(explode, eased)
    }
  }

  const setLightsEnabled = (enabled: boolean) => {
    for (const [index, material] of emissiveMaterials.entries()) {
      material.emissiveIntensity = enabled ? (emissiveStrengths[index] ?? 0) : 0
      material.color.copy(
        enabled
          ? (emissiveColors[index] ?? new THREE.Color())
          : (inactiveColors[index] ?? new THREE.Color()),
      )
    }
  }

  const resolvePart = (object: THREE.Object3D): THREE.Group | null => {
    let current: THREE.Object3D | null = object
    while (current !== null && current !== root) {
      const partId: unknown = current.userData.partId
      if (typeof partId === "string") return parts.get(partId) ?? null
      current = current.parent
    }
    return null
  }

  const partManifest = [...parts.entries()].map(([id, part]) => ({
    id,
    destructionGroup:
      [...destructionGroups.entries()].find(([, members]) => members.includes(id))?.[0] ??
      "tabletop",
    meshNames: Array.from(meshes.values())
      .filter((mesh) => resolvePart(mesh) === part)
      .map((mesh) => mesh.name),
  }))

  const dispose = () => {
    const geometries = new Set<THREE.BufferGeometry>()
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) geometries.add(object.geometry)
      if (object instanceof THREE.Line) geometries.add(object.geometry)
    })
    for (const geometry of geometries) geometry.dispose()
    borderMaterial.dispose()
    for (const material of materialList) material.dispose()
    for (const texture of textures) texture.dispose()
  }

  root.userData.sculptRuntime = {
    nodes,
    meshes,
    sockets,
    colliders,
    destructionGroups,
    partManifest,
    setExplosion,
    setLightsEnabled,
    resolvePart,
    dispose,
  }
  root.userData.assetTypeId = "cyber-desk"
  root.userData.referenceLimit = "single-view; rear and underside geometry are inferred"
  return root
}
