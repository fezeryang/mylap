import type { Group, Mesh, Object3D } from "three"

export interface CyberDeskRuntime {
  readonly nodes: ReadonlyMap<string, Object3D>
  readonly meshes: ReadonlyMap<string, Mesh>
  readonly partManifest: readonly {
    readonly destructionGroup: string
    readonly id: string
    readonly meshNames: readonly string[]
  }[]
  dispose(): void
  setExplosion(amount: number): void
}

export interface CyberDeskModel extends Group {
  readonly userData: Group["userData"] & {
    readonly sculptRuntime: CyberDeskRuntime
  }
}

export const createCyberDeskModel: () => CyberDeskModel
