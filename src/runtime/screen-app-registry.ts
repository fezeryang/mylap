import type { ScreenAppId } from "./ids"
import type { ScreenAppDefinition } from "./screen-app"

export class DuplicateScreenAppError extends Error {
  constructor(readonly appId: ScreenAppId) {
    super(`Screen application is already registered: ${appId.value}`)
    this.name = "DuplicateScreenAppError"
  }
}

export class UnknownScreenAppError extends Error {
  constructor(readonly appId: ScreenAppId) {
    super(`Screen application is not registered: ${appId.value}`)
    this.name = "UnknownScreenAppError"
  }
}

export class ScreenAppRegistry {
  private readonly definitions = new Map<string, ScreenAppDefinition>()

  register(definition: ScreenAppDefinition): void {
    if (this.definitions.has(definition.appId.value)) {
      throw new DuplicateScreenAppError(definition.appId)
    }
    this.definitions.set(definition.appId.value, definition)
  }

  resolve(appId: ScreenAppId): ScreenAppDefinition {
    const definition = this.definitions.get(appId.value)
    if (definition === undefined) throw new UnknownScreenAppError(appId)
    return definition
  }
}
