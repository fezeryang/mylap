import { describe, expect, test } from "bun:test"
import { initialRadioState, type MediaSnapshot, reduceRadioState } from "./mediaState"

const playingSnapshot = (): MediaSnapshot => ({
  playback: "playing",
  track: { title: "Sunshine FM", artist: "Neon Coast", durationSeconds: 180 },
  currentTimeSeconds: 42,
  volume: 0.76,
  spectrum: [0.1, 0.4, 0.8, 0.3],
})

describe("radio media state", () => {
  test("Given the initial radio, when inspected, then the reference station is ready", () => {
    const state = initialRadioState()

    expect(state.power).toBe("on")
    expect(state.band).toBe("FM")
    expect(state.frequency).toBe(98.7)
    expect(state.media.track.title).toBe("Sunshine FM")
  })

  test("Given a powered radio, when power is toggled off, then playback becomes stopped", () => {
    const playing = reduceRadioState(initialRadioState(), {
      kind: "media-snapshot",
      snapshot: playingSnapshot(),
    })

    const poweredOff = reduceRadioState(playing, { kind: "toggle-power" })

    expect(poweredOff.power).toBe("off")
    expect(poweredOff.media.playback).toBe("stopped")
    expect(poweredOff.frequency).toBe(98.7)
  })

  test("Given FM mode, when tuning outside the supported range, then frequency is clamped", () => {
    const tooHigh = reduceRadioState(initialRadioState(), { kind: "tune", frequency: 116 })
    const tooLow = reduceRadioState(initialRadioState(), { kind: "tune", frequency: 70 })

    expect(tooHigh.frequency).toBe(108)
    expect(tooLow.frequency).toBe(87.5)
  })

  test("Given external player data, when a snapshot arrives, then display-ready media is preserved", () => {
    const snapshot = playingSnapshot()

    const next = reduceRadioState(initialRadioState(), {
      kind: "media-snapshot",
      snapshot,
    })

    expect(next.media).toEqual(snapshot)
  })
})
