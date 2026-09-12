export const RADIO_BANDS = ["FM", "AM", "SW"] as const

export type RadioBand = (typeof RADIO_BANDS)[number]
export type PlaybackState = "stopped" | "playing" | "paused" | "buffering" | "error"

export type TrackMetadata = {
  readonly title: string
  readonly artist: string
  readonly durationSeconds: number
}

export type MediaSnapshot = {
  readonly playback: PlaybackState
  readonly track: TrackMetadata
  readonly currentTimeSeconds: number
  readonly volume: number
  readonly spectrum: readonly number[]
}

export type RadioState = {
  readonly power: "on" | "off"
  readonly band: RadioBand
  readonly frequency: number
  readonly media: MediaSnapshot
}

export type RadioAction =
  | { readonly kind: "toggle-power" }
  | { readonly kind: "set-band"; readonly band: RadioBand }
  | { readonly kind: "tune"; readonly frequency: number }
  | { readonly kind: "media-snapshot"; readonly snapshot: MediaSnapshot }

const BAND_LIMITS: Readonly<Record<RadioBand, readonly [number, number]>> = {
  FM: [87.5, 108],
  AM: [530, 1710],
  SW: [5.9, 17.9],
}

const BAND_DEFAULTS: Readonly<Record<RadioBand, number>> = {
  FM: 98.7,
  AM: 900,
  SW: 9.7,
}

const DEFAULT_TRACK: TrackMetadata = {
  title: "Sunshine FM",
  artist: "Neon Coast",
  durationSeconds: 210,
}

export function initialRadioState(): RadioState {
  return {
    power: "on",
    band: "FM",
    frequency: BAND_DEFAULTS.FM,
    media: {
      playback: "paused",
      track: DEFAULT_TRACK,
      currentTimeSeconds: 0,
      volume: 0.72,
      spectrum: [0.18, 0.42, 0.7, 0.36, 0.58, 0.24, 0.8, 0.48],
    },
  }
}

function stoppedMedia(media: MediaSnapshot): MediaSnapshot {
  return { ...media, playback: "stopped", currentTimeSeconds: 0 }
}

function clampFrequency(band: RadioBand, frequency: number): number {
  const [minimum, maximum] = BAND_LIMITS[band]
  return Math.min(maximum, Math.max(minimum, frequency))
}

function assertNever(value: never): never {
  throw new TypeError(`Unhandled radio action: ${String(value)}`)
}

export function reduceRadioState(state: RadioState, action: RadioAction): RadioState {
  switch (action.kind) {
    case "toggle-power":
      return state.power === "on"
        ? { ...state, power: "off", media: stoppedMedia(state.media) }
        : { ...state, power: "on" }
    case "set-band":
      return { ...state, band: action.band, frequency: BAND_DEFAULTS[action.band] }
    case "tune":
      return { ...state, frequency: clampFrequency(state.band, action.frequency) }
    case "media-snapshot":
      return {
        ...state,
        media: state.power === "on" ? action.snapshot : stoppedMedia(action.snapshot),
      }
    default:
      return assertNever(action)
  }
}
