import { Group, Vector3 } from "three"

import type { ModelPart } from "./types"

export class PartBuilder {
  private readonly mutableParts: ModelPart[] = []

  get parts(): readonly ModelPart[] {
    return this.mutableParts
  }

  register(id: string, node: Group, centralClearance = 0): void {
    node.name = id
    node.userData["componentId"] = id
    node.userData["selectablePart"] = true
    this.mutableParts.push({
      authoredPosition: node.position.clone(),
      centralClearance,
      id,
      node,
    })
  }

  create(id: string, parent: Group, position = new Vector3(), centralClearance = 0): Group {
    const node = new Group()
    node.name = id
    node.position.copy(position)
    node.userData["componentId"] = id
    node.userData["selectablePart"] = true
    parent.add(node)
    this.mutableParts.push({
      authoredPosition: position.clone(),
      centralClearance,
      id,
      node,
    })
    return node
  }
}
