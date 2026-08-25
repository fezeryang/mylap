import { readFileSync, writeFileSync } from "node:fs"

const specPath = new URL("../object-sculpt-spec.json", import.meta.url)
const spec = JSON.parse(readFileSync(specPath, "utf8"))
const componentTemplate = spec.componentTree[0]
const materialTemplate = spec.materials[0]

const clone = (value) => structuredClone(value)

function component({
  id,
  name,
  level,
  parent,
  role = "static-part",
  primitive = "box",
  topologyClass = "assembled-solid",
  topologyRationale,
  dimensions,
  position,
  rotation = [0, 0, 0],
  material,
  confidence = 0.9,
  localFeatures = [],
  attachment = null,
}) {
  const value = clone(componentTemplate)
  value.id = id
  value.name = name
  value.level = level
  value.parent = parent
  value.role = role
  value.primitive = primitive
  value.topologyClass = topologyClass
  value.topologyRationale = topologyRationale
  value.dimensions = { ...dimensions, units: "model-units", confidence }
  value.transform = { position, rotation, scale: [1, 1, 1] }
  value.material = material
  value.materialLayers = [material]
  value.confidence = confidence
  value.localFeatures = localFeatures
  value.attachment = attachment
  value.actionProfile.animationRole = id === "root" ? "root" : role
  value.actionProfile.pivot = {
    mode: id.startsWith("leg-") ? "socket" : "center",
    localPosition: [0, 0, 0],
    axis: [0, 1, 0],
    confidence,
  }
  value.actionProfile.collider = {
    type: primitive === "cylinder" ? "cylinder" : "box",
    offset: [0, 0, 0],
    scale: [dimensions.width, dimensions.height, dimensions.depth],
    isTrigger: false,
    notes: "Runtime proxy; visual meshes are not physics colliders.",
  }
  value.actionProfile.destruction = {
    breakable: id !== "root" && id !== "work-surface-linework",
    fractureGroup: id.startsWith("leg-") ? id.split("-").slice(0, 3).join("-") : "tabletop",
    seamRefs: parent ? [`${parent}/${id}`] : [],
    detachableFragments: id === "root" ? [] : [id],
    breakImpulse: id.startsWith("leg-") ? 8 : 12,
    debrisMaterial: material,
  }
  value.evidenceRefs = ["full-object"]
  const palette = {
    "invisible-root": ["rgba(16, 19, 28, 1.0)", "rgba(16, 19, 28, 0.0)", "unknown"],
    "silver-shell": ["rgba(168, 185, 223, 1.0)", "rgba(127, 143, 192, 1.0)", "metal"],
    "black-chassis": ["rgba(8, 14, 27, 1.0)", "rgba(17, 26, 44, 1.0)", "metal"],
    "desk-mat": ["rgba(7, 21, 43, 1.0)", "rgba(11, 35, 67, 1.0)", "rubber"],
    "blue-armor": ["rgba(22, 75, 155, 1.0)", "rgba(7, 159, 224, 1.0)", "metal"],
    "cyan-emissive": ["rgba(0, 189, 232, 1.0)", "rgba(0, 242, 255, 1.0)", "plastic"],
  }
  const [dominantAlbedo, secondaryAlbedo, materialClass] = palette[material] ?? [
    "rgba(128, 128, 128, 1.0)",
    "rgba(64, 64, 64, 1.0)",
    "unknown",
  ]
  value.colorMaterialRecipe = {
    dominantAlbedo,
    secondaryAlbedo,
    materialClass,
    materialClassConfidence: confidence,
    evidenceRefs: ["full-object"],
  }
  value.geometryDescriptor.edgeTreatment = {
    type: "chamfer",
    bevelRadius: Math.min(dimensions.width, dimensions.height, dimensions.depth) * 0.08,
    segments: 3,
  }
  value.geometryDescriptor.topologyIntent = topologyRationale
  return value
}

function attachment(parentId, parentSocket, localStart, localEnd, contactType = "socket") {
  return {
    parentId,
    parentSocket,
    localStart,
    localEnd,
    baseRadius: 0.38,
    endRadius: 0.28,
    overlap: 0.12,
    embedDepth: 0.08,
    contactType,
    gapTolerance: 0.02,
    evidenceRefs: ["full-object"],
  }
}

const shellFeatures = [
  {
    id: "edge-bevel",
    type: "bevel",
    placement: "clipped perimeter",
    geometryEffect: "0.12 unit chamfer",
    confidence: 0.94,
  },
]
const surfaceFeatures = [
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
]
const podFeatures = [
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
]
const legFeatures = [
  {
    id: "joint-rings",
    type: "emissive",
    placement: "hip axes",
    geometryEffect: "torus ring",
    confidence: 0.9,
  },
]

const parts = [
  component({
    id: "root",
    name: "Cyber Desk",
    level: "macro",
    parent: null,
    role: "body",
    dimensions: { width: 12, height: 4.4, depth: 5.8 },
    position: [0, 0, 0],
    material: "invisible-root",
    topologyRationale: "Transform-only root container with compound runtime collider.",
  }),
  component({
    id: "upper-shell",
    name: "Clipped upper shell",
    level: "macro",
    parent: "root",
    dimensions: { width: 12, height: 0.38, depth: 5.8 },
    position: [0, 2.1, 0],
    material: "silver-shell",
    localFeatures: shellFeatures,
    topologyRationale:
      "Rigid clipped-corner plate with countable beveled faces; authored as an extruded profile.",
  }),
  component({
    id: "lower-chassis",
    name: "Lower perimeter chassis",
    level: "meso",
    parent: "root",
    dimensions: { width: 12.15, height: 0.34, depth: 5.9 },
    position: [0, 1.82, 0],
    material: "black-chassis",
    localFeatures: [
      {
        id: "orange-status-array",
        type: "emissive",
        placement: "front and side bumpers",
        geometryEffect: "raised light bars",
        confidence: 0.91,
      },
    ],
    topologyRationale: "Rigid black bumper assembled beneath the shell.",
  }),
  component({
    id: "work-surface",
    name: "Inset work surface",
    level: "macro",
    parent: "upper-shell",
    dimensions: { width: 8.9, height: 0.09, depth: 3.48 },
    position: [0, 0.23, 0],
    material: "desk-mat",
    localFeatures: surfaceFeatures,
    topologyRationale: "Thin conforming inset following the tabletop aperture.",
    topologyClass: "conforming-shell",
  }),
  component({
    id: "work-surface-linework",
    name: "Work surface HUD linework",
    level: "micro",
    parent: "work-surface",
    dimensions: { width: 8.5, height: 0.02, depth: 3.2 },
    position: [0, 0.06, 0],
    material: "cyan-emissive",
    topologyClass: "surface-relief",
    topologyRationale: "Raised emissive micro relief parented to the mat.",
  }),
  component({
    id: "light-rails",
    name: "Segmented perimeter light rails",
    level: "meso",
    parent: "upper-shell",
    dimensions: { width: 11.4, height: 0.1, depth: 5.35 },
    position: [0, -0.06, 0],
    material: "cyan-emissive",
    topologyClass: "surface-relief",
    topologyRationale: "Thin emissive strips mounted within shell channels.",
  }),
  component({
    id: "control-pods",
    name: "Corner control pod system",
    level: "meso",
    parent: "upper-shell",
    dimensions: { width: 11.1, height: 0.14, depth: 4.9 },
    position: [0, 0.17, 0],
    material: "black-chassis",
    localFeatures: podFeatures,
    topologyRationale: "Four discrete rigid pods integrated into the shell corners.",
  }),
  component({
    id: "front-latch",
    name: "Front center latch",
    level: "micro",
    parent: "lower-chassis",
    dimensions: { width: 0.68, height: 0.22, depth: 0.18 },
    position: [0, 0, 2.96],
    material: "silver-shell",
    topologyRationale: "Small rigid latch seated in the front bumper.",
  }),
]

for (const x of [-1, 1]) {
  for (const z of [-1, 1]) {
    const corner = `${x < 0 ? "left" : "right"}-${z < 0 ? "rear" : "front"}`
    const hip = [x * 4.6, 1.55, z * 2.1]
    const knee = [x * 5.05, 0.15, z * 2.35]
    const foot = [x * 5.45, -1.55, z * 2.65]
    parts.push(
      component({
        id: `leg-${corner}-hip`,
        name: `${corner} hip joint`,
        level: "meso",
        parent: "lower-chassis",
        role: "joint",
        primitive: "cylinder",
        dimensions: { width: 0.76, height: 0.42, depth: 0.76 },
        position: hip,
        rotation: [Math.PI / 2, 0, 0],
        material: "black-chassis",
        localFeatures: legFeatures,
        attachment: attachment("lower-chassis", `socket-leg-${corner}`, hip, knee),
        topologyRationale: "Cylindrical socket joint connecting leg to chassis.",
      }),
      component({
        id: `leg-${corner}-upper`,
        name: `${corner} upper strut`,
        level: "macro",
        parent: `leg-${corner}-hip`,
        role: "leg",
        dimensions: { width: 0.72, height: 1.9, depth: 0.58 },
        position: knee,
        rotation: [0, 0, x * -0.28],
        material: "blue-armor",
        attachment: attachment(`leg-${corner}-hip`, `socket-strut-${corner}`, hip, knee, "overlap"),
        topologyRationale: "Tapered armored strut with rigid countable faces.",
      }),
      component({
        id: `leg-${corner}-lower`,
        name: `${corner} lower strut and foot`,
        level: "meso",
        parent: `leg-${corner}-upper`,
        role: "leg",
        dimensions: { width: 0.82, height: 1.95, depth: 0.7 },
        position: foot,
        rotation: [0, 0, x * -0.34],
        material: "blue-armor",
        attachment: attachment(
          `leg-${corner}-upper`,
          `socket-knee-${corner}`,
          knee,
          foot,
          "overlap",
        ),
        topologyRationale: "Tapered armored lower strut ending in a broad contact foot.",
      }),
    )
  }
}

spec.componentTree = parts
spec.preSpecAssessment.unknownsToResolveBeforeImplementation = []

function material(id, name, baseColor, metalness, roughness, options = {}) {
  const value = clone(materialTemplate)
  value.id = id
  value.name = name
  value.baseColor = baseColor
  value.color = baseColor
  value.albedo = {
    dominant: baseColor,
    secondary: options.secondary ?? [baseColor],
    samplingNotes:
      options.samplingNotes ??
      "Sampled from the named reference crop; highlight color is not baked into albedo.",
  }
  value.colorVariation = {
    palette: [baseColor, ...(options.secondary ?? [])],
    pattern: options.pattern ?? "subtle procedural variation",
    amplitude: options.variation ?? 0.06,
    heightCorrelation: 0.1,
  }
  value.roughness = {
    base: roughness,
    variation: options.roughnessVariation ?? 0.08,
    map: "independent procedural roughness field",
    localResponse: options.localResponse ?? "cavities rougher, exposed bevels smoother",
  }
  value.metalness = { base: metalness, variation: 0.04 }
  value.normal = {
    pattern: options.normalPattern ?? "independent micro-grain field",
    strength: options.normalStrength ?? 0.12,
    scale: options.normalScale ?? 96,
    space: "tangent",
  }
  value.clearcoat = options.clearcoat ?? 0
  value.clearcoatRoughness = options.clearcoatRoughness ?? 0.2
  value.emissive = options.emissive ?? "#000000"
  value.emissiveIntensity = options.emissiveIntensity ?? 0
  value.localOverrides = options.localOverrides ?? []
  value.notes = options.notes ?? "Procedural PBR material with independent response channels."
  return value
}

spec.materials = [
  material("invisible-root", "Invisible root contract material", "#10131c", 0, 1, {
    normalStrength: 0,
    notes: "Complete non-rendered contract material for the transform root.",
  }),
  material("silver-shell", "Pearl lavender coated metal", "#a8b9df", 0.76, 0.22, {
    secondary: ["#7f8fc0", "#d1ddf2"],
    clearcoat: 0.42,
    clearcoatRoughness: 0.18,
    samplingNotes:
      "Cool lavender-gray midtone sampled from detail-evidence/zone-r0c1.png; bright white sweep is excluded as illumination.",
  }),
  material("black-chassis", "Satin black-blue chassis", "#080e1b", 0.62, 0.3, {
    secondary: ["#111a2c", "#02050b"],
    roughnessVariation: 0.1,
    normalScale: 72,
  }),
  material("desk-mat", "Navy woven rubber composite", "#07152b", 0.05, 0.78, {
    secondary: ["#0b2343", "#030914"],
    pattern: "fine woven grain independent from albedo",
    variation: 0.08,
    roughnessVariation: 0.12,
    normalPattern: "cross-woven micro normal",
    normalStrength: 0.24,
    normalScale: 180,
    localOverrides: [
      {
        id: "micro-grain",
        region: "entire inset mat",
        roughness: 0.82,
        normalStrength: 0.24,
        evidenceRef: "detail-evidence/zone-r1c1.png",
      },
    ],
  }),
  material("blue-armor", "Blue anodized leg armor", "#164b9b", 0.55, 0.24, {
    secondary: ["#079fe0", "#312f8f"],
    clearcoat: 0.3,
    clearcoatRoughness: 0.2,
    localOverrides: [
      {
        id: "leg-cyan",
        region: "front inset rail",
        emissive: "#00d9ff",
        emissiveIntensity: 5.2,
        evidenceRef: "detail-evidence/zone-r2c0.png",
      },
    ],
  }),
  material("cyan-emissive", "Cyan emissive acrylic", "#00bde8", 0.08, 0.16, {
    secondary: ["#00f2ff"],
    clearcoat: 0.5,
    emissive: "#00dfff",
    emissiveIntensity: 5.5,
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
  }),
  material("magenta-emissive", "Magenta emissive acrylic", "#ee18ef", 0.08, 0.18, {
    secondary: ["#8c20ff", "#ff42d0"],
    clearcoat: 0.48,
    emissive: "#ff18f4",
    emissiveIntensity: 4.8,
    localOverrides: [
      {
        id: "magenta-rail",
        region: "corner and front perimeter segments",
        emissive: "#ff18f4",
        emissiveIntensity: 4.8,
        evidenceRef: "detail-evidence/zone-r1c1.png",
      },
    ],
  }),
  material("orange-emissive", "Amber status emitter", "#ff6a00", 0.05, 0.2, {
    emissive: "#ff6200",
    emissiveIntensity: 4.4,
  }),
]

for (const materialId of ["silver-shell", "desk-mat", "blue-armor"]) {
  const reportPath = new URL(`../material-evidence/${materialId}.json`, import.meta.url)
  const report = JSON.parse(readFileSync(reportPath, "utf8"))
  const target = spec.materials.find((item) => item.id === materialId)
  target.referencePbr = {
    version: "1",
    sourceImage: report.sourceImage,
    extractor: "img2threejs extract_pbr_evidence.py",
    method: "single-image reference estimate",
    verdict: report.verdict,
    hardLimit: report.limitation,
    usable: report.ok && report.confidence >= report.targetThreshold,
    confidence: report.confidence,
    estimatedFidelity: report.estimatedFidelity,
    targetThreshold: report.targetThreshold,
    maps: report.maps,
  }
}

const detailLinks = {
  "silver-shell-bevel": "edge-bevel",
  "perimeter-cyan-rail": "cyan-rail",
  "perimeter-magenta-rail": "magenta-rail",
  "orange-status-lamps": "orange-status-array",
  "mat-border": "zone-linework",
  "mat-target-rings": "targeting-rings",
  "mat-corner-chevrons": "corner-chevrons",
  "corner-control-buttons": "triangle-buttons",
  "corner-vent-slots": "vent-slots",
  "leg-joint-rings": "joint-rings",
  "leg-cyan-strips": "leg-cyan",
  "mat-grain": "micro-grain",
}
for (const detail of spec.preSpecAssessment.detailInventory.details) {
  detail.mapsTo.ref = detailLinks[detail.id]
}

spec.repetitionSystems = [
  {
    id: "vent-slot-array",
    level: "micro",
    parent: "control-pods",
    count: 24,
    primitive: "box",
    material: "cyan-emissive",
    buildsGeometry: true,
    geometry: "recessed slot carrier",
    instanceScale: [0.035, 0.025, 0.12],
    placement: { mode: "radial", axis: [0, 1, 0], radius: 4.8, startAngleDeg: 10 },
  },
  {
    id: "orange-status-array",
    level: "micro",
    parent: "lower-chassis",
    count: 8,
    primitive: "box",
    material: "orange-emissive",
    buildsGeometry: true,
    geometry: "status light bars",
    instanceScale: [0.18, 0.04, 0.045],
    placement: { mode: "radial", axis: [0, 1, 0], radius: 5.2, startAngleDeg: 22.5 },
  },
  {
    id: "hud-radial-ticks",
    level: "micro",
    parent: "work-surface",
    count: 24,
    primitive: "box",
    material: "cyan-emissive",
    buildsGeometry: true,
    geometry: "center HUD ticks",
    instanceScale: [0.09, 0.012, 0.012],
    placement: { mode: "radial", axis: [0, 1, 0], radius: 0.68, startAngleDeg: 0 },
  },
]

spec.featureReviewTargets = [
  {
    id: "clipped-tabletop-silhouette",
    name: "Clipped tabletop silhouette and proportions",
    tier: "critical",
    passIds: ["blockout", "form-refinement"],
    minimumScore: 0.8,
    mustPass: true,
    componentRefs: ["upper-shell", "lower-chassis"],
    evidenceRefs: ["full-object"],
  },
  {
    id: "articulated-leg-system",
    name: "Four splayed articulated leg assemblies",
    tier: "critical",
    passIds: ["structural-pass", "form-refinement", "interaction-pass"],
    minimumScore: 0.8,
    mustPass: true,
    componentRefs: parts.filter((part) => part.id.startsWith("leg-")).map((part) => part.id),
    evidenceRefs: ["full-object"],
  },
  {
    id: "work-surface-hud",
    name: "Recessed three-zone work surface and HUD linework",
    tier: "critical",
    passIds: ["structural-pass", "material-pass"],
    minimumScore: 0.8,
    mustPass: true,
    componentRefs: ["work-surface", "work-surface-linework"],
    evidenceRefs: ["detail-evidence/zone-r1c1.png"],
  },
  {
    id: "perimeter-light-system",
    name: "Segmented cyan magenta and amber lighting",
    tier: "critical",
    passIds: ["material-pass", "lighting-pass"],
    minimumScore: 0.78,
    mustPass: true,
    componentRefs: ["light-rails", "lower-chassis"],
    evidenceRefs: ["full-object"],
  },
  {
    id: "corner-control-system",
    name: "Corner pods, triangular controls and vents",
    tier: "important",
    passIds: ["form-refinement", "material-pass"],
    minimumScore: 0.68,
    mustPass: false,
    componentRefs: ["control-pods"],
    evidenceRefs: ["full-object"],
  },
]

for (const pass of spec.buildPasses) {
  pass.componentRefs = parts
    .filter((part) => part.level === "macro" || pass.id !== "blockout")
    .map((part) => part.id)
}

spec.referenceCamera = {
  solved: true,
  fovDegrees: 32,
  aspect: 1672 / 941,
  orientation: { yaw: -38, pitch: -26, roll: -1 },
  positionHint: [11.8, 9.3, 13.2],
  note: "Approximate perspective match from a single three-quarter product render; hidden regions remain unverified.",
}
spec.lookDevTargets = {
  neutral: "Broad soft key and cool fill reveal albedo and tabletop chamfers.",
  grazing: "Low cyan-white key reveals woven mat normal response and metallic bevels.",
  reference:
    "Cool frontal key, cyan/magenta emissive accents, restrained bloom and transparent background.",
}
spec.lightingFromPhoto = [
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
    intensity: 2.0,
  },
  {
    id: "render-intent",
    type: "render-profile",
    exposure: 1.05,
    toneMapping: "ACESFilmic",
    contactShadow: "soft ground contact shadow opacity 0.22",
  },
]
spec.actionReadiness = {
  required: true,
  stablePartIds: parts.map((part) => part.id),
  sockets: parts.filter((part) => part.id.includes("hip")).map((part) => `socket-${part.id}`),
  colliderPolicy: "Compound primitive proxies per tabletop and leg module.",
  destructionGroups: [
    "tabletop",
    "leg-left-front",
    "leg-right-front",
    "leg-left-rear",
    "leg-right-rear",
  ],
}
spec.performanceBudget = {
  qualityPriority: "reference-fidelity",
  targetTriangles: 90000,
  maxDrawCalls: 140,
  textureSize: 2048,
  fpsTarget: 60,
  optimizationPolicy:
    "Preserve silhouette, leg articulation and emissive systems; instance repeated vents/ticks/status bars.",
}
spec.proceduralStrategy = [
  "Extruded clipped-corner profiles for layered tabletop shells",
  "Endpoint-oriented jointed leg assemblies with overlapping sockets",
  "Independent procedural PBR channels for metal, mat and acrylic",
  "Named selectable/explodable parts with surface relief parented to owners",
]
spec.assumptions = [
  "Rear leg geometry mirrors the visible front leg design with 0.72 confidence.",
  "Bottom chassis routing is a coherent design inference because the reference does not expose it.",
  "Model scale is normalized to a 12-unit tabletop width; no manufacturing dimensions are claimed.",
]

writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`)
