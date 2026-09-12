import { describe, expect, jest, test } from "bun:test"
import { createRadioMediaService } from "./radio-media-service"
import {
  ControlledDirectory,
  FakeMediaElement,
  flush,
  loadOne,
  station,
} from "./radio-media-service-test-support"

describe("radio media races and cleanup", () => {
  test("serializes dispatch in FIFO microtasks and ignores late play after pause", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    await loadOne(service, directory)
    const power = service.dispatch({ kind: "set-power", powered: true })
    expect(service.read().powered).toBe(false)
    const play = service.dispatch({ kind: "play" })
    const pause = service.dispatch({ kind: "pause" })
    await Promise.all([power, play, pause])
    media.playCalls[0]?.resolve()
    media.emit("playing")
    media.currentTime = 9
    media.emit("timeupdate")
    await flush()
    expect(service.read().status).toBe("paused")
    expect(service.read().liveElapsedSeconds).toBe(0)
    service.dispose()
  })

  test("refresh retains same URL metadata and clears removed or changed streams", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    await loadOne(service, directory)
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "play" })
    media.emit("playing")
    const sameUrl = { ...station("one"), name: "Renamed" }
    const retained = service.loadStations({ force: true })
    directory.pending[1]?.resolve([sameUrl, station("two")])
    await retained
    expect(service.read().selectedStation?.name).toBe("Renamed")
    expect(service.read().status).toBe("playing")
    const changed = service.loadStations({ force: true })
    directory.pending[2]?.resolve([station("one", "https://new.example/one.mp3"), station("two")])
    await changed
    expect(service.read().selectedStation?.stationUuid).toBe("one")
    expect(service.read().status).toBe("idle")
    expect(media.src).toBe("")
    service.dispose()
  })

  test("media error clears the source and stale completions cannot recover", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    await loadOne(service, directory)
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "play" })
    media.emit("error")
    media.playCalls[0]?.resolve()
    media.emit("playing")
    await flush()
    expect(service.read().error?.code).toBe("stream-failed")
    expect(media.src).toBe("")
    service.dispose()
  })

  test("waiting and stalled recover on playing and fail after eight seconds", async () => {
    jest.useFakeTimers()
    try {
      const directory = new ControlledDirectory()
      const media = new FakeMediaElement()
      const service = createRadioMediaService({ directory, mediaElement: media })
      await loadOne(service, directory)
      await service.dispatch({ kind: "set-power", powered: true })
      await service.dispatch({ kind: "play" })
      media.emit("playing")
      media.emit("waiting")
      expect(service.read().status).toBe("loading")
      media.emit("canplay")
      jest.advanceTimersByTime(8_000)
      expect(service.read().error).toBeNull()
      media.emit("stalled")
      jest.advanceTimersByTime(8_000)
      expect(service.read().error?.code).toBe("stream-failed")
      expect(media.src).toBe("")
      service.dispose()
    } finally {
      jest.useRealTimers()
    }
  })

  test("dispose aborts discovery and prevents later snapshots", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    const snapshots: unknown[] = []
    service.subscribe((snapshot) => snapshots.push(snapshot))
    const loading = service.loadStations()
    service.dispose()
    service.dispose()
    await expect(loading).rejects.toHaveProperty("name", "AbortError")
    const count = snapshots.length
    directory.pending[0]?.resolve([station("late")])
    await flush()
    expect(snapshots).toHaveLength(count)
    expect(directory.calls[0]?.aborted).toBe(true)
    expect(media.src).toBe("")
  })

  test("removed station falls back to the first row and clears playback", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    await loadOne(service, directory)
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "play" })
    media.emit("playing")
    const refresh = service.loadStations({ force: true })
    directory.pending[1]?.resolve([station("replacement"), station("other")])

    await refresh

    expect(service.read().selectedStation?.stationUuid).toBe("replacement")
    expect(service.read().status).toBe("idle")
    expect(media.src).toBe("")
    expect(media.listenerCount()).toBe(0)
    service.dispose()
  })

  test("forced terminal failure preserves playback and updated callers settle", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    await loadOne(service, directory)
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "play" })
    media.currentTime = 4
    media.emit("playing")
    const refresh = service.loadStations({ force: true })
    directory.pending[1]?.reject(
      new DOMException("directory transport aborted unexpectedly", "AbortError"),
    )

    await refresh

    expect(service.read().status).toBe("playing")
    expect(service.read().liveElapsedSeconds).toBe(4)
    expect(service.read().error?.code).toBe("directory-unavailable")
    expect(media.src).toBe(station("one").streamUrl)
    service.dispose()
  })

  test("clearing commands ignore every stale media completion and event", async () => {
    for (const command of [
      { kind: "stop" } as const,
      { kind: "set-power", powered: false } as const,
      { kind: "select-station", stationUuid: "two" } as const,
    ]) {
      const directory = new ControlledDirectory()
      const media = new FakeMediaElement()
      const service = createRadioMediaService({ directory, mediaElement: media })
      const loading = service.loadStations()
      directory.pending[0]?.resolve([station("one"), station("two")])
      await loading
      await service.dispatch({ kind: "set-power", powered: true })
      await service.dispatch({ kind: "play" })
      await service.dispatch(command)
      media.playCalls[0]?.resolve()
      media.emit("playing")
      media.currentTime = 11
      media.emit("timeupdate")
      await flush()
      expect(service.read().status).toBe("idle")
      expect(service.read().liveElapsedSeconds).toBe(0)
      service.dispose()
    }
  })

  test("dispose removes media listeners and a pending stall timer", async () => {
    jest.useFakeTimers()
    try {
      const directory = new ControlledDirectory()
      const media = new FakeMediaElement()
      const service = createRadioMediaService({ directory, mediaElement: media })
      await loadOne(service, directory)
      await service.dispatch({ kind: "set-power", powered: true })
      await service.dispatch({ kind: "play" })
      media.emit("waiting")
      expect(media.listenerCount()).toBeGreaterThan(0)
      service.dispose()
      const pauseCount = media.pauseCount
      jest.advanceTimersByTime(8_000)
      expect(media.listenerCount()).toBe(0)
      expect(media.pauseCount).toBe(pauseCount)
    } finally {
      jest.useRealTimers()
    }
  })

  test("commits source-clearing commands and refresh replacement atomically", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    await loadOne(service, directory)
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "play" })
    const snapshots: unknown[] = []
    service.subscribe((snapshot) => snapshots.push(snapshot))
    const beforePowerOff = snapshots.length

    await service.dispatch({ kind: "set-power", powered: false })

    expect(snapshots).toHaveLength(beforePowerOff + 1)
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "play" })
    const beforeRefresh = snapshots.length
    const refresh = service.loadStations({ force: true })
    directory.pending[1]?.resolve([station("replacement")])
    await refresh
    expect(snapshots).toHaveLength(beforeRefresh + 1)
    service.dispose()
  })

  test("cancels a queued command when disposal wins its microtask", async () => {
    const directory = new ControlledDirectory()
    const service = createRadioMediaService({ directory, mediaElement: new FakeMediaElement() })
    const queued = service.dispatch({ kind: "set-power", powered: true })

    service.dispose()

    await expect(queued).rejects.toHaveProperty("name", "AbortError")
    expect(service.read().powered).toBe(false)
  })
})
