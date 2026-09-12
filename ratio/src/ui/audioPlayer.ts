import type { MediaSnapshot, PlaybackState, TrackMetadata } from "./mediaState"

export type AudioPlayer = {
  readonly snapshot: () => MediaSnapshot
  readonly subscribe: (listener: (snapshot: MediaSnapshot) => void) => () => void
  readonly play: () => void
  readonly pause: () => void
  readonly stop: () => void
  readonly seekBy: (seconds: number) => void
  readonly setVolume: (volume: number) => void
  readonly update: (deltaSeconds: number) => void
}

const TRACK: TrackMetadata = { title: "Sunshine FM", artist: "Neon Coast", durationSeconds: 210 }

export function createDemoAudioPlayer(): AudioPlayer {
  const listeners = new Set<(snapshot: MediaSnapshot) => void>()
  let playback: PlaybackState = "paused"
  let currentTimeSeconds = 0
  let volume = 0.72
  let phase = 0
  const spectrum = (): readonly number[] =>
    Array.from({ length: 24 }, (_, index) => {
      const wave = Math.sin(phase * (1.1 + (index % 5) * 0.17) + index * 0.73)
      return playback === "playing" ? 0.2 + Math.abs(wave) * 0.78 : 0.08
    })
  const snapshot = (): MediaSnapshot => ({
    playback,
    track: TRACK,
    currentTimeSeconds,
    volume,
    spectrum: spectrum(),
  })
  const emit = (): void => {
    for (const listener of listeners) listener(snapshot())
  }
  return {
    snapshot,
    subscribe(listener) {
      listeners.add(listener)
      listener(snapshot())
      return () => listeners.delete(listener)
    },
    play() {
      playback = "playing"
      emit()
    },
    pause() {
      playback = "paused"
      emit()
    },
    stop() {
      playback = "stopped"
      currentTimeSeconds = 0
      emit()
    },
    seekBy(seconds) {
      currentTimeSeconds = Math.max(
        0,
        Math.min(TRACK.durationSeconds, currentTimeSeconds + seconds),
      )
      emit()
    },
    setVolume(nextVolume) {
      volume = Math.max(0, Math.min(1, nextVolume))
      emit()
    },
    update(deltaSeconds) {
      if (playback !== "playing") return
      phase += deltaSeconds
      currentTimeSeconds = (currentTimeSeconds + deltaSeconds) % TRACK.durationSeconds
      emit()
    },
  }
}
