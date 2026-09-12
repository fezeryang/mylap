import { describe, expect, test } from "bun:test"

import { assetInstanceId, screenId } from "../runtime/ids"
import type { ScreenAppHost } from "../runtime/screen-app"
import type {
  RadioCommand,
  RadioMediaService,
  RadioSnapshot,
  RadioStation,
} from "../services/radio-contracts"
import { createBrowserPolicy } from "./browser-url-policy"
import { createMainWorkspaceApp } from "./main-workspace-app"
import { createPhoneShellApp } from "./phone-shell-app"

type TestEvent = {
  preventDefault(): void
}

type TestListener = (event: TestEvent) => void

class TestElement {
  readonly attributes = new Map<string, string>()
  readonly children: TestElement[] = []
  readonly dataset: Record<string, string> = {}
  readonly listeners = new Map<string, TestListener>()
  className = ""
  disabled = false
  hidden = false
  max = ""
  min = ""
  placeholder = ""
  selected = false
  step = ""
  textContent = ""
  type = ""
  value = ""

  addEventListener(name: string, listener: TestListener): void {
    this.listeners.set(name, listener)
  }

  append(...nodes: TestElement[]): void {
    this.children.push(...nodes)
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

  findByTestId(testId: string): TestElement | null {
    if (this.dataset["testid"] === testId) return this
    for (const child of this.children) {
      const found = child.findByTestId(testId)
      if (found !== null) return found
    }
    return null
  }

  findByText(text: string): TestElement | null {
    if (this.textContent === text) return this
    for (const child of this.children) {
      const found = child.findByText(text)
      if (found !== null) return found
    }
    return null
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }

  removeEventListener(name: string): void {
    this.listeners.delete(name)
  }

  replaceChildren(...nodes: TestElement[]): void {
    this.children.splice(0, this.children.length, ...nodes)
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }
}

const stations = [
  {
    bitrate: 128,
    codec: "MP3",
    favicon: null,
    healthy: true,
    hls: false,
    homepage: null,
    name: "Dawn Relay",
    source: "radio-browser",
    stationUuid: "dawn-relay",
    streamUrl: "https://streams.example/dawn.mp3",
  },
  {
    bitrate: 128,
    codec: "MP3",
    favicon: null,
    healthy: true,
    hls: false,
    homepage: null,
    name: "Night Shift",
    source: "radio-browser",
    stationUuid: "night-shift",
    streamUrl: "https://streams.example/night.mp3",
  },
] as const satisfies readonly RadioStation[]

class FixtureRadioService implements RadioMediaService {
  #listeners = new Set<(snapshot: RadioSnapshot) => void>()
  #snapshot: RadioSnapshot = {
    error: null,
    liveElapsedSeconds: 0,
    powered: false,
    selectedStation: stations[0],
    stations,
    status: "idle",
    visualization: [],
    volume: 0.7,
  }

  get listenerCount(): number {
    return this.#listeners.size
  }

  dispatch(command: RadioCommand): Promise<void> {
    switch (command.kind) {
      case "set-power":
        this.#update({
          ...this.#snapshot,
          error: null,
          powered: command.powered,
          status: command.powered ? this.#snapshot.status : "idle",
        })
        return Promise.resolve()
      case "select-station": {
        const selectedStation = stations.find(
          (station) => station.stationUuid === command.stationUuid,
        )
        if (selectedStation === undefined) {
          this.#update({
            ...this.#snapshot,
            error: { code: "station-unavailable", message: "Selected station is unavailable" },
            status: "error",
          })
          return Promise.resolve()
        }
        this.#update({ ...this.#snapshot, error: null, selectedStation, status: "idle" })
        return Promise.resolve()
      }
      case "play":
        this.#update({
          ...this.#snapshot,
          error: this.#snapshot.powered
            ? null
            : { code: "power-off", message: "Radio power is off" },
          status: this.#snapshot.powered ? "playing" : "error",
        })
        return Promise.resolve()
      case "pause":
        this.#update({ ...this.#snapshot, error: null, status: "paused" })
        return Promise.resolve()
      case "stop":
        this.#update({ ...this.#snapshot, error: null, status: "idle" })
        return Promise.resolve()
      case "set-volume":
        if (!Number.isFinite(command.volume) || command.volume < 0 || command.volume > 1) {
          return Promise.reject(new TypeError("Volume must be between 0 and 1"))
        }
        this.#update({ ...this.#snapshot, volume: command.volume })
        return Promise.resolve()
    }
  }

  dispose(): void {}

  loadStations(): Promise<void> {
    return Promise.resolve()
  }

  read(): RadioSnapshot {
    return this.#snapshot
  }

  subscribe(listener: (snapshot: RadioSnapshot) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #update(snapshot: RadioSnapshot): void {
    this.#snapshot = snapshot
    for (const listener of this.#listeners) listener(snapshot)
  }
}

const testHost = (): { readonly host: ScreenAppHost; readonly root: () => TestElement | null } => {
  let mounted: TestElement | null = null
  return {
    host: {
      append: (node) => {
        if (node instanceof TestElement) mounted = node
      },
      clear: () => undefined,
    },
    root: () => mounted,
  }
}

const requiredControl = (root: TestElement, testId: string): TestElement => {
  const control = root.findByTestId(testId)
  if (control === null) throw new Error(`Missing ${testId} control`)
  return control
}

const requiredElementByClass = (root: TestElement, className: string): TestElement => {
  const item = root.findByClass(className)
  if (item === null) throw new Error(`Missing ${className} element`)
  return item
}

const requiredElementByText = (root: TestElement, text: string): TestElement => {
  const item = root.findByText(text)
  if (item === null) throw new Error(`Missing ${text} element`)
  return item
}

describe("phone shell state", () => {
  test("Given mounted phone and computer clients, when the phone controls shared radio then focus changes and disposal preserve the subscription boundary", async () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document")
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => new TestElement(),
        createElementNS: () => new TestElement(),
      },
    })

    try {
      const radioService = new FixtureRadioService()
      const phoneHost = testHost()
      const computerHost = testHost()
      const phone = createPhoneShellApp({ radioService }).mount(phoneHost.host, {
        assetInstanceId: assetInstanceId("phone-main"),
        requestAssetActivation: () => undefined,
        requestScreenFocus: () => undefined,
        screenId: screenId("phone-primary"),
      })
      createMainWorkspaceApp({
        browserPolicy: createBrowserPolicy({ currentOrigin: "https://desktop.test" }),
        radioService,
      }).mount(computerHost.host, {
        assetInstanceId: assetInstanceId("computer-main"),
        requestAssetActivation: () => undefined,
        requestScreenFocus: () => undefined,
        screenId: screenId("computer-primary"),
      })
      const phoneRoot = phoneHost.root()
      const computerRoot = computerHost.root()
      if (phoneRoot === null || computerRoot === null)
        throw new Error("Expected both shells to mount")

      requiredControl(phoneRoot, "phone-oho").dispatch("click")
      requiredControl(computerRoot, "launcher-oho").dispatch("click")
      requiredControl(phoneRoot, "oho-power").dispatch("click")
      requiredControl(phoneRoot, "oho-station").value = "night-shift"
      requiredControl(phoneRoot, "oho-station").dispatch("change")
      requiredControl(phoneRoot, "oho-volume").value = "0.35"
      requiredControl(phoneRoot, "oho-volume").dispatch("input")
      requiredElementByText(phoneRoot, "Play").dispatch("click")
      await Promise.resolve()

      const phoneStatus = requiredElementByClass(phoneRoot, "oho-status").textContent
      const computerStatus = requiredElementByClass(computerRoot, "oho-status").textContent
      expect(phoneStatus).toBe("PLAYING · Night Shift · 35%")
      expect(computerStatus).toBe(phoneStatus)
      expect(radioService.listenerCount).toBe(2)

      phone.setActive(false)
      phone.setActive(true)
      expect(phoneRoot.dataset["route"]).toBe("oho")
      expect(requiredElementByClass(phoneRoot, "oho-status").textContent).toBe(phoneStatus)

      phone.dispose()
      await radioService.dispatch({ kind: "set-volume", volume: 0.5 })
      expect(radioService.listenerCount).toBe(1)
      expect(requiredElementByClass(phoneRoot, "oho-status").textContent).toBe(phoneStatus)
      expect(requiredElementByClass(computerRoot, "oho-status").textContent).toBe(
        "PLAYING · Night Shift · 50%",
      )
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document")
      } else {
        Object.defineProperty(globalThis, "document", originalDocument)
      }
    }
  })
})
