import type {
  RadioCommand,
  RadioDirectory,
  RadioMediaService,
  RadioSnapshot,
  RadioStation,
} from "./radio-contracts"
import type { RadioDirectoryError } from "./radio-directory"
import { RadioDiscovery } from "./radio-media-service-discovery"
import { type RadioMediaElement, RadioPlayback } from "./radio-media-service-playback"
import { RadioPresenter, radioError, ZERO_VISUALIZATION } from "./radio-presenter"

export type { RadioMediaElement } from "./radio-media-service-playback"

type RadioMediaServiceOptions = {
  readonly directory: RadioDirectory
  readonly mediaElement: RadioMediaElement
  readonly allowQaFixtures?: boolean
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected radio command: ${String(value)}`)
}

export function createRadioMediaService(options: RadioMediaServiceOptions): RadioMediaService {
  const presenter = new RadioPresenter()
  const playback = new RadioPlayback({
    mediaElement: options.mediaElement,
    presenter,
    allowQaFixtures: options.allowQaFixtures ?? false,
  })
  let disposed = false
  let queue = Promise.resolve()
  options.mediaElement.volume = presenter.read().volume

  const commitStations = (stations: readonly RadioStation[]): void => {
    const current = presenter.read()
    const previous = current.selectedStation
    const retained =
      previous === null
        ? null
        : (stations.find((station) => station.stationUuid === previous.stationUuid) ?? null)
    const retainsPlayback = retained !== null && retained.streamUrl === previous?.streamUrl
    if (previous !== null && !retainsPlayback) playback.resetSource()
    presenter.update((latest) => ({
      ...latest,
      stations,
      selectedStation: retainsPlayback ? retained : (stations[0] ?? null),
      status: previous === null || !retainsPlayback ? "idle" : latest.status,
      liveElapsedSeconds: previous !== null && !retainsPlayback ? 0 : latest.liveElapsedSeconds,
      visualization:
        previous !== null && !retainsPlayback ? ZERO_VISUALIZATION : latest.visualization,
      error: null,
    }))
  }

  const commitDirectoryError = (error: RadioDirectoryError): void => {
    presenter.update((current) => ({
      ...current,
      status: current.stations.length === 0 ? "error" : current.status,
      error: radioError(error.code, error.message),
    }))
  }

  const discovery = new RadioDiscovery(options.directory, {
    commitStations,
    commitError: commitDirectoryError,
  })

  const perform = (command: RadioCommand): void => {
    switch (command.kind) {
      case "set-power":
        if (!command.powered) {
          playback.resetSource()
          presenter.update((current) => ({
            ...current,
            powered: false,
            status: "idle",
            liveElapsedSeconds: 0,
            visualization: ZERO_VISUALIZATION,
            error: null,
          }))
          return
        }
        presenter.update((current) => ({
          ...current,
          powered: true,
          status: playback.hasSource() ? "paused" : "idle",
          error: current.error?.code === "power-off" ? null : current.error,
        }))
        return
      case "select-station": {
        const station = presenter
          .read()
          .stations.find((candidate) => candidate.stationUuid === command.stationUuid)
        if (station === undefined) {
          presenter.update((current) => ({
            ...current,
            status: "error",
            error: radioError("station-unavailable"),
          }))
          return
        }
        playback.resetSource()
        presenter.update((current) => ({
          ...current,
          selectedStation: station,
          status: "idle",
          liveElapsedSeconds: 0,
          visualization: ZERO_VISUALIZATION,
          error: null,
        }))
        return
      }
      case "play": {
        const current = presenter.read()
        if (!current.powered) {
          presenter.update((latest) => ({
            ...latest,
            status: "error",
            error: radioError("power-off"),
          }))
          return
        }
        if (current.selectedStation === null) {
          presenter.update((latest) => ({
            ...latest,
            status: "error",
            error: radioError("station-unavailable"),
          }))
          return
        }
        playback.play(current.selectedStation)
        return
      }
      case "pause":
        playback.pause()
        return
      case "stop":
        playback.resetSource()
        presenter.update((current) => ({
          ...current,
          status: "idle",
          liveElapsedSeconds: 0,
          visualization: ZERO_VISUALIZATION,
          error: null,
        }))
        return
      case "set-volume":
        if (!Number.isFinite(command.volume)) {
          throw new TypeError("Radio volume must be finite")
        }
        options.mediaElement.volume = Math.min(1, Math.max(0, command.volume))
        presenter.update((current) => ({ ...current, volume: options.mediaElement.volume }))
        return
      default:
        assertNever(command)
    }
  }

  return {
    read: (): RadioSnapshot => presenter.read(),
    subscribe: (listener) => presenter.subscribe(listener),
    dispatch(command) {
      if (disposed) return Promise.reject(new DOMException("Disposed", "AbortError"))
      const result = queue.then(() => {
        if (disposed) throw new DOMException("Disposed", "AbortError")
        perform(command)
      })
      queue = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
    loadStations: (loadOptions) => discovery.load(loadOptions),
    dispose() {
      if (disposed) return
      disposed = true
      discovery.dispose()
      playback.dispose()
      presenter.dispose()
    },
  }
}
