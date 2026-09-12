import type { RadioCommand, RadioMediaService, RadioSnapshot } from "../services/radio-contracts"
import { element, listen } from "./dom"

export type OhoControlsHandle = {
  readonly element: HTMLElement
  dispose(): void
}

const formatSnapshot = (snapshot: RadioSnapshot): string => {
  if (snapshot.error !== null) return `${snapshot.error.code}: ${snapshot.error.message}`
  const station = snapshot.selectedStation?.name ?? "No station selected"
  return `${snapshot.status.toUpperCase()} · ${station} · ${Math.round(snapshot.volume * 100)}%`
}

export const createOhoControls = (radioService: RadioMediaService): OhoControlsHandle => {
  const root = element("section", "oho-controls")
  root.dataset["testid"] = "oho-controls"
  root.setAttribute("aria-label", "Oh-hO radio controls")
  const heading = element("h2", "launcher-section-heading", "Oh-hO")
  const status = element("p", "oho-status", "")
  status.setAttribute("aria-live", "polite")
  const stationLabel = element("label", "oho-field", "Station")
  const station = document.createElement("select")
  station.dataset["testid"] = "oho-station"
  station.setAttribute("aria-label", "Select radio station")
  stationLabel.append(station)
  const volumeLabel = element("label", "oho-field", "Volume")
  const volume = document.createElement("input")
  volume.type = "range"
  volume.min = "0"
  volume.max = "1"
  volume.step = "0.05"
  volume.dataset["testid"] = "oho-volume"
  volume.setAttribute("aria-label", "Radio volume")
  volumeLabel.append(volume)
  const actions = element("div", "oho-actions")
  const power = element("button", "launcher-button", "Power")
  power.type = "button"
  power.dataset["testid"] = "oho-power"
  const play = element("button", "launcher-button", "Play")
  play.type = "button"
  const pause = element("button", "launcher-button", "Pause")
  pause.type = "button"
  const stop = element("button", "launcher-button", "Stop")
  stop.type = "button"
  const refresh = element("button", "launcher-button", "Refresh")
  refresh.type = "button"
  actions.append(power, play, pause, stop, refresh)
  root.append(heading, status, stationLabel, volumeLabel, actions)

  const reportFailure = (error: unknown): void => {
    if (error instanceof DOMException && error.name === "AbortError") {
      status.textContent = "Radio update canceled"
      return
    }
    status.textContent = "Radio update failed"
  }
  const send = (command: RadioCommand): void => {
    void radioService.dispatch(command).catch(reportFailure)
  }
  const render = (snapshot: RadioSnapshot): void => {
    status.textContent = formatSnapshot(snapshot)
    power.setAttribute("aria-pressed", String(snapshot.powered))
    power.textContent = snapshot.powered ? "Power off" : "Power on"
    volume.value = String(snapshot.volume)
    station.replaceChildren()
    for (const current of snapshot.stations) {
      const option = document.createElement("option")
      option.value = current.stationUuid
      option.textContent = current.name
      option.selected = current.stationUuid === snapshot.selectedStation?.stationUuid
      station.append(option)
    }
    station.disabled = snapshot.stations.length === 0
  }

  render(radioService.read())
  const unsubscribe = radioService.subscribe(render)
  let disposed = false
  const cleanups = [
    listen(power, "click", () =>
      send({ kind: "set-power", powered: !radioService.read().powered }),
    ),
    listen(play, "click", () => send({ kind: "play" })),
    listen(pause, "click", () => send({ kind: "pause" })),
    listen(stop, "click", () => send({ kind: "stop" })),
    listen(refresh, "click", () => {
      void radioService.loadStations({ force: true }).catch(reportFailure)
    }),
    listen(station, "change", () => send({ kind: "select-station", stationUuid: station.value })),
    listen(volume, "input", () => send({ kind: "set-volume", volume: Number(volume.value) })),
  ]

  return {
    element: root,
    dispose: () => {
      if (disposed) return
      disposed = true
      for (const cleanup of cleanups) cleanup()
      unsubscribe()
    },
  }
}
