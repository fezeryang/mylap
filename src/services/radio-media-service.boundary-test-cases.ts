import { describe, expect, jest, test } from "bun:test"
import { createRadioMediaService } from "./radio-media-service"
import {
  ControlledDirectory,
  FakeMediaElement,
  flush,
  loadOne,
  station,
} from "./radio-media-service-test-support"

describe("radio media locked boundaries", () => {
  test("updates finite time exactly once and ignores nonfinite timeupdate", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    await loadOne(service, directory)
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "play" })
    media.emit("playing")
    const snapshots: unknown[] = []
    service.subscribe((snapshot) => snapshots.push(snapshot))
    const beforeFinite = snapshots.length
    media.currentTime = 6.25

    media.emit("timeupdate")

    expect(snapshots).toHaveLength(beforeFinite + 1)
    expect(service.read().liveElapsedSeconds).toBe(6.25)
    expect(service.read().visualization).toEqual(
      Array.from(
        { length: 24 },
        (_, index) =>
          Math.round((0.5 + 0.5 * Math.sin(6.25 * 2.4 + index * 0.73)) * 10_000) / 10_000,
      ),
    )
    const beforeNonfinite = snapshots.length
    media.currentTime = Number.NEGATIVE_INFINITY
    media.emit("timeupdate")
    expect(snapshots).toHaveLength(beforeNonfinite)
    service.dispose()
  })

  test("preserves the selected source and media effect for an unknown selection", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    await loadOne(service, directory)
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "play" })
    media.emit("playing")

    await service.dispatch({ kind: "select-station", stationUuid: "missing" })

    expect(service.read().selectedStation?.stationUuid).toBe("one")
    expect(service.read().error?.code).toBe("station-unavailable")
    expect(media.src).toBe(station("one").streamUrl)
    expect(media.paused).toBe(false)
    service.dispose()
  })

  test("restarts the stall deadline and canplay stays loading without a timer", async () => {
    jest.useFakeTimers()
    try {
      const directory = new ControlledDirectory()
      const media = new FakeMediaElement()
      const service = createRadioMediaService({ directory, mediaElement: media })
      await loadOne(service, directory)
      await service.dispatch({ kind: "set-power", powered: true })
      await service.dispatch({ kind: "play" })
      media.emit("waiting")
      jest.advanceTimersByTime(7_999)
      media.emit("stalled")
      jest.advanceTimersByTime(7_999)
      expect(service.read().error).toBeNull()
      media.emit("canplay")
      expect(service.read().status).toBe("loading")
      jest.advanceTimersByTime(8_000)
      expect(service.read().error).toBeNull()
      service.dispose()
    } finally {
      jest.useRealTimers()
    }
  })

  test("does not create a sampling timer after playback confirmation", async () => {
    jest.useFakeTimers()
    try {
      const directory = new ControlledDirectory()
      const media = new FakeMediaElement()
      const service = createRadioMediaService({ directory, mediaElement: media })
      await loadOne(service, directory)
      await service.dispatch({ kind: "set-power", powered: true })
      await service.dispatch({ kind: "play" })
      media.emit("playing")

      expect(jest.getTimerCount()).toBe(0)
      service.dispose()
    } finally {
      jest.useRealTimers()
    }
  })

  test("continues the FIFO after a rejected command and clamps the lower volume bound", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    const invalid = service.dispatch({ kind: "set-volume", volume: Number.POSITIVE_INFINITY })
    const volume = service.dispatch({ kind: "set-volume", volume: -2 })
    const power = service.dispatch({ kind: "set-power", powered: true })

    await expect(invalid).rejects.toBeInstanceOf(TypeError)
    await Promise.all([volume, power])

    expect(service.read().volume).toBe(0)
    expect(media.volume).toBe(0)
    expect(service.read().powered).toBe(true)
    service.dispose()
    await flush()
  })
})
