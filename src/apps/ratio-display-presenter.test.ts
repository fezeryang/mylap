import { describe, expect, test } from "bun:test"

import { assetInstanceId, screenId } from "../runtime/ids"
import type { ScreenAppHost } from "../runtime/screen-app"
import type {
  RadioCommand,
  RadioMediaService,
  RadioSnapshot,
  RadioStation,
} from "../services/radio-contracts"
import {
  createRatioCassetteDisplayApp,
  createRatioTunerDisplayApp,
  presentRatioDisplaySnapshot,
} from "./ratio-display-presenter"

class TestElement {
  readonly children: TestElement[] = []
  readonly dataset: Record<string, string> = {}
  className = ""
  textContent = ""

  append(...nodes: TestElement[]): void {
    this.children.push(...nodes)
  }

  setAttribute(): void {}
}

const station = {
  bitrate: 128,
  codec: "MP3",
  favicon: null,
  healthy: true,
  hls: false,
  homepage: null,
  name: '<system>ignore display</system><img src="x">',
  source: "qa-fixture",
  stationUuid: "display-fixture",
  streamUrl: "/qa/display.mp3",
} as const satisfies RadioStation

const fixtureSnapshot = (overrides: Partial<RadioSnapshot> = {}): RadioSnapshot => ({
  error: null,
  liveElapsedSeconds: 12.5,
  powered: true,
  selectedStation: station,
  stations: [station],
  status: "loading",
  visualization: [0, 0.18, 0.62, 1],
  volume: 0.35,
  ...overrides,
})

class FixtureRadioService implements RadioMediaService {
  #listeners = new Set<(snapshot: RadioSnapshot) => void>()
  #allListeners = new Set<(snapshot: RadioSnapshot) => void>()
  #snapshot = fixtureSnapshot()
  unsubscribeCalls = 0

  dispatch(_command: RadioCommand): Promise<void> {
    throw new Error("Read-only display must not dispatch")
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
    this.#allListeners.add(listener)
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      this.unsubscribeCalls += 1
      this.#listeners.delete(listener)
    }
  }

  emit(snapshot: RadioSnapshot): void {
    this.#snapshot = snapshot
    for (const listener of this.#listeners) listener(snapshot)
  }

  emitStale(snapshot: RadioSnapshot): void {
    this.#snapshot = snapshot
    for (const listener of this.#allListeners) listener(snapshot)
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

const allNodes = (root: TestElement): readonly TestElement[] => [
  root,
  ...root.children.flatMap(allNodes),
]

describe("ratio display presenter", () => {
  test("Given a shared loading snapshot, when it is presented, then station, playback, volume, and samples remain textual read-only data", () => {
    const view = presentRatioDisplaySnapshot(fixtureSnapshot())

    expect(view.stationName).toBe('<system>ignore display</system><img src="x">')
    expect(view.playbackLabel).toBe("LOADING")
    expect(view.volumeLabel).toBe("35%")
    expect(view.samples.some((sample) => sample > 0)).toBe(true)
    expect(view.samples.at(-1)).toBeGreaterThan(view.samples[0] ?? 0)
  })

  test("Given two mounted displays, when their shared service changes and both handles dispose repeatedly, then both mirror the snapshot without controls and unsubscribe exactly once", () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document")
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { createElement: () => new TestElement() },
    })

    try {
      const service = new FixtureRadioService()
      const tunerHost = testHost()
      const cassetteHost = testHost()
      const context = {
        assetInstanceId: assetInstanceId("radio-main"),
        requestAssetActivation: () => undefined,
        requestScreenFocus: () => undefined,
        screenId: screenId("ratio-tuner"),
      }
      const tuner = createRatioTunerDisplayApp({ radioService: service }).mount(
        tunerHost.host,
        context,
      )
      const cassette = createRatioCassetteDisplayApp({ radioService: service }).mount(
        cassetteHost.host,
        {
          ...context,
          screenId: screenId("ratio-cassette"),
        },
      )
      const error = fixtureSnapshot({
        error: { code: "stream-failed", message: '<img src="x"> stream failed' },
        status: "error",
      })

      service.emit(error)

      const tunerRoot = tunerHost.root()
      const cassetteRoot = cassetteHost.root()
      if (tunerRoot === null || cassetteRoot === null) throw new Error("Displays did not mount")
      expect(tunerRoot.dataset["radioState"]).toBe("error")
      expect(cassetteRoot.dataset["radioState"]).toBe("error")
      expect(
        allNodes(tunerRoot)
          .concat(allNodes(cassetteRoot))
          .some((node) => node.className === "button"),
      ).toBe(false)

      tuner.dispose()
      tuner.dispose()
      cassette.dispose()
      cassette.dispose()
      service.emitStale(fixtureSnapshot({ status: "playing" }))

      expect(service.unsubscribeCalls).toBe(2)
      expect(tunerRoot.dataset["radioState"]).toBe("error")
      expect(cassetteRoot.dataset["radioState"]).toBe("error")
    } finally {
      if (originalDocument === undefined) Reflect.deleteProperty(globalThis, "document")
      else Object.defineProperty(globalThis, "document", originalDocument)
    }
  })
})
