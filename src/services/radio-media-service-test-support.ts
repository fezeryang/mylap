import type { RadioDirectory, RadioStation } from "./radio-contracts"
import type { RadioMediaElement } from "./radio-media-service"

export const station = (
  stationUuid: string,
  streamUrl = `https://streams.example/${stationUuid}.mp3`,
  codec = "MP3",
  hls = false,
): RadioStation => ({
  source: "radio-browser",
  stationUuid,
  name: stationUuid.toUpperCase(),
  streamUrl,
  homepage: null,
  favicon: null,
  codec,
  bitrate: 128,
  hls,
  healthy: true,
})

export class ControlledDirectory implements RadioDirectory {
  readonly calls: AbortSignal[] = []
  readonly pending: Array<{
    readonly resolve: (stations: readonly RadioStation[]) => void
    readonly reject: (error: Error) => void
  }> = []

  list(signal: AbortSignal): Promise<readonly RadioStation[]> {
    this.calls.push(signal)
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject })
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
        once: true,
      })
    })
  }
}

export class FakeMediaElement extends EventTarget implements RadioMediaElement {
  src = ""
  volume = 1
  currentTime = 0
  paused = true
  readonly playCalls: Array<{
    readonly resolve: () => void
    readonly reject: (error: Error) => void
  }> = []
  pauseCount = 0
  loadCount = 0
  readonly playable = new Map<string, CanPlayTypeResult>([
    ["audio/mpeg", "probably"],
    ["audio/aac", "probably"],
    ["audio/mp4", "probably"],
    ["audio/ogg", "probably"],
    ["audio/wav", "probably"],
  ])
  readonly activeListeners = new Map<string, Set<EventListenerOrEventListenerObject>>()

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, callback, options)
    if (callback === null) return
    const listeners = this.activeListeners.get(type) ?? new Set()
    listeners.add(callback)
    this.activeListeners.set(type, listeners)
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, callback, options)
    if (callback === null) return
    this.activeListeners.get(type)?.delete(callback)
  }

  play(): Promise<void> {
    this.paused = false
    return new Promise((resolve, reject) => this.playCalls.push({ resolve, reject }))
  }

  pause(): void {
    this.paused = true
    this.pauseCount += 1
  }

  load(): void {
    this.loadCount += 1
  }

  removeAttribute(name: string): void {
    if (name === "src") this.src = ""
  }

  canPlayType(type: string): CanPlayTypeResult {
    return this.playable.get(type) ?? ""
  }

  emit(type: string): void {
    this.dispatchEvent(new Event(type))
  }

  listenerCount(): number {
    return [...this.activeListeners.values()].reduce(
      (total, listeners) => total + listeners.size,
      0,
    )
  }
}

export const flush = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

export const loadOne = async (
  service: { loadStations(): Promise<void> },
  directory: ControlledDirectory,
  value = station("one"),
): Promise<void> => {
  const loading = service.loadStations()
  directory.pending[0]?.resolve([value])
  await loading
}
