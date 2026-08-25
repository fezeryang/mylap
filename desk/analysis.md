# Cyber Desk reference analysis

## Suitability verdict

- Verdict: **conditional pass**, confidence 0.93.
- The reference contains one clearly isolated hard-surface desk at 1672 × 941 with a strong
  three-quarter silhouette and readable metal, polymer, glass/acrylic and emissive regions.
- The visible target is suitable for a real-time browser prop reconstructed from procedural
  geometry. The underside, rear leg pair, cable routing, exact dimensions and rear panel layout are
  hidden. Those regions must remain symmetric/inferred rather than described as exact.

## Layered observation

### Identification and form

The target is a futuristic four-legged computer desk/workstation platform, `primaryDomain:
object`, with bilateral symmetry and a wide, shallow bounding cuboid. The tabletop is roughly
2.05:1 in width-to-depth and is supported by four outward-splayed articulated legs. Confidence is
0.95 for the class and 0.72 for the unseen rear structure.

### Macro, meso and micro hierarchy

- Macro: beveled tabletop shell; recessed work-surface insert; perimeter chassis/bumper; four leg
  assemblies.
- Meso: silver upper shell plates, black lower chassis, cyan/magenta perimeter light rails,
  three-zone desk mat, corner control pods, central front latch, leg hip joints, upper struts,
  lower feet and joint rings.
- Micro: cyan mat border/grid/corner chevrons, central concentric HUD rings, cyan/magenta/orange LED
  segments, black panel seams, corner triangular buttons, blue vent slots, fastener/socket details,
  narrow metallic bevels and contact pads.

### Spatial relationships

- The upper shell overlaps the dark lower chassis; the work mat is recessed flush inside the upper
  shell aperture.
- Perimeter light rails are embedded between shell and bumper.
- Each leg is socketed below a corner through a cylindrical hip joint; the upper and lower struts
  overlap around a knee/hip pivot and terminate in a broad contact foot.
- The rear-left and rear-right legs are mostly occluded. Their transforms are inferred by bilateral
  symmetry from the visible front pair.

### PBR materials and sampled color intent

- Silver-lavender coated metal: high-value cool lavender-gray albedo, metalness about 0.76,
  roughness 0.22, clearcoat 0.42. The broad reference highlight is lighting evidence, not a white
  albedo patch.
- Black chassis: near-black blue albedo, metalness 0.65, roughness 0.3, with satin bevel response.
- Desk mat: dark navy woven/rubber composite, dielectric, roughness about 0.78, fine independent
  bump/normal grain and darker cavity variation.
- Leg armor: blue/cyan anodized panels and magenta inset rails over dark metallic linkages.
- Emitters: saturated cyan dominates, magenta is secondary, orange is a sparse status accent.
  Bloom must be restrained so the geometry stays legible.

### Identity-defining features

1. Wide clipped-corner silver shell with a black recessed central mat.
2. Continuous cyan and magenta edge-light bands around the tabletop.
3. Three-zone mat linework with central concentric targeting rings and corner chevrons.
4. Angular corner control pods with cyan vents and magenta triangular buttons.
5. Four splayed articulated legs with circular luminous joints, cyan face strips and magenta side
   strips.
6. Black lower bumper with short orange status lights and a central silver latch.

## Reconstruction limits

The image is a polished render with transparent/black surroundings and baked emissive bloom. Exact
physical scale, bottom topology, rear controls, hidden leg connections and all rear faces are not
observable. The implementation should target a strong real-time procedural likeness, not claim
manufacturing accuracy or exact hidden geometry. Review confidence is per visible system; hidden
regions use symmetry and consistent design language.

## Initial geometry strategy

- Continuous clipped-corner surfaces: extruded 2D profiles with real bevel geometry.
- Work mat and decorative panels: shallow extruded profiles/conforming planes, never the reference
  raster as a clickable surface.
- Legs: endpoint-oriented tapered box/cylinder assemblies under stable pivot groups, with explicit
  sockets and overlap.
- Light rails and linework: emissive meshes/tubes parented to their owning shells with
  `explodeWithParent`.
- Repeated vents/fasteners: instanced geometry where the visual count warrants it.
