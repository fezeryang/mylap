import type { RadioCommand, RadioMediaService } from "./radio-contracts"

const send = (service: RadioMediaService, command: RadioCommand): void => {
  void service.dispatch(command).catch(() => undefined)
}

export const handleRadioPartPick = (
  service: RadioMediaService,
  partId: string,
): boolean => {
  const snapshot = service.read()
  switch (partId) {
    case "tuner-glass":
      send(service, { kind: "set-power", powered: !snapshot.powered })
      return true
    case "transport-controls":
    case "cassette-reels":
      if (snapshot.status === "playing") {
        send(service, { kind: "pause" })
      } else {
        if (!snapshot.powered) send(service, { kind: "set-power", powered: true })
        send(service, { kind: "play" })
      }
      return true
    case "tuning-dial":
    case "top-preset-controls": {
      if (snapshot.stations.length === 0) return false
      const currentIndex = snapshot.stations.findIndex(
        (station) => station.stationUuid === snapshot.selectedStation?.stationUuid,
      )
      const next = snapshot.stations[(currentIndex + 1) % snapshot.stations.length]
      if (next === undefined) return false
      send(service, { kind: "select-station", stationUuid: next.stationUuid })
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
