import type { RadioMediaService } from "../services/radio-contracts"
import {
  pauseRadio,
  playRadio,
  selectRadioStation,
  stepRadioStation,
} from "../services/radio-physical-controls"
import type { WorkspaceMusicService } from "../services/workspace-music-service"
import { element, listen, svgElement } from "./dom"

const formatTime = (seconds: number): string => {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

const button = (label: string, className: string, text = label): HTMLButtonElement => {
  const control = element("button", className, text)
  control.type = "button"
  control.setAttribute("aria-label", label)
  control.title = label
  return control
}

export const createMediaControls = (options: {
  readonly musicService: WorkspaceMusicService
  readonly radioService: RadioMediaService
}): { readonly element: HTMLElement; dispose(): void } => {
  const { musicService, radioService } = options
  const root = element("section", "media-controls")
  root.setAttribute("aria-label", "Now Playing")
  root.dataset["testid"] = "media-controls"
  const sourceLabel = element("label", "media-source", "Audio source")
  const source = element("select", "media-source-select")
  source.setAttribute("aria-label", "Audio source")
  for (const [value, label] of [
    ["library", "Library"],
    ["radio", "Radio"],
  ] as const) {
    const option = element("option", "", label)
    option.value = value
    source.append(option)
  }
  sourceLabel.append(source)
  const nowPlaying = element("div", "media-now-playing")
  const title = element("strong", "media-track-title")
  const detail = element("span", "media-track-detail")
  nowPlaying.append(title, detail)
  const stationLabel = element("label", "media-station-label", "Station")
  const station = element("select", "media-station")
  station.setAttribute("aria-label", "Radio station")
  stationLabel.append(station)
  const transport = element("div", "media-transport")
  const previous = button("Previous song", "media-previous", "")
  const play = button("Play", "media-play", "▶")
  play.dataset["testid"] = "media-play"
  const next = button("Next song", "media-next", "")
  for (const [control, path] of [
    [previous, "M5 5v14m14-14L8 12l11 7Z"],
    [next, "M19 5v14M5 5l11 7-11 7Z"],
  ] as const) {
    const icon = svgElement("svg", {
      viewBox: "0 0 24 24",
      width: "22",
      height: "22",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.8",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
    })
    icon.append(svgElement("path", { d: path }))
    control.append(icon)
  }
  transport.append(previous, play, next)
  const timeline = element("div", "media-timeline")
  const elapsed = element("span", "media-elapsed", "0:00")
  const seek = element("input", "media-seek")
  seek.type = "range"
  seek.min = "0"
  seek.max = "0"
  seek.step = "0.1"
  seek.value = "0"
  seek.setAttribute("aria-label", "Seek in song")
  const duration = element("span", "media-duration", "0:00")
  timeline.append(elapsed, seek, duration)
  const volumeLabel = element("label", "media-volume", "Volume")
  const volume = element("input", "media-volume-input")
  volume.type = "range"
  volume.min = "0"
  volume.max = "1"
  volume.step = "0.01"
  volumeLabel.append(volume)
  const actions = element("div", "media-actions")
  const addMusic = button("Add music", "media-import")
  const retry = button("Retry", "media-retry")
  const files = element("input", "media-import-files")
  files.type = "file"
  files.accept = "audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.aiff,.webm"
  files.multiple = true
  files.hidden = true
  files.dataset["testid"] = "media-import-files"
  files.setAttribute("aria-label", "Import audio files")
  actions.append(addMusic, retry, files)
  const status = element("p", "media-status")
  status.setAttribute("role", "status")
  root.append(
    sourceLabel,
    nowPlaying,
    stationLabel,
    transport,
    timeline,
    volumeLabel,
    actions,
    status,
  )

  let disposed = false
  let directoryLoading = false
  let radioStarting = false
  let actionError: string | null = null
  let stationKey = ""
  const render = (): void => {
    if (disposed) return
    const music = musicService.read()
    const radio = radioService.read()
    const isRadio = music.source === "radio"
    const track = music.tracks.find((candidate) => candidate.id === music.activeTrackId)
    const playback = isRadio ? radio.status : music.status
    const busy = playback === "loading" || (isRadio && radioStarting)
    const playing = playback === "playing"
    root.dataset["source"] = music.source
    root.dataset["playback"] = playback
    source.value = music.source
    title.textContent = isRadio
      ? (radio.selectedStation?.name ?? "Choose a station")
      : (track?.title ?? (music.tracks.length > 0 ? "Choose a song" : "Your library is empty"))
    detail.textContent = directoryLoading
      ? "Finding stations…"
      : isRadio
        ? `${radio.powered ? "Live radio" : "Radio is off"} · ${busy ? "Connecting…" : playback}`
        : track !== undefined
          ? `${busy ? "Loading…" : playback} · ${track.fileName}`
          : "Add audio files to listen across your devices."
    stationLabel.hidden = !isRadio
    const key = JSON.stringify(radio.stations.map((item) => [item.stationUuid, item.name]))
    if (stationKey !== key) {
      stationKey = key
      const items = radio.stations.map((item) => {
        const option = element("option", "", item.name)
        option.value = item.stationUuid
        return option
      })
      if (items.length === 0) {
        const empty = element(
          "option",
          "",
          directoryLoading ? "Finding stations…" : "No stations available",
        )
        empty.value = ""
        items.push(empty)
      }
      station.replaceChildren(...items)
    }
    station.value = radio.selectedStation?.stationUuid ?? ""
    station.disabled = radio.stations.length === 0 || directoryLoading
    const action =
      playing || busy ? "Pause" : !isRadio && music.tracks.length === 0 ? "Add music" : "Play"
    play.setAttribute("aria-label", action)
    play.title = action
    play.textContent = playing || busy ? "Ⅱ" : "▶"
    play.setAttribute("aria-pressed", String(playing || busy))
    previous.disabled = isRadio ? radio.stations.length < 2 : music.tracks.length === 0
    next.disabled = previous.disabled
    previous.setAttribute("aria-label", isRadio ? "Previous station" : "Previous song")
    next.setAttribute("aria-label", isRadio ? "Next station" : "Next song")
    previous.title = isRadio ? "Previous station" : "Previous song"
    next.title = isRadio ? "Next station" : "Next song"
    const canSeek = !isRadio && Number.isFinite(music.duration) && music.duration > 0
    seek.hidden = isRadio
    seek.disabled = !canSeek
    seek.max = String(canSeek ? music.duration : 0)
    seek.value = String(canSeek ? music.currentTime : 0)
    seek.setAttribute(
      "aria-valuetext",
      `${formatTime(music.currentTime)} of ${formatTime(music.duration)}`,
    )
    elapsed.textContent = formatTime(isRadio ? radio.liveElapsedSeconds : music.currentTime)
    duration.textContent = isRadio ? "LIVE" : formatTime(music.duration)
    volume.value = String(isRadio ? radio.volume : music.volume)
    volume.setAttribute("aria-label", isRadio ? "Radio volume" : "Music volume")
    volume.setAttribute("aria-valuetext", `${Math.round(Number(volume.value) * 100)} percent`)
    addMusic.hidden = isRadio
    addMusic.disabled = music.importing
    addMusic.textContent = music.importing ? "Adding music…" : "Add music"
    const serviceError = isRadio ? radio.error?.message : music.error
    const error = actionError ?? serviceError ?? null
    retry.hidden = !isRadio && (error === null || music.tracks.length === 0)
    const retryLabel = isRadio
      ? radio.stations.length === 0 || radio.error?.code.startsWith("directory-")
        ? "Retry stations"
        : error !== null
          ? "Retry playback"
          : "Refresh stations"
      : "Retry playback"
    retry.textContent = retryLabel
    retry.setAttribute("aria-label", retryLabel)
    retry.disabled = directoryLoading
    status.textContent =
      error ??
      (isRadio && radio.stations.length === 0 && !directoryLoading
        ? "No stations loaded. Press Play or Retry stations."
        : !isRadio
          ? (music.storageError ?? "")
          : "")
    status.hidden = status.textContent.length === 0
    status.dataset["error"] = String(error !== null)
  }
  const reportFailure = (error: unknown): void => {
    if (disposed || (error instanceof DOMException && error.name === "AbortError")) return
    actionError = error instanceof Error ? error.message : "Playback could not start. Try again."
    render()
  }
  const run = (action: () => Promise<void>): void => {
    actionError = null
    void action().catch(reportFailure)
  }
  const loadStations = (): void => {
    if (disposed || directoryLoading) return
    directoryLoading = true
    actionError = null
    render()
    void radioService
      .loadStations({ force: true })
      .catch(reportFailure)
      .finally(() => {
        directoryLoading = false
        render()
      })
  }
  const startRadio = (): void => {
    radioStarting = true
    render()
    run(async () => {
      try {
        await playRadio(radioService)
      } finally {
        radioStarting = false
        render()
      }
    })
  }
  const cleanups = [
    listen(source, "change", () => {
      actionError = null
      musicService.setSource(source.value === "radio" ? "radio" : "library")
      render()
    }),
    listen(station, "change", () => run(() => selectRadioStation(radioService, station.value))),
    listen(play, "click", () => {
      const music = musicService.read()
      const radio = radioService.read()
      actionError = null
      if (music.source === "radio") {
        if (radio.status === "playing" || radio.status === "loading" || radioStarting) {
          radioStarting = false
          run(() => pauseRadio(radioService))
        } else startRadio()
      } else if (music.status === "playing" || music.status === "loading") musicService.pause()
      else if (music.tracks.length === 0) files.click()
      else run(() => musicService.play())
    }),
    listen(previous, "click", () => {
      if (musicService.read().source === "radio") run(() => stepRadioStation(radioService, -1))
      else musicService.previous()
    }),
    listen(next, "click", () => {
      if (musicService.read().source === "radio") run(() => stepRadioStation(radioService, 1))
      else musicService.next()
    }),
    listen(seek, "input", () => musicService.seek(Number(seek.value))),
    listen(volume, "input", () => {
      if (musicService.read().source === "radio")
        run(() => radioService.dispatch({ kind: "set-volume", volume: Number(volume.value) }))
      else musicService.setVolume(Number(volume.value))
    }),
    listen(addMusic, "click", () => files.click()),
    listen(files, "change", () => {
      const selected = Array.from(files.files ?? [])
      files.value = ""
      if (selected.length === 0) return
      musicService.setSource("library")
      run(() => musicService.importFiles(selected))
    }),
    listen(retry, "click", () => {
      const radio = radioService.read()
      if (musicService.read().source === "library") run(() => musicService.play())
      else if (
        radio.stations.length === 0 ||
        radio.error === null ||
        radio.error.code.startsWith("directory-")
      )
        loadStations()
      else startRadio()
    }),
    musicService.subscribe(render),
    radioService.subscribe(render),
  ]
  render()
  return {
    element: root,
    dispose() {
      if (disposed) return
      disposed = true
      for (const cleanup of cleanups) cleanup()
    },
  }
}
