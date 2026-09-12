import { describe, expect, test } from "bun:test"
import { createRadioMediaService } from "./radio-media-service"
import {
  ControlledDirectory,
  FakeMediaElement,
  flush,
  loadOne,
  station,
} from "./radio-media-service-test-support"

describe("radio media playback", () => {
  test("surfaces media play rejection", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    await loadOne(service, directory)
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "play" })
    expect(service.read().status).toBe("loading")
    media.playCalls[0]?.reject(new DOMException("Gesture required", "NotAllowedError"))
    await flush()
    expect(service.read().status).toBe("error")
    expect(service.read().error?.code).toBe("play-blocked")
    expect(media.src).toBe(station("one").streamUrl)
    service.dispose()
  })

  test("confirms play and computes exact finite samples without a timer", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    await loadOne(service, directory)
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "play" })
    media.currentTime = 2
    media.emit("playing")
    const expected = Array.from(
      { length: 24 },
      (_, index) => Math.round((0.5 + 0.5 * Math.sin(2 * 2.4 + index * 0.73)) * 10_000) / 10_000,
    )
    expect(service.read().status).toBe("playing")
    expect(service.read().liveElapsedSeconds).toBe(2)
    expect(service.read().visualization).toEqual(expected)
    service.dispose()
  })

  test("play fulfillment changes only status and nonfinite time never emits", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    await loadOne(service, directory)
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "play" })
    const snapshots: unknown[] = []
    service.subscribe((snapshot) => snapshots.push(snapshot))
    media.playCalls[0]?.resolve()
    await flush()
    const afterFulfillment = snapshots.length
    media.currentTime = Number.NaN
    media.emit("timeupdate")
    expect(service.read().status).toBe("playing")
    expect(service.read().liveElapsedSeconds).toBe(0)
    expect(snapshots).toHaveLength(afterFulfillment)
    service.dispose()
  })

  test("applies power selection pause stop and volume transitions", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    const loading = service.loadStations()
    directory.pending[0]?.resolve([station("one"), station("two")])
    await loading
    await service.dispatch({ kind: "play" })
    expect(service.read().error?.code).toBe("power-off")
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "select-station", stationUuid: "missing" })
    expect(service.read().error?.code).toBe("station-unavailable")
    await service.dispatch({ kind: "select-station", stationUuid: "two" })
    await service.dispatch({ kind: "play" })
    media.currentTime = 3
    media.emit("playing")
    await service.dispatch({ kind: "pause" })
    expect(service.read().status).toBe("paused")
    expect(service.read().liveElapsedSeconds).toBe(3)
    await service.dispatch({ kind: "set-volume", volume: 2 })
    expect(service.read().volume).toBe(1)
    await expect(
      service.dispatch({ kind: "set-volume", volume: Number.NaN }),
    ).rejects.toBeInstanceOf(TypeError)
    expect(service.read().volume).toBe(1)
    await service.dispatch({ kind: "stop" })
    expect(service.read().status).toBe("idle")
    expect(service.read().liveElapsedSeconds).toBe(0)
    expect(media.src).toBe("")
    service.dispose()
  })

  test("gates insecure unsupported HLS and permits WAV plus QA fixtures", async () => {
    const rows = [
      station("http", "http://stream.example/a.mp3"),
      station("unknown", "https://stream.example/a.bin", "FLAC"),
      station("hls", "https://stream.example/a.m3u8", "AAC", true),
      station("wav", "https://stream.example/a.wav", "WAV"),
    ]
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    media.playable.set("application/vnd.apple.mpegurl", "")
    const service = createRadioMediaService({ directory, mediaElement: media })
    const loading = service.loadStations()
    directory.pending[0]?.resolve(rows)
    await loading
    await service.dispatch({ kind: "set-power", powered: true })
    for (const [id, code] of [
      ["http", "stream-insecure"],
      ["unknown", "unsupported-format"],
      ["hls", "unsupported-format"],
    ] as const) {
      await service.dispatch({ kind: "select-station", stationUuid: id })
      await service.dispatch({ kind: "play" })
      expect(service.read().error?.code).toBe(code)
      expect(media.src).toBe("")
    }
    await service.dispatch({ kind: "select-station", stationUuid: "wav" })
    await service.dispatch({ kind: "play" })
    expect(media.src).toBe("https://stream.example/a.wav")
    service.dispose()

    const qaDirectory = new ControlledDirectory()
    const qaMedia = new FakeMediaElement()
    const qa = createRadioMediaService({
      directory: qaDirectory,
      mediaElement: qaMedia,
      allowQaFixtures: true,
    })
    const qaStation = { ...station("qa", "/qa/radio.wav", "WAV"), source: "qa-fixture" } as const
    await loadOne(qa, qaDirectory, qaStation)
    await qa.dispatch({ kind: "set-power", powered: true })
    await qa.dispatch({ kind: "play" })
    expect(qaMedia.src).toBe("/qa/radio.wav")
    qa.dispose()
  })

  test("supports exact MP3 AAC fallback OGG WAV and native HLS MIME gates", async () => {
    const rows = [
      station("mp3", "https://stream.example/a.mp3", "MP3"),
      station("aac", "https://stream.example/a.aac", "AAC+"),
      station("ogg", "https://stream.example/a.ogg", "OGG"),
      station("wav", "https://stream.example/a.wav", "WAV"),
      station("hls", "https://stream.example/a.m3u8", "UNKNOWN", true),
    ]
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    media.playable.set("audio/aac", "")
    media.playable.set("audio/mp4", "maybe")
    media.playable.set("application/vnd.apple.mpegurl", "probably")
    const service = createRadioMediaService({ directory, mediaElement: media })
    const loading = service.loadStations()
    directory.pending[0]?.resolve(rows)
    await loading
    await service.dispatch({ kind: "set-power", powered: true })

    for (const row of rows) {
      await service.dispatch({ kind: "select-station", stationUuid: row.stationUuid })
      await service.dispatch({ kind: "play" })
      expect(media.src).toBe(row.streamUrl)
      await service.dispatch({ kind: "stop" })
    }
    service.dispose()
  })

  test("requires both QA capability and QA fixture source for relative streams", async () => {
    const cases = [
      { allowQaFixtures: false, source: "qa-fixture" as const },
      { allowQaFixtures: true, source: "radio-browser" as const },
    ]
    for (const fixture of cases) {
      const directory = new ControlledDirectory()
      const media = new FakeMediaElement()
      const service = createRadioMediaService({
        directory,
        mediaElement: media,
        allowQaFixtures: fixture.allowQaFixtures,
      })
      await loadOne(service, directory, {
        ...station("relative", "/qa/radio.wav", "WAV"),
        source: fixture.source,
      })
      await service.dispatch({ kind: "set-power", powered: true })
      await service.dispatch({ kind: "play" })
      expect(service.read().error?.code).toBe("stream-insecure")
      expect(media.src).toBe("")
      service.dispose()
    }
  })

  test("classifies play rejections and recovers on a later play", async () => {
    const cases = [
      { error: new DOMException("bad", "NotSupportedError"), code: "unsupported-format" },
      { error: new Error("network"), code: "stream-failed" },
    ] as const
    for (const fixture of cases) {
      const directory = new ControlledDirectory()
      const media = new FakeMediaElement()
      const service = createRadioMediaService({ directory, mediaElement: media })
      await loadOne(service, directory)
      await service.dispatch({ kind: "set-power", powered: true })
      await service.dispatch({ kind: "play" })
      media.playCalls[0]?.reject(fixture.error)
      await flush()
      expect(service.read().error?.code).toBe(fixture.code)
      expect(media.src).toBe("")

      await service.dispatch({ kind: "play" })
      media.playCalls[1]?.resolve()
      await flush()
      expect(service.read().status).toBe("playing")
      expect(service.read().error).toBeNull()
      service.dispose()
    }
  })

  test("clamps negative elapsed time and retains samples for nonfinite playing", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    await loadOne(service, directory)
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "play" })
    media.currentTime = -5
    media.emit("playing")
    expect(service.read().liveElapsedSeconds).toBe(0)
    const samples = service.read().visualization

    await service.dispatch({ kind: "pause" })
    await service.dispatch({ kind: "play" })
    media.currentTime = Number.POSITIVE_INFINITY
    media.emit("playing")
    expect(service.read().status).toBe("playing")
    expect(service.read().visualization).toBe(samples)
    service.dispose()
  })

  test("power off clears source while retrying a blocked source remains paused", async () => {
    const directory = new ControlledDirectory()
    const media = new FakeMediaElement()
    const service = createRadioMediaService({ directory, mediaElement: media })
    await loadOne(service, directory)
    await service.dispatch({ kind: "set-power", powered: true })
    await service.dispatch({ kind: "play" })
    media.playCalls[0]?.reject(new DOMException("blocked", "NotAllowedError"))
    await flush()
    expect(media.paused).toBe(true)
    expect(media.src).not.toBe("")

    await service.dispatch({ kind: "set-power", powered: false })
    expect(service.read().powered).toBe(false)
    expect(service.read().error).toBeNull()
    expect(media.src).toBe("")
    service.dispose()
  })
})
