import type { RadioErrorCode, RadioStation } from "./radio-contracts"
import {
  createVisualization,
  type RadioPresenter,
  radioError,
  ZERO_VISUALIZATION,
} from "./radio-presenter"

export interface RadioMediaElement extends EventTarget {
  src: string
  volume: number
  currentTime: number
  readonly paused: boolean
  play(): Promise<void>
  pause(): void
  load(): void
  removeAttribute(name: string): void
  canPlayType(type: string): CanPlayTypeResult
}

type PlaybackOptions = {
  readonly mediaElement: RadioMediaElement
  readonly presenter: RadioPresenter
  readonly allowQaFixtures: boolean
}

export class RadioPlayback {
  private generation = 0
  private source: string | null = null
  private stallTimer: ReturnType<typeof setTimeout> | null = null
  private listeners: ReadonlyMap<string, EventListener> = new Map()

  constructor(private readonly options: PlaybackOptions) {}

  hasSource(): boolean {
    return this.source !== null
  }

  play(station: RadioStation): void {
    const gate = this.validate(station)
    if (gate !== null) {
      this.failAndClear(gate)
      return
    }
    this.invalidate()
    const generation = this.generation
    this.source = station.streamUrl
    this.options.mediaElement.src = station.streamUrl
    this.installListeners(generation)
    this.options.presenter.update((current) => ({ ...current, status: "loading", error: null }))
    let request: Promise<void>
    try {
      request = this.options.mediaElement.play()
    } catch (error) {
      this.onPlayRejected(generation, error)
      return
    }
    request.then(
      () => this.onPlayFulfilled(generation),
      (error: unknown) => this.onPlayRejected(generation, error),
    )
  }

  pause(): void {
    if (!this.hasSource()) {
      this.options.presenter.update((current) => ({ ...current, status: "idle", error: null }))
      return
    }
    this.invalidate()
    this.options.mediaElement.pause()
    this.options.presenter.update((current) => ({ ...current, status: "paused", error: null }))
  }

  clear(status: "idle" | "error" = "idle", code?: RadioErrorCode): void {
    this.resetSource()
    this.options.presenter.update((current) => ({
      ...current,
      status,
      liveElapsedSeconds: 0,
      visualization: ZERO_VISUALIZATION,
      error: code === undefined ? null : radioError(code),
    }))
  }

  resetSource(): void {
    this.invalidate()
    this.options.mediaElement.pause()
    this.source = null
    this.options.mediaElement.removeAttribute("src")
    this.options.mediaElement.load()
  }

  dispose(): void {
    this.resetSource()
  }

  private validate(station: RadioStation): RadioErrorCode | null {
    const qaRelative =
      this.options.allowQaFixtures &&
      station.source === "qa-fixture" &&
      station.streamUrl.startsWith("/qa/")
    if (!qaRelative) {
      let url: URL
      try {
        url = new URL(station.streamUrl)
      } catch (error) {
        if (error instanceof TypeError) return "stream-insecure"
        throw error
      }
      if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
        return "stream-insecure"
      }
    }
    if (station.hls) {
      return this.playable("application/vnd.apple.mpegurl") ? null : "unsupported-format"
    }
    const mimeTypes = this.mimeTypes(station.codec)
    return mimeTypes.some((mimeType) => this.playable(mimeType)) ? null : "unsupported-format"
  }

  private mimeTypes(codec: string): readonly string[] {
    switch (codec) {
      case "MP3":
        return ["audio/mpeg"]
      case "AAC":
      case "AAC+":
        return ["audio/aac", "audio/mp4"]
      case "OGG":
        return ["audio/ogg"]
      case "WAV":
        return ["audio/wav"]
      default:
        return []
    }
  }

  private playable(mimeType: string): boolean {
    return this.options.mediaElement.canPlayType(mimeType) !== ""
  }

  private installListeners(generation: number): void {
    const listeners = new Map<string, EventListener>([
      ["playing", () => this.onPlaying(generation)],
      ["timeupdate", () => this.onTimeUpdate(generation)],
      ["waiting", () => this.onWaiting(generation)],
      ["stalled", () => this.onWaiting(generation)],
      ["canplay", () => this.onCanPlay(generation)],
      ["error", () => this.onMediaError(generation)],
    ])
    this.listeners = listeners
    for (const [type, listener] of listeners) {
      this.options.mediaElement.addEventListener(type, listener)
    }
  }

  private invalidate(): void {
    this.generation += 1
    this.clearTimer()
    for (const [type, listener] of this.listeners) {
      this.options.mediaElement.removeEventListener(type, listener)
    }
    this.listeners = new Map()
  }

  private clearTimer(): void {
    if (this.stallTimer === null) return
    clearTimeout(this.stallTimer)
    this.stallTimer = null
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation
  }

  private onPlayFulfilled(generation: number): void {
    if (!this.isCurrent(generation)) return
    this.clearTimer()
    if (this.options.presenter.read().status === "playing") return
    this.options.presenter.update((current) => ({ ...current, status: "playing" }))
  }

  private onPlayRejected(generation: number, error: unknown): void {
    if (!this.isCurrent(generation)) return
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      this.invalidate()
      this.options.mediaElement.pause()
      this.options.presenter.update((current) => ({
        ...current,
        status: "error",
        error: radioError("play-blocked"),
      }))
      return
    }
    const code =
      error instanceof DOMException && error.name === "NotSupportedError"
        ? "unsupported-format"
        : "stream-failed"
    this.failAndClear(code)
  }

  private onPlaying(generation: number): void {
    if (!this.isCurrent(generation)) return
    this.clearTimer()
    const elapsed = this.options.mediaElement.currentTime
    this.options.presenter.update((current) =>
      Number.isFinite(elapsed)
        ? {
            ...current,
            status: "playing",
            liveElapsedSeconds: Math.max(0, elapsed),
            visualization: createVisualization(Math.max(0, elapsed)),
          }
        : { ...current, status: "playing" },
    )
  }

  private onTimeUpdate(generation: number): void {
    if (!this.isCurrent(generation) || this.options.presenter.read().status !== "playing") return
    const elapsed = this.options.mediaElement.currentTime
    if (!Number.isFinite(elapsed)) return
    const normalized = Math.max(0, elapsed)
    this.options.presenter.update((current) => ({
      ...current,
      liveElapsedSeconds: normalized,
      visualization: createVisualization(normalized),
    }))
  }

  private onWaiting(generation: number): void {
    if (!this.isCurrent(generation)) return
    this.options.presenter.update((current) => ({ ...current, status: "loading" }))
    this.clearTimer()
    this.stallTimer = setTimeout(() => {
      if (this.isCurrent(generation)) this.failAndClear("stream-failed")
    }, 8_000)
  }

  private onCanPlay(generation: number): void {
    if (!this.isCurrent(generation) || this.options.presenter.read().status !== "loading") return
    this.clearTimer()
  }

  private onMediaError(generation: number): void {
    if (this.isCurrent(generation)) this.failAndClear("stream-failed")
  }

  private failAndClear(code: RadioErrorCode): void {
    this.clear("error", code)
  }
}
