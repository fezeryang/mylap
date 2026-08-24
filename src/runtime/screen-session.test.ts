import { describe, expect, test } from "bun:test"

import { assetInstanceId, screenAppId, screenId } from "./ids"
import type {
  ScreenAppContext,
  ScreenAppDefinition,
  ScreenAppHandle,
  ScreenAppHost,
} from "./screen-app"
import { DuplicateScreenAppError, ScreenAppRegistry } from "./screen-app-registry"
import { ScreenSession } from "./screen-session"

class FakeHost implements ScreenAppHost {
  clears = 0

  append(_node: Node): void {}

  clear(): void {
    this.clears += 1
  }
}

const context: ScreenAppContext = {
  assetInstanceId: assetInstanceId("deck-a"),
  requestAssetActivation: () => undefined,
  requestScreenFocus: () => undefined,
  screenId: screenId("main"),
}

const fakeApp = (value: string, onDispose: () => void): ScreenAppDefinition => ({
  appId: screenAppId(value),
  mount: (): ScreenAppHandle => ({
    dispose: onDispose,
    setActive: () => undefined,
    update: () => undefined,
  }),
})

describe("ScreenAppRegistry", () => {
  test("Given a registered screen app, when registered again, then the duplicate is rejected", () => {
    const registry = new ScreenAppRegistry()
    registry.register(fakeApp("telemetry", () => undefined))

    const registerDuplicate = (): void => registry.register(fakeApp("telemetry", () => undefined))

    expect(registerDuplicate).toThrow(DuplicateScreenAppError)
  })
})

describe("ScreenSession", () => {
  test("Given a mounted app, when replaced, then the previous handle is disposed exactly once", () => {
    const registry = new ScreenAppRegistry()
    let firstDisposals = 0
    registry.register(fakeApp("first", () => (firstDisposals += 1)))
    registry.register(fakeApp("second", () => undefined))
    const session = new ScreenSession({ context, host: new FakeHost(), registry })
    session.install(screenAppId("first"))

    session.install(screenAppId("second"))

    expect(firstDisposals).toBe(1)
  })
})
