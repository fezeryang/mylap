import type { RadioCommand, RadioMediaService } from "./radio-contracts"

type RadioAction = {
  readonly controller: AbortController
  readonly wantsPlayback: boolean
}

const pendingActions = new WeakMap<RadioMediaService, RadioAction>()

const cancelRadioAction = (service: RadioMediaService): void => {
  pendingActions.get(service)?.controller.abort()
  pendingActions.delete(service)
}

const wantsRadioPlayback = (service: RadioMediaService): boolean => {
  const snapshot = service.read()
  return (
    snapshot.status === "playing" ||
    snapshot.status === "loading" ||
    pendingActions.get(service)?.wantsPlayback === true
  )
}

const runRadioAction = async (
  service: RadioMediaService,
  wantsPlayback: boolean,
  action: (signal: AbortSignal) => Promise<void>,
): Promise<void> => {
  cancelRadioAction(service)
  const pending = { controller: new AbortController(), wantsPlayback }
  pendingActions.set(service, pending)
  try {
    await action(pending.controller.signal)
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) throw error
  } finally {
    if (pendingActions.get(service) === pending) pendingActions.delete(service)
  }
}

const discoverRadioStations = async (
  service: RadioMediaService,
  signal: AbortSignal,
): Promise<boolean> => {
  if (signal.aborted) return false
  if (service.read().stations.length === 0) await service.loadStations({ signal })
  // Discovery publishes its own errors. Do not overwrite them with a failed play command.
  return !signal.aborted && service.read().stations.length > 0
}

export const playRadio = (service: RadioMediaService): Promise<void> =>
  runRadioAction(service, true, async (signal) => {
    if (!service.read().powered) await service.dispatch({ kind: "set-power", powered: true })
    if (!(await discoverRadioStations(service, signal)) || !service.read().powered) return
    const selected = service.read().selectedStation ?? service.read().stations[0]
    if (selected === undefined) return
    if (service.read().selectedStation === null) {
      await service.dispatch({ kind: "select-station", stationUuid: selected.stationUuid })
    }
    if (!signal.aborted && service.read().powered) await service.dispatch({ kind: "play" })
  })

export const pauseRadio = (service: RadioMediaService): Promise<void> => {
  cancelRadioAction(service)
  return service.dispatch({ kind: "pause" })
}

export const stopRadio = (service: RadioMediaService): Promise<void> => {
  cancelRadioAction(service)
  return service.dispatch({ kind: "stop" })
}

export const setRadioPower = (service: RadioMediaService, powered: boolean): Promise<void> => {
  if (!powered) cancelRadioAction(service)
  return service.dispatch({ kind: "set-power", powered })
}

export const toggleRadioPlayback = (service: RadioMediaService): Promise<void> =>
  wantsRadioPlayback(service) ? pauseRadio(service) : playRadio(service)

const selectStation = async (
  service: RadioMediaService,
  stationUuid: string,
  resume: boolean,
  signal: AbortSignal,
): Promise<void> => {
  if (signal.aborted) return
  if (service.read().selectedStation?.stationUuid !== stationUuid) {
    await service.dispatch({ kind: "select-station", stationUuid })
  }
  if (signal.aborted || service.read().selectedStation?.stationUuid !== stationUuid || !resume) {
    return
  }
  if (!service.read().powered) await service.dispatch({ kind: "set-power", powered: true })
  if (!signal.aborted && service.read().powered) await service.dispatch({ kind: "play" })
}

export const selectRadioStation = (
  service: RadioMediaService,
  stationUuid: string,
): Promise<void> => {
  const resume = wantsRadioPlayback(service)
  return runRadioAction(service, resume, async (signal) => {
    if (await discoverRadioStations(service, signal)) {
      await selectStation(service, stationUuid, resume, signal)
    }
  })
}

export const stepRadioStation = (service: RadioMediaService, offset: number): Promise<void> => {
  if (!Number.isInteger(offset))
    return Promise.reject(new TypeError("Station step must be an integer"))
  const resume = wantsRadioPlayback(service)
  return runRadioAction(service, resume, async (signal) => {
    if (!(await discoverRadioStations(service, signal))) return
    const snapshot = service.read()
    const currentIndex = snapshot.stations.findIndex(
      (station) => station.stationUuid === snapshot.selectedStation?.stationUuid,
    )
    const count = snapshot.stations.length
    const index = ((((currentIndex < 0 ? 0 : currentIndex) + offset) % count) + count) % count
    const station = snapshot.stations[index]
    if (station !== undefined) await selectStation(service, station.stationUuid, resume, signal)
  })
}

const send = (service: RadioMediaService, command: RadioCommand): void => {
  void service.dispatch(command).catch(() => undefined)
}

const handleTransport = (service: RadioMediaService, controlId: string): boolean => {
  switch (controlId) {
    case "play":
      void playRadio(service).catch(() => undefined)
      return true
    case "pause":
      void pauseRadio(service).catch(() => undefined)
      return true
    case "stop":
      void stopRadio(service).catch(() => undefined)
      return true
    case "rew":
    case "ff":
      void stepRadioStation(service, controlId === "rew" ? -1 : 1).catch(() => undefined)
      return true
    default:
      return false
  }
}

export const handleRadioPartPick = (
  service: RadioMediaService,
  partId: string,
  controlId?: string,
): boolean => {
  const snapshot = service.read()
  switch (partId) {
    case "tuner-glass":
      void setRadioPower(service, !snapshot.powered).catch(() => undefined)
      return true
    case "transport-controls":
      if (controlId !== undefined) return handleTransport(service, controlId)
      void toggleRadioPlayback(service).catch(() => undefined)
      return true
    case "cassette-reels":
      void toggleRadioPlayback(service).catch(() => undefined)
      return true
    case "tuning-dial":
    case "top-preset-controls": {
      const preset = controlId?.match(/^preset-([1-5])$/)
      if (preset !== undefined && preset !== null) {
        const index = Number(preset[1]) - 1
        const resume = wantsRadioPlayback(service)
        void runRadioAction(service, resume, async (signal) => {
          if (!(await discoverRadioStations(service, signal))) return
          const station = service.read().stations[index]
          if (station !== undefined)
            await selectStation(service, station.stationUuid, resume, signal)
        }).catch(() => undefined)
      } else {
        void stepRadioStation(service, 1).catch(() => undefined)
      }
      return true
    }
    case "volume-slider":
      send(service, {
        kind: "set-volume",
        volume: snapshot.volume >= 0.95 ? 0.15 : snapshot.volume + 0.1,
      })
      return true
    default:
      return false
  }
}
