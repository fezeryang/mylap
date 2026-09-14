import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ExtrudeGeometry,
  type ColorRepresentation,
} from "three"
import type { Vector3 } from "three"

export type BulletinBoardPart = {
  readonly id: string
  readonly node: Group | Mesh
  readonly authoredPosition?: Vector3
  readonly centralClearance?: number
}

export interface BulletinBoardModel {
  readonly root: Group
  readonly parts: readonly BulletinBoardPart[]
  readonly selectable: readonly Mesh[]
}

interface MaterialSet {
  felt: MeshStandardMaterial
  silverMetal: MeshStandardMaterial
  ledCyan: MeshStandardMaterial
  ledMagenta: MeshStandardMaterial
  endcapPlastic: MeshStandardMaterial
}

/**
 * Create material set for bulletin board based on reference image analysis
 */
function createBulletinBoardMaterials(): MaterialSet {
  // Light gray felt surface - high roughness, no metalness
  const felt = new MeshStandardMaterial({
    color: 0xc9c9cd as ColorRepresentation,
    roughness: 0.92,
    metalness: 0.0,
  })

  // Silver-white metal frame and stands - metallic with moderate roughness
  const silverMetal = new MeshStandardMaterial({
    color: 0xdadcdf as ColorRepresentation,
    roughness: 0.30,
    metalness: 0.90,
  })

  // Cyan LED emissive - top and bottom strips
  const ledCyan = new MeshStandardMaterial({
    color: 0x35b6ff as ColorRepresentation,
    emissive: 0x35b6ff as ColorRepresentation,
    emissiveIntensity: 2.5,
    roughness: 0.1,
    metalness: 0.0,
  })

  // Magenta LED emissive - left and right strips
  const ledMagenta = new MeshStandardMaterial({
    color: 0xf070e8 as ColorRepresentation,
    emissive: 0xf070e8 as ColorRepresentation,
    emissiveIntensity: 2.5,
    roughness: 0.1,
    metalness: 0.0,
  })

  // Charcoal plastic endcaps - matte dielectric
  const endcapPlastic = new MeshStandardMaterial({
    color: 0x3b3b40 as ColorRepresentation,
    roughness: 0.72,
    metalness: 0.0,
  })

  return { felt, silverMetal, ledCyan, ledMagenta, endcapPlastic }
}

/**
 * Create rounded rectangle shape for frame extrusion
 */
function createRoundedRectShape(
  width: number,
  height: number,
  radius: number
): Shape {
  const shape = new Shape()
  const x = -width / 2
  const y = -height / 2

  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)

  return shape
}

/**
 * Create the complete bulletin board model with LED strips and A-frame stands
 */
export function createBulletinBoardModel(): BulletinBoardModel {
  const root = new Group()
  root.name = "bulletin-board-root"

  const materials = createBulletinBoardMaterials()
  const parts: BulletinBoardPart[] = []
  const selectable: Mesh[] = []

  // Board assembly container
  const boardAssembly = new Group()
  boardAssembly.name = "board-assembly"
  root.add(boardAssembly)
  parts.push({ id: "board-assembly", node: boardAssembly, authoredPosition: boardAssembly.position.clone(), centralClearance: 0 })

  // === BOARD SURFACE (felt) ===
  // 16:10 aspect ratio (1.6:1)
  const boardGeometry = new BoxGeometry(1.60, 1.0, 0.035)
  const boardSurface = new Mesh(boardGeometry, materials.felt)
  boardSurface.name = "board-surface"
  boardSurface.position.set(0, 0, -0.005) // Slightly recessed
  const boardSurfaceGroup = new Group()
  boardSurfaceGroup.name = "board-surface-group"
  boardSurfaceGroup.add(boardSurface)
  boardAssembly.add(boardSurfaceGroup)
  parts.push({ id: "board-surface", node: boardSurfaceGroup, authoredPosition: boardSurfaceGroup.position.clone(), centralClearance: 0 })
  selectable.push(boardSurface)

  // === FRAME (silver metal with rounded corners) ===
  // 16:10 aspect ratio with proportional frame thickness
  const frameWidth = 1.70
  const frameHeight = 1.1
  const frameThickness = 0.05
  const cornerRadius = 0.08

  // Outer frame shape
  const outerShape = createRoundedRectShape(frameWidth, frameHeight, cornerRadius)
  // Inner cutout (board opening)
  const innerShape = createRoundedRectShape(
    frameWidth - 2 * frameThickness,
    frameHeight - 2 * frameThickness,
    cornerRadius * 0.6
  )
  outerShape.holes.push(innerShape)

  const frameGeometry = new ExtrudeGeometry(outerShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelSegments: 2,
  })

  const boardFrame = new Mesh(frameGeometry, materials.silverMetal)
  boardFrame.name = "board-frame"
  boardFrame.position.set(0, 0, 0)
  const boardFrameGroup = new Group()
  boardFrameGroup.name = "board-frame-group"
  boardFrameGroup.add(boardFrame)
  boardAssembly.add(boardFrameGroup)
  parts.push({ id: "board-frame", node: boardFrameGroup, authoredPosition: boardFrameGroup.position.clone(), centralClearance: 0 })
  selectable.push(boardFrame)

  // === LED STRIPS ===
  const ledRadius = 0.006
  const ledSegments = 16

  // Top LED strip (cyan)
  const ledTopGeometry = new CylinderGeometry(
    ledRadius,
    ledRadius,
    frameWidth - 0.1,
    ledSegments
  )
  const ledTop = new Mesh(ledTopGeometry, materials.ledCyan)
  ledTop.name = "led-top"
  ledTop.rotation.z = Math.PI / 2
  const ledTopGroup = new Group()

  ledTopGroup.name = "ledTop-group"

  ledTop.position.set(0, frameHeight / 2 - 0.03, 0.025)
  ledTopGroup.add(ledTop)
  boardAssembly.add(ledTopGroup)
  parts.push({ id: "led-top", node: ledTopGroup, authoredPosition: ledTop.position.clone(), centralClearance: 0 })

  // Bottom LED strip (cyan)
  const ledBottomGeometry = new CylinderGeometry(
    ledRadius,
    ledRadius,
    frameWidth - 0.1,
    ledSegments
  )
  const ledBottom = new Mesh(ledBottomGeometry, materials.ledCyan)
  ledBottom.name = "led-bottom"
  ledBottom.rotation.z = Math.PI / 2
  const ledBottomGroup = new Group()

  ledBottomGroup.name = "ledBottom-group"

  ledBottom.position.set(0, -frameHeight / 2 + 0.03, 0.025)
  ledBottomGroup.add(ledBottom)
  boardAssembly.add(ledBottomGroup)
  parts.push({ id: "led-bottom", node: ledBottomGroup, authoredPosition: ledBottom.position.clone(), centralClearance: 0 })

  // Left LED strip (magenta)
  const ledLeftGeometry = new CylinderGeometry(
    ledRadius,
    ledRadius,
    frameHeight - 0.1,
    ledSegments
  )
  const ledLeft = new Mesh(ledLeftGeometry, materials.ledMagenta)
  ledLeft.name = "led-left"
  const ledLeftGroup = new Group()

  ledLeftGroup.name = "ledLeft-group"

  ledLeft.position.set(-frameWidth / 2 + 0.03, 0, 0.025)
  ledLeftGroup.add(ledLeft)
  boardAssembly.add(ledLeftGroup)
  parts.push({ id: "led-left", node: ledLeftGroup, authoredPosition: ledLeft.position.clone(), centralClearance: 0 })

  // Right LED strip (magenta)
  const ledRightGeometry = new CylinderGeometry(
    ledRadius,
    ledRadius,
    frameHeight - 0.1,
    ledSegments
  )
  const ledRight = new Mesh(ledRightGeometry, materials.ledMagenta)
  ledRight.name = "led-right"
  const ledRightGroup = new Group()

  ledRightGroup.name = "ledRight-group"

  ledRight.position.set(frameWidth / 2 - 0.03, 0, 0.025)
  ledRightGroup.add(ledRight)
  boardAssembly.add(ledRightGroup)
  parts.push({ id: "led-right", node: ledRightGroup, authoredPosition: ledRight.position.clone(), centralClearance: 0 })

  // === PIVOT DISCS ===
  const pivotRadius = 0.03
  const pivotHeight = 0.01

  const pivotGeometry = new CylinderGeometry(
    pivotRadius,
    pivotRadius,
    pivotHeight,
    32
  )

  // Left pivot disc with emissive ring accent
  const pivotLeft = new Mesh(pivotGeometry, materials.silverMetal)
  pivotLeft.name = "pivot-left"
  pivotLeft.rotation.z = Math.PI / 2
  const pivotLeftGroup = new Group()

  pivotLeftGroup.name = "pivotLeft-group"

  pivotLeft.position.set(-frameWidth / 2, 0, 0.03)
  pivotLeftGroup.add(pivotLeft)
  boardAssembly.add(pivotLeftGroup)
  parts.push({ id: "pivot-left", node: pivotLeftGroup, authoredPosition: pivotLeft.position.clone(), centralClearance: 0 })
  selectable.push(pivotLeft)

  // Right pivot disc
  const pivotRight = new Mesh(pivotGeometry, materials.silverMetal)
  pivotRight.name = "pivot-right"
  pivotRight.rotation.z = Math.PI / 2
  const pivotRightGroup = new Group()

  pivotRightGroup.name = "pivotRight-group"

  pivotRight.position.set(frameWidth / 2, 0, 0.03)
  pivotRightGroup.add(pivotRight)
  boardAssembly.add(pivotRightGroup)
  parts.push({ id: "pivot-right", node: pivotRightGroup, authoredPosition: pivotRight.position.clone(), centralClearance: 0 })
  selectable.push(pivotRight)

  // === LEFT STAND ASSEMBLY ===
  const standLeft = createStandAssembly(
    materials,
    "left",
    -frameWidth / 2,
    parts,
    selectable
  )
  root.add(standLeft)

  // === RIGHT STAND ASSEMBLY (mirrored) ===
  const standRight = createStandAssembly(
    materials,
    "right",
    frameWidth / 2,
    parts,
    selectable
  )
  root.add(standRight)

  // Mark root with sculptRuntime for action-readiness
  root.userData['sculptRuntime'] = {
    pivots: [
      { id: "pivot-left", axis: "x", node: pivotLeft },
      { id: "pivot-right", axis: "x", node: pivotRight },
    ],
    sockets: [
      { id: "board-center", position: [0, 0, 0] },
      { id: "frame-top", position: [0, frameHeight / 2, 0] },
      { id: "frame-bottom", position: [0, -frameHeight / 2, 0] },
    ],
    colliders: [
      { id: "board-collider", mesh: boardSurface },
      { id: "frame-collider", mesh: boardFrame },
    ],
    destructionGroups: [
      { id: "board-group", parts: ["board-surface", "board-frame"] },
      { id: "led-group", parts: ["led-top", "led-bottom", "led-left", "led-right"] },
      { id: "stand-left-group", parts: ["stand-left"] },
      { id: "stand-right-group", parts: ["stand-right"] },
    ],
  }

  // Place model so stand feet are on ground level (y ≈ -3.17 in TODŌU scene)
  // Stand feet in local coords are at y ≈ -0.53, desk ground is at y ≈ -3.17
  // So we need: local_foot_y + root.y = scene_ground_y
  // -0.53 + root.y = -3.17, therefore root.y = -2.64
  root.position.y = -2.64

  return { root, parts, selectable }
}

/**
 * Create one A-frame stand assembly (left or right)
 */
function createStandAssembly(
  materials: MaterialSet,
  side: "left" | "right",
  xOffset: number,
  parts: Array<{ id: string; node: Group | Mesh }>,
  selectable: Mesh[]
): Group {
  const stand = new Group()
  stand.name = `stand-${side}`
  parts.push({ id: `stand-${side}`, node: stand })

  const strutWidth = 0.015
  const strutDepth = 0.6
  const baseRailLength = 0.4
  const splayAngle = Math.PI / 6 // 30 degrees fore/aft splay

  // Strut geometry with edge fillets
  const strutGeometry = new BoxGeometry(strutWidth, strutDepth, strutWidth)

  // Front strut
  const frontStrut = new Mesh(strutGeometry, materials.silverMetal)
  frontStrut.name = `stand-${side}-strut-front`
  frontStrut.rotation.x = -splayAngle
  frontStrut.position.set(
    xOffset,
    -strutDepth / 2 * Math.cos(splayAngle),
    strutDepth / 2 * Math.sin(splayAngle) - 0.4
  )
  stand.add(frontStrut)
  parts.push({ id: `stand-${side}-strut-front`, node: frontStrut })
  selectable.push(frontStrut)

  // Rear strut (with LED strip accent)
  const rearStrut = new Mesh(strutGeometry, materials.silverMetal)
  rearStrut.name = `stand-${side}-strut-rear`
  rearStrut.rotation.x = splayAngle
  rearStrut.position.set(
    xOffset,
    -strutDepth / 2 * Math.cos(splayAngle),
    -strutDepth / 2 * Math.sin(splayAngle) - 0.4
  )
  stand.add(rearStrut)
  parts.push({ id: `stand-${side}-strut-rear`, node: rearStrut })
  selectable.push(rearStrut)

  // Base rail connecting strut feet
  const baseRailGeometry = new BoxGeometry(strutWidth, strutWidth, baseRailLength)
  const baseRail = new Mesh(baseRailGeometry, materials.silverMetal)
  baseRail.name = `stand-${side}-base`
  baseRail.position.set(xOffset, -strutDepth * Math.cos(splayAngle), -0.4)
  stand.add(baseRail)
  parts.push({ id: `stand-${side}-base`, node: baseRail })
  selectable.push(baseRail)

  // Endcaps (charcoal plastic feet)
  const endcapGeometry = new BoxGeometry(0.02, 0.015, 0.02)

  const frontEndcap = new Mesh(endcapGeometry, materials.endcapPlastic)
  frontEndcap.name = `stand-${side}-endcap-front`
  frontEndcap.position.set(
    xOffset,
    -strutDepth * Math.cos(splayAngle) - 0.01,
    strutDepth * Math.sin(splayAngle) - 0.4
  )
  stand.add(frontEndcap)
  parts.push({ id: `stand-${side}-endcap-front`, node: frontEndcap })

  const rearEndcap = new Mesh(endcapGeometry, materials.endcapPlastic)
  rearEndcap.name = `stand-${side}-endcap-rear`
  rearEndcap.position.set(
    xOffset,
    -strutDepth * Math.cos(splayAngle) - 0.01,
    -strutDepth * Math.sin(splayAngle) - 0.4
  )
  stand.add(rearEndcap)
  parts.push({ id: `stand-${side}-endcap-rear`, node: rearEndcap })

  return stand
}

/**
 * Dispose of bulletin board model resources
 */
export function disposeBulletinBoardModel(model: BulletinBoardModel): void {
  // Dispose geometries and materials
  model.root.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.geometry?.dispose()
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => m.dispose())
      } else {
        obj.material?.dispose()
      }
    }
  })
}
