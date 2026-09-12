export type RadioPlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error"

export type RadioErrorCode =
  | "directory-unavailable"
  | "directory-invalid"
  | "directory-empty"
  | "power-off"
  | "station-unavailable"
  | "stream-insecure"
  | "play-blocked"
  | "unsupported-format"
  | "stream-failed"

export type RadioStation = {
  readonly source: "radio-browser" | "qa-fixture"
  readonly stationUuid: string
  readonly name: string
  readonly streamUrl: string
  readonly homepage: string | null
  readonly favicon: string | null
  readonly codec: string
  readonly bitrate: number
  readonly hls: boolean
  readonly healthy: boolean
}

export type RadioCommand =
  | { readonly kind: "set-power"; readonly powered: boolean }
  | { readonly kind: "select-station"; readonly stationUuid: string }
  | { readonly kind: "play" }
  | { readonly kind: "pause" }
  | { readonly kind: "stop" }
  | { readonly kind: "set-volume"; readonly volume: number }

export type RadioSnapshot = {
  readonly powered: boolean
  readonly status: RadioPlaybackStatus
  readonly stations: readonly RadioStation[]
  readonly selectedStation: RadioStation | null
  readonly volume: number
  readonly liveElapsedSeconds: number
  readonly visualization: readonly number[]
  readonly error: { readonly code: RadioErrorCode; readonly message: string } | null
}

export interface RadioDirectory {
  list(signal: AbortSignal): Promise<readonly RadioStation[]>
}

export interface RadioMediaService {
  read(): RadioSnapshot
  subscribe(listener: (snapshot: RadioSnapshot) => void): () => void
  dispatch(command: RadioCommand): Promise<void>
  loadStations(options?: { readonly signal?: AbortSignal; readonly force?: boolean }): Promise<void>
  dispose(): void
}
