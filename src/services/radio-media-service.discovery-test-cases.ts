import { describe, expect, test } from "bun:test"
import { RadioDirectoryError } from "./radio-directory"
import { createRadioMediaService } from "./radio-media-service"
import {
  ControlledDirectory,
  FakeMediaElement,
  flush,
  loadOne,
  station,
} from "./radio-media-service-test-support"

describe("radio media discovery", () => {
  test("shares commands and snapshots", async () => {
    // Given
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    const left: unknown[] = []
    const right: unknown[] = []
    const unsubscribeLeft = service.subscribe((snapshot) => left.push(snapshot))
    const unsubscribeRight = service.subscribe((snapshot) => right.push(snapshot))

    // When
    await loadOne(service, directory)
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "set-volume", volume: 0.25 })

    // Then
    expect(left).toEqual(right)
    expect(left.at(-1)).toBe(right.at(-1))
    expect(Object.isFrozen(service.read())).toBe(true)
    expect(Object.isFrozen(service.read().stations)).toBe(true)
    expect(service.read()).toEqual({
      powered: true,
      status: "idle",
      stations: [station("one")],
      selectedStation: station("one"),
      volume: 0.25,
      liveElapsedSeconds: 0,
      visualization: Array(24).fill(0),
      error: null,
    })
    unsubscribeLeft()
    unsubscribeRight()
    service.dispose()
  })

  test("starts with the exact immutable snapshot and immediate subscription", () => {
    const service = createRadioMediaService({
      directory: new ControlledDirectory(),
      mediaElement: new FakeMediaElement(),
    })
    const received: unknown[] = []
    const unsubscribe = service.subscribe((snapshot) => received.push(snapshot))
    unsubscribe()
    expect(received).toEqual([service.read()])
    expect(service.read()).toEqual({
      powered: false,
      status: "idle",
      stations: [],
      selectedStation: null,
      volume: 0.7,
      liveElapsedSeconds: 0,
      visualization: Array(24).fill(0),
      error: null,
    })
    service.dispose()
  })

  test("shares discovery, caches success, and aborts only after the last caller", async () => {
    const directory = new ControlledDirectory()
    const service = createRadioMediaService({ directory, mediaElement: new FakeMediaElement() })
    const firstController = new AbortController()
    const secondController = new AbortController()
    const first = service.loadStations({ signal: firstController.signal })
    const second = service.loadStations({ signal: secondController.signal })
    expect(directory.calls).toHaveLength(1)
    firstController.abort()
    await expect(first).rejects.toHaveProperty("name", "AbortError")
    expect(directory.calls[0]?.aborted).toBe(false)
    secondController.abort()
    await expect(second).rejects.toHaveProperty("name", "AbortError")
    expect(directory.calls[0]?.aborted).toBe(true)
    await flush()

    const retry = service.loadStations()
    directory.pending[1]?.resolve([station("one")])
    await retry
    await service.loadStations()
    expect(directory.calls).toHaveLength(2)
    service.dispose()
  })

  test("force aborts old callers and starts a fresh request", async () => {
    const directory = new ControlledDirectory()
    const service = createRadioMediaService({ directory, mediaElement: new FakeMediaElement() })
    const old = service.loadStations()
    const fresh = service.loadStations({ force: true })
    await expect(old).rejects.toHaveProperty("name", "AbortError")
    expect(directory.calls[0]?.aborted).toBe(true)
    expect(directory.calls).toHaveLength(2)
    directory.pending[1]?.resolve([station("fresh")])
    await fresh
    expect(service.read().selectedStation?.stationUuid).toBe("fresh")
    service.dispose()
  })

  test("resolves terminal errors and preserves a prior successful list on retry", async () => {
    const directory = new ControlledDirectory()
    const service = createRadioMediaService({ directory, mediaElement: new FakeMediaElement() })
    await loadOne(service, directory)
    const refresh = service.loadStations({ force: true })
    directory.pending[1]?.reject(
      new RadioDirectoryError("directory-invalid", "Radio directory responses were invalid"),
    )
    await refresh
    expect(service.read().stations).toEqual([station("one")])
    expect(service.read().status).toBe("idle")
    expect(service.read().error?.code).toBe("directory-invalid")
    service.dispose()
  })

  test("initial terminal error resolves into error state", async () => {
    const directory = new ControlledDirectory()
    const service = createRadioMediaService({ directory, mediaElement: new FakeMediaElement() })
    const loading = service.loadStations()
    directory.pending[0]?.reject(
      new RadioDirectoryError("directory-empty", "No playable radio stations were found"),
    )
    await loading
    expect(service.read().status).toBe("error")
    expect(service.read().error?.code).toBe("directory-empty")
    service.dispose()
  })

  test("rejects an already-aborted caller without starting discovery", async () => {
    const directory = new ControlledDirectory()
    const service = createRadioMediaService({ directory, mediaElement: new FakeMediaElement() })
    const controller = new AbortController()
    controller.abort()

    await expect(service.loadStations({ signal: controller.signal })).rejects.toHaveProperty(
      "name",
      "AbortError",
    )
    expect(directory.calls).toHaveLength(0)
    service.dispose()
  })

  test("lets one caller abort while the shared request succeeds for another", async () => {
    const directory = new ControlledDirectory()
    const service = createRadioMediaService({ directory, mediaElement: new FakeMediaElement() })
    const controller = new AbortController()
    const abandoned = service.loadStations({ signal: controller.signal })
    const retained = service.loadStations()

    controller.abort()
    directory.pending[0]?.resolve([station("shared")])

    await expect(abandoned).rejects.toHaveProperty("name", "AbortError")
    await retained
    expect(service.read().selectedStation?.stationUuid).toBe("shared")
    service.dispose()
  })

  test("maps unexpected directory failures without leaking their message", async () => {
    const directory = new ControlledDirectory()
    const service = createRadioMediaService({ directory, mediaElement: new FakeMediaElement() })
    const loading = service.loadStations()
    directory.pending[0]?.reject(new Error("transport secret"))

    await loading

    expect(service.read().error).toEqual({
      code: "directory-unavailable",
      message: "Radio directory is unavailable",
    })
    service.dispose()
  })

  test("rejects post-disposal discovery and emits no post-disposal subscription", async () => {
    const directory = new ControlledDirectory()
    const service = createRadioMediaService({ directory, mediaElement: new FakeMediaElement() })
    service.dispose()
    const received: unknown[] = []

    service.subscribe((snapshot) => received.push(snapshot))

    await expect(service.loadStations()).rejects.toHaveProperty("name", "AbortError")
    expect(received).toEqual([])
    expect(directory.calls).toHaveLength(0)
  })

  test("recovers from an initial directory failure on forced success", async () => {
    const directory = new ControlledDirectory()
    const service = createRadioMediaService({ directory, mediaElement: new FakeMediaElement() })
    const failed = service.loadStations()
    directory.pending[0]?.reject(
      new RadioDirectoryError("directory-unavailable", "Radio directory is unavailable"),
    )
    await failed
    const retry = service.loadStations({ force: true })
    directory.pending[1]?.resolve([station("recovered")])

    await retry

    expect(service.read().status).toBe("idle")
    expect(service.read().error).toBeNull()
    expect(service.read().selectedStation?.stationUuid).toBe("recovered")
    service.dispose()
  })
})
