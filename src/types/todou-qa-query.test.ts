import { describe, expect, test } from "bun:test"
import type { RadioMediaElement } from "../services/radio-media-service"
import { createRadioMediaService } from "../services/radio-media-service"
import {
  RadioScenarioError,
  selectRootRadioConfiguration,
  startInitialRadioLoad,
} from "./todou-qa-query"

class PendingMediaElement extends EventTarget implements RadioMediaElement {
  currentTime = 0
  paused = true
  src = ""
  volume = 0

  canPlayType(): CanPlayTypeResult {
    return "probably"
  }

  load(): void {}

  pause(): void {}

  play(): Promise<void> {
    return Promise.resolve()
  }

  removeAttribute(): void {
    this.src = ""
  }
}

const fetcher = async (): Promise<Response> => new Response("[]")

describe("root radio configuration", () => {
  test("Given no QA capability, when selected, then production uses injected fetch", async () => {
    let calls = 0
    const configuration = selectRootRadioConfiguration(
      new URLSearchParams("radio-fixtures=1"),
      async () => {
        calls += 1
        return new Response("[]", { headers: { "content-type": "application/json" } })
      },
    )

    await expect(configuration.directory.list(new AbortController().signal)).rejects.toMatchObject({
      code: "directory-empty",
    })
    expect(configuration.allowQaFixtures).toBe(false)
    expect(configuration.directoryLabel).toBe("production")
    expect(calls).toBe(3)
  })

  test("Given the QA fixture capability, when scenario is absent, then playable is selected", async () => {
    const configuration = selectRootRadioConfiguration(
      new URLSearchParams("qa=1&radio-fixtures=1"),
      fetcher,
    )

    expect(configuration.directoryLabel).toBe("fixture:playable")
    expect((await configuration.directory.list(new AbortController().signal)).length).toBe(2)
  })

  test("Given closed QA scenarios, when malformed input arrives, then startup selection throws", () => {
    expect(() =>
      selectRootRadioConfiguration(
        new URLSearchParams("qa=1&radio-fixtures=1&radio-scenario=hostile"),
        fetcher,
      ),
    ).toThrow(RadioScenarioError)
  })

  test("Given one pending initial load, when the host service disposes, then AbortError is handled", async () => {
    const configuration = selectRootRadioConfiguration(
      new URLSearchParams("qa=1&radio-fixtures=1&radio-scenario=pending"),
      fetcher,
    )
    const service = createRadioMediaService({
      allowQaFixtures: true,
      directory: configuration.directory,
      mediaElement: new PendingMediaElement(),
    })
    let calls = 0
    const loadStations = service.loadStations.bind(service)
    const initialLoad = startInitialRadioLoad({
      loadStations: (options) => {
        calls += 1
        return loadStations(options)
      },
    })

    service.dispose()

    await expect(initialLoad).resolves.toBeUndefined()
    expect(calls).toBe(1)
  })
})
