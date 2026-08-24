import {
  AdditiveBlending,
  Color,
  DataTexture,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RedFormat,
  RepeatWrapping,
  UnsignedByteType,
} from "three"

export type CyberdeckMaterials = {
  readonly pearl: MeshPhysicalMaterial
  readonly pearlEdge: MeshPhysicalMaterial
  readonly armor: MeshPhysicalMaterial
  readonly dark: MeshPhysicalMaterial
  readonly keyPearl: MeshPhysicalMaterial
  readonly keyLavender: MeshPhysicalMaterial
  readonly keyViolet: MeshPhysicalMaterial
  readonly keyPink: MeshPhysicalMaterial
  readonly keyCyan: MeshPhysicalMaterial
  readonly rubber: MeshStandardMaterial
  readonly hardware: MeshPhysicalMaterial
  readonly cavity: MeshStandardMaterial
  readonly cyan: MeshBasicMaterial
  readonly violet: MeshBasicMaterial
  readonly magenta: MeshBasicMaterial
}

const emissive = (hex: number): MeshBasicMaterial =>
  new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: new Color(hex),
    depthWrite: false,
    toneMapped: false,
  })

const roughnessGrain = (): DataTexture => {
  const size = 32
  const data = new Uint8Array(size * size)
  for (let index = 0; index < data.length; index += 1) {
    const noise = (index * 73 + Math.floor(index / size) * 151) % 31
    data[index] = 176 + noise
  }
  const texture = new DataTexture(data, size, size, RedFormat, UnsignedByteType)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(7, 7)
  texture.needsUpdate = true
  return texture
}

export const createCyberdeckMaterials = (): CyberdeckMaterials => {
  const grain = roughnessGrain()
  return {
    pearl: new MeshPhysicalMaterial({
      color: 0xdedbea,
      clearcoat: 0.82,
      clearcoatRoughness: 0.16,
      envMapIntensity: 1.16,
      iridescence: 0.28,
      iridescenceIOR: 1.42,
      iridescenceThicknessRange: [150, 360],
      ior: 1.52,
      metalness: 0.08,
      roughness: 0.25,
      sheen: 0.16,
      sheenColor: 0xffc8ee,
      sheenRoughness: 0.42,
      specularColor: 0xc9efff,
      specularIntensity: 1,
      roughnessMap: grain,
    }),
    pearlEdge: new MeshPhysicalMaterial({
      color: 0xe9e5f2,
      clearcoat: 0.88,
      clearcoatRoughness: 0.13,
      envMapIntensity: 1.24,
      iridescence: 0.22,
      iridescenceIOR: 1.38,
      iridescenceThicknessRange: [130, 320],
      ior: 1.5,
      metalness: 0.12,
      roughness: 0.22,
      sheen: 0.12,
      sheenColor: 0xe6c8ff,
      sheenRoughness: 0.36,
      specularColor: 0xcdf5ff,
      specularIntensity: 1,
      roughnessMap: grain,
    }),
    armor: new MeshPhysicalMaterial({
      anisotropy: 0.45,
      anisotropyRotation: 0.35,
      color: 0x4d407f,
      clearcoat: 0.64,
      clearcoatRoughness: 0.13,
      envMapIntensity: 1.8,
      metalness: 1,
      roughness: 0.12,
      roughnessMap: grain,
    }),
    dark: new MeshPhysicalMaterial({
      color: 0x0d1535,
      clearcoat: 0.42,
      clearcoatRoughness: 0.22,
      metalness: 0.12,
      roughness: 0.33,
    }),
    keyPearl: new MeshPhysicalMaterial({
      color: 0xe8e5ef,
      clearcoat: 0.18,
      roughness: 0.44,
      roughnessMap: grain,
    }),
    keyLavender: new MeshPhysicalMaterial({ color: 0x9299d1, clearcoat: 0.24, roughness: 0.4 }),
    keyViolet: new MeshPhysicalMaterial({ color: 0x55499b, clearcoat: 0.28, roughness: 0.38 }),
    keyPink: new MeshPhysicalMaterial({ color: 0xd978b3, clearcoat: 0.3, roughness: 0.37 }),
    keyCyan: new MeshPhysicalMaterial({ color: 0x43abd0, clearcoat: 0.3, roughness: 0.36 }),
    rubber: new MeshStandardMaterial({ color: 0x242539, metalness: 0.05, roughness: 0.78 }),
    hardware: new MeshPhysicalMaterial({
      color: 0x696d87,
      metalness: 0.86,
      roughness: 0.31,
      roughnessMap: grain,
    }),
    cavity: new MeshStandardMaterial({ color: 0x050918, metalness: 0.18, roughness: 0.48 }),
    cyan: emissive(0x34d9ff),
    violet: emissive(0x7657ff),
    magenta: emissive(0xff55ca),
  }
}
