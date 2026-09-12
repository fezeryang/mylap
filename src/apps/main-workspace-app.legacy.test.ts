import { describe, expect, test } from "bun:test"

import { assetInstanceId, screenId } from "../runtime/ids"
import { ScreenAppRegistry } from "../runtime/screen-app-registry"
import type { RadioMediaService, RadioSnapshot } from "../services/radio-contracts"
import {
  MAIN_WORKSPACE_APP_ID,
  PHONE_SHELL_APP_ID,
  RATIO_CASSETTE_DISPLAY_APP_ID,
  RATIO_TUNER_DISPLAY_APP_ID,
  STRUCTURE_ANALYSIS_APP_ID,
  SYSTEM_TELEMETRY_APP_ID,
} from "./app-ids"
import { createBrowserPolicy } from "./browser-url-policy"
import { createMainWorkspaceApp } from "./main-workspace-app"
import { registerDefaultApps } from "./register-default-apps"

type TestListener = (event: { preventDefault(): void }) => void

class TestElement {
  readonly children: TestElement[] = []
  readonly dataset: Record<string, string> = {}
  readonly listeners = new Map<string, TestListener>()
  readonly attributes = new Map<string, string>()
  className = ""
  disabled = false
  hidden = false
  max = ""
  min = ""
  placeholder = ""
  referrerPolicy = ""
  selected = false
  step = ""
  textContent = ""
  type = ""
  value = ""

  append(...nodes: TestElement[]): void {
    this.children.push(...nodes)
  }

  addEventListener(name: string, listener: TestListener): void {
    this.listeners.set(name, listener)
  }

  removeEventListener(name: string): void {
    this.listeners.delete(name)
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }

  replaceChildren(...nodes: TestElement[]): void {
    this.children.splice(0, this.children.length, ...nodes)
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  dispatch(name: string): void {
    this.listeners.get(name)?.({ preventDefault: () => undefined })
  }

  findByClass(className: string): TestElement | null {
    if (this.className.split(" ").includes(className)) return this
    for (const child of this.children) {
      const found = child.findByClass(className)
      if (found !== null) return found
    }
    return null
  }
}

describe("main workspace app factory", () => {
  test("Given host dependencies, when defaults register, then all six exact applications resolve", () => {
    const snapshot = createSnapshot()
    const radioService = createRadioService(snapshot)
    const registry = new ScreenAppRegistry()

    registerDefaultApps(registry, {
      browserPolicy: createBrowserPolicy({ currentOrigin: "https://launcher.test" }),
      radioService,
    })

    for (const appId of [
      MAIN_WORKSPACE_APP_ID,
      SYSTEM_TELEMETRY_APP_ID,
      STRUCTURE_ANALYSIS_APP_ID,
      PHONE_SHELL_APP_ID,
      RATIO_TUNER_DISPLAY_APP_ID,
      RATIO_CASSETTE_DISPLAY_APP_ID,
    ]) {
      expect(registry.resolve(appId).appId).toBe(appId)
    }
  })

  test("Given one launcher subscription, when its handle is disposed twice, then cleanup runs once", () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document")
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => new TestElement(),
        createElementNS: () => new TestElement(),
      },
    })
    const snapshot = createSnapshot()
    let unsubscribeCalls = 0
    const radioService: RadioMediaService = {
      dispatch: () => Promise.resolve(),
      dispose: () => undefined,
      loadStations: () => Promise.resolve(),
      read: () => snapshot,
      subscribe: () => () => {
        unsubscribeCalls += 1
      },
    }

    try {
      const app = createMainWorkspaceApp({
        browserPolicy: createBrowserPolicy({ currentOrigin: "https://launcher.test" }),
        radioService,
      })
      const handle = app.mount(
        { append: () => undefined, clear: () => undefined },
        {
          assetInstanceId: assetInstanceId("computer-main"),
          requestAssetActivation: () => undefined,
          requestScreenFocus: () => undefined,
          screenId: screenId("computer-primary"),
        },
      )

      handle.dispose()
      handle.dispose()

      expect(unsubscribeCalls).toBe(1)
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document")
      } else {
        Object.defineProperty(globalThis, "document", originalDocument)
      }
    }
  })
})

const createSnapshot = (): RadioSnapshot => ({
  error: null,
  liveElapsedSeconds: 0,
  powered: false,
  selectedStation: null,
  stations: [],
  status: "idle",
  visualization: [],
  volume: 0.7,
})

const createRadioService = (snapshot: RadioSnapshot): RadioMediaService => ({
  dispatch: () => Promise.resolve(),
  dispose: () => undefined,
  loadStations: () => Promise.resolve(),
  read: () => snapshot,
  subscribe: () => () => undefined,
})
