import type { RadioErrorCode, RadioSnapshot, RadioStation } from "./radio-contracts"

export const ZERO_VISUALIZATION = Object.freeze(Array<number>(24).fill(0))

export function createVisualization(elapsed: number): readonly number[] {
  return Array.from(
    { length: 24 },
    (_, index) =>
      Math.round((0.5 + 0.5 * Math.sin(elapsed * 2.4 + index * 0.73)) * 10_000) / 10_000,
  )
}

const ERROR_MESSAGES = {
  "directory-unavailable": "Radio directory is unavailable",
  "directory-invalid": "Radio directory responses were invalid",
  "directory-empty": "No playable radio stations were found",
  "power-off": "Turn the radio on before playing",
  "station-unavailable": "The selected radio station is unavailable",
  "stream-insecure": "Only secure radio streams are allowed",
  "play-blocked": "Playback was blocked; try again",
  "unsupported-format": "This radio stream format is unsupported",
  "stream-failed": "The radio stream failed",
} as const satisfies Readonly<Record<RadioErrorCode, string>>

export function radioError(code: RadioErrorCode, message: string = ERROR_MESSAGES[code]) {
  return Object.freeze({ code, message })
}

function freezeStations(stations: readonly RadioStation[]): readonly RadioStation[] {
  if (Object.isFrozen(stations) && stations.every(Object.isFrozen)) return stations
  return Object.freeze(stations.map((station) => Object.freeze({ ...station })))
}

function freezeVisualization(values: readonly number[]): readonly number[] {
  return Object.isFrozen(values) ? values : Object.freeze([...values])
}

function freezeSnapshot(candidate: RadioSnapshot): RadioSnapshot {
  const stations = freezeStations(candidate.stations)
  const selectedStation =
    candidate.selectedStation === null
      ? null
      : (stations.find(
          (station) => station.stationUuid === candidate.selectedStation?.stationUuid,
        ) ?? null)
  return Object.freeze({
    ...candidate,
    stations,
    selectedStation,
    visualization: freezeVisualization(candidate.visualization),
    error: candidate.error === null ? null : Object.freeze({ ...candidate.error }),
  })
}

export function createInitialRadioSnapshot(): RadioSnapshot {
  return freezeSnapshot({
    powered: false,
    status: "idle",
    stations: Object.freeze([]),
    selectedStation: null,
    volume: 0.7,
    liveElapsedSeconds: 0,
    visualization: ZERO_VISUALIZATION,
    error: null,
  })
}

export class RadioPresenter {
  private snapshot = createInitialRadioSnapshot()
  private readonly listeners = new Set<(snapshot: RadioSnapshot) => void>()
  private disposed = false

  read(): RadioSnapshot {
    return this.snapshot
  }

  subscribe(listener: (snapshot: RadioSnapshot) => void): () => void {
    if (this.disposed) return () => undefined
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  update(build: (current: RadioSnapshot) => RadioSnapshot): void {
    if (this.disposed) return
    this.snapshot = freezeSnapshot(build(this.snapshot))
    for (const listener of this.listeners) listener(this.snapshot)
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
  }
}
