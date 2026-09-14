import type { RadioCommand, RadioMediaService, RadioSnapshot } from "../services/radio-contracts"
import {
  pauseRadio,
  playRadio,
  selectRadioStation,
  setRadioPower,
  stepRadioStation,
  stopRadio,
} from "../services/radio-physical-controls"
import type {
  WorkspaceMusicService,
  WorkspaceMusicSnapshot,
  WorkspaceMusicTrack,
} from "../services/workspace-music-service"
import { element, listen, svgElement } from "./dom"

type MusicIcon =
  | "note"
  | "plus"
  | "play"
  | "pause"
  | "previous"
  | "next"
  | "volume"
  | "trash"
  | "radio"

const ICON_PATHS: Readonly<Record<MusicIcon, string>> = {
  note: "M9 18V5l12-2v13M9 8l12-2M9 18c0 1.7-1.8 3-4 3s-3-1.3-3-2.5S3.8 16 6 16c1.2 0 2.2.4 3 1M21 16c0 1.7-1.8 3-4 3s-3-1.3-3-2.5S15.8 14 18 14c1.2 0 2.2.4 3 1",
  plus: "M12 5v14M5 12h14",
  play: "m8 5 11 7-11 7Z",
  pause: "M8 5v14M16 5v14",
  previous: "M5 5v14m14-14L8 12l11 7Z",
  next: "M19 5v14M5 5l11 7-11 7Z",
  volume: "M11 5 6 9H3v6h3l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  radio:
    "M8 8a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14M12 11v9m-1-9a1 1 0 1 0 2 0 1 1 0 1 0-2 0",
}

const icon = (name: MusicIcon): SVGSVGElement => {
  const svg = svgElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": name === "pause" ? "3.5" : "1.8",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  })
  svg.append(svgElement("path", { d: ICON_PATHS[name] }))
  return svg
}

const button = (
  label: string,
  iconName?: MusicIcon,
  className = "music-button",
): HTMLButtonElement => {
  const control = element("button", className)
  control.type = "button"
  if (iconName !== undefined) control.append(icon(iconName))
  control.append(element("span", "music-button-label", label))
  return control
}

const iconButton = (label: string, name: MusicIcon, className: string): HTMLButtonElement => {
  const control = element("button", className)
  control.type = "button"
  control.setAttribute("aria-label", label)
  control.title = label
  control.append(icon(name))
  return control
}

const formatTime = (seconds: number): string => {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

const formatSize = (size: number): string =>
  size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`

const artwork = (className: string, kind: "library" | "radio" = "library"): HTMLElement => {
  const art = element("div", `music-artwork ${className}`)
  art.dataset["kind"] = kind
  art.setAttribute("aria-hidden", "true")
  art.append(element("span", "music-artwork-disc"), icon(kind === "radio" ? "radio" : "note"))
  return art
}

export const createMusicApp = (options: {
  readonly musicService: WorkspaceMusicService
  readonly radioService: RadioMediaService
}): { readonly element: HTMLElement; dispose(): void } => {
  const { musicService, radioService } = options
  const root = element("section", "music-app")
  root.setAttribute("aria-label", "Music")
  root.dataset["testid"] = "music-app"
  const header = element("header", "music-header")
  const brand = element("div", "music-brand")
  brand.append(icon("note"), element("span", "music-brand-name", "Music"))
  const tabs = element("nav", "music-tabs")
  tabs.setAttribute("aria-label", "Music sections")
  const libraryTab = button("Library", undefined, "music-tab")
  const radioTab = button("Radio", undefined, "music-tab")
  libraryTab.dataset["testid"] = "music-library-tab"
  radioTab.dataset["testid"] = "music-radio-tab"
  tabs.append(libraryTab, radioTab)
  const importButton = button("Add music", "plus", "music-button music-import-button")
  const fileInput = element("input", "music-file-input")
  fileInput.type = "file"
  fileInput.accept = "audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.aiff,.webm"
  fileInput.multiple = true
  fileInput.hidden = true
  fileInput.dataset["testid"] = "music-import-files"
  fileInput.setAttribute("aria-label", "Import audio files")
  header.append(brand, tabs, importButton, fileInput)

  const content = element("div", "music-content")
  const library = element("section", "music-library")
  library.setAttribute("aria-label", "Music library")
  const hero = element("div", "music-hero")
  const heroCopy = element("div", "music-hero-copy")
  const eyebrow = element("p", "music-eyebrow", "MADE PERSONAL")
  const heroTitle = element("h2", "music-hero-title", "Your music.\nWithin reach.")
  const heroDescription = element(
    "p",
    "music-description",
    "A place for the songs you keep coming back to.",
  )
  const heroImport = button("Add your first songs", "plus", "music-button music-primary")
  heroCopy.append(eyebrow, heroTitle, heroDescription, heroImport)
  hero.append(artwork("music-hero-art"), heroCopy)
  const listHeading = element("div", "music-list-heading")
  const songsHeading = element("h3", "music-section-title", "Songs")
  const songCount = element("span", "music-count", "0 songs")
  listHeading.append(songsHeading, songCount)
  const trackList = element("ul", "music-track-list")
  trackList.setAttribute("aria-label", "Imported songs")
  const empty = element("div", "music-empty")
  empty.append(
    icon("note"),
    element("h3", "music-empty-title", "The beginning of a good collection"),
    element(
      "p",
      "music-description",
      "Add audio files from your device. Your library is shared across the phone and computer.",
    ),
    element("p", "music-file-types", "MP3 · M4A · WAV · FLAC · OGG"),
  )
  const storageStatus = element("p", "music-storage-status", "Opening your library…")
  storageStatus.setAttribute("role", "status")
  library.append(hero, listHeading, trackList, empty, storageStatus)

  const radio = element("section", "music-radio")
  radio.setAttribute("aria-label", "Oh-hO radio controls")
  radio.dataset["testid"] = "oho-controls"
  const radioHero = element("div", "music-hero music-radio-hero")
  const radioCopy = element("div", "music-hero-copy")
  const radioName = element("h2", "music-hero-title", "A world of sound.")
  const radioDescription = element(
    "p",
    "music-description",
    "Explore live stations. Find your frequency.",
  )
  const radioPower = button("Power on", "radio", "music-button music-primary")
  radioPower.dataset["testid"] = "oho-power"
  radioCopy.append(
    element("p", "music-eyebrow", "OH-hO · LIVE RADIO"),
    radioName,
    radioDescription,
    radioPower,
  )
  radioHero.append(artwork("music-hero-art", "radio"), radioCopy)
  const directoryHeader = element("div", "music-list-heading")
  const refresh = button("Refresh stations", undefined, "music-text-button")
  directoryHeader.append(element("h3", "music-section-title", "Find a station"), refresh)
  const radioFields = element("div", "music-radio-fields")
  const searchLabel = element("label", "music-field", "Search stations")
  const search = element("input", "music-search")
  search.type = "search"
  search.placeholder = "Search by station name"
  search.setAttribute("aria-label", "Search radio stations")
  searchLabel.append(search)
  const stationLabel = element("label", "music-field", "Station")
  const stationSelect = element("select", "music-station-select")
  stationSelect.setAttribute("aria-label", "Select radio station")
  stationSelect.dataset["testid"] = "oho-station"
  stationLabel.append(stationSelect)
  radioFields.append(searchLabel, stationLabel)
  const stationCount = element("p", "music-station-count")
  const radioState = element("p", "music-radio-state")
  radioState.setAttribute("role", "status")
  const radioActions = element("div", "music-radio-actions")
  const radioPlay = button("Play", "play")
  const radioPause = button("Pause", "pause")
  const radioStop = button("Stop")
  radioActions.append(radioPlay, radioPause, radioStop)
  radio.append(radioHero, directoryHeader, radioFields, stationCount, radioState, radioActions)
  const notice = element("p", "music-notice")
  notice.setAttribute("role", "status")
  notice.hidden = true
  content.append(library, radio, notice)

  const player = element("footer", "music-player")
  player.setAttribute("aria-label", "Playback controls")
  const nowPlaying = element("div", "music-now-playing")
  const playerArt = artwork("music-player-art")
  const playerCopy = element("div", "music-player-copy")
  const playerTitle = element("strong", "music-player-title", "Not playing")
  const playerSubtitle = element("span", "music-player-subtitle", "Choose a song to begin")
  playerCopy.append(playerTitle, playerSubtitle)
  nowPlaying.append(playerArt, playerCopy)
  const transport = element("div", "music-transport")
  const transportButtons = element("div", "music-transport-buttons")
  const previous = iconButton("Previous song", "previous", "music-icon-button")
  const togglePlay = iconButton("Play", "play", "music-icon-button music-play-toggle")
  togglePlay.dataset["testid"] = "music-play"
  const next = iconButton("Next song", "next", "music-icon-button")
  transportButtons.append(previous, togglePlay, next)
  const timeline = element("div", "music-timeline")
  const elapsed = element("span", "music-time", "0:00")
  const seek = element("input", "music-seek")
  seek.type = "range"
  seek.min = "0"
  seek.max = "0"
  seek.step = "0.1"
  seek.value = "0"
  seek.setAttribute("aria-label", "Seek in song")
  const duration = element("span", "music-time", "0:00")
  timeline.append(elapsed, seek, duration)
  transport.append(transportButtons, timeline)
  const volumeLabel = element("label", "music-volume")
  volumeLabel.append(icon("volume"))
  const volume = element("input", "music-volume-input")
  volume.type = "range"
  volume.min = "0"
  volume.max = "1"
  volume.step = "0.01"
  volume.setAttribute("aria-label", "Music volume")
  volumeLabel.append(volume)
  player.append(nowPlaying, transport, volumeLabel)
  root.append(header, content, player)

  let activeTab: "library" | "radio" = "library"
  let musicSnapshot = musicService.read()
  let radioSnapshot = radioService.read()
  let displayedTracks: readonly WorkspaceMusicTrack[] | null = null
  let displayedStations = ""
  let directoryLoading = false
  let disposed = false
  const trackRows = new Map<
    string,
    { readonly row: HTMLLIElement; readonly play: HTMLButtonElement }
  >()

  const reportFailure = (error: unknown): void => {
    if (disposed || (error instanceof DOMException && error.name === "AbortError")) return
    notice.textContent =
      error instanceof Error ? error.message : "This action could not be completed. Try again."
    notice.hidden = false
  }
  const sendRadio = (command: RadioCommand): void => {
    notice.hidden = true
    void radioService.dispatch(command).catch(reportFailure)
  }
  const renderPlayer = (): void => {
    const isRadio = activeTab === "radio"
    const track = musicSnapshot.tracks.find((item) => item.id === musicSnapshot.activeTrackId)
    const playing = isRadio
      ? radioSnapshot.status === "playing"
      : musicSnapshot.status === "playing"
    const loading = isRadio
      ? radioSnapshot.status === "loading"
      : musicSnapshot.status === "loading"
    playerArt.dataset["kind"] = isRadio ? "radio" : "library"
    playerTitle.textContent = isRadio
      ? (radioSnapshot.selectedStation?.name ?? "Radio")
      : (track?.title ?? "Not playing")
    playerSubtitle.textContent = isRadio
      ? radioSnapshot.powered
        ? `Live radio · ${radioSnapshot.status}`
        : "Radio is off"
      : track === undefined
        ? "Choose a song to begin"
        : `${loading ? "Loading" : playing ? "Playing" : "Your library"} · ${track.fileName.split(".").at(-1)?.toUpperCase() ?? "AUDIO"}`
    const action = playing || loading ? "Pause" : "Play"
    if (togglePlay.getAttribute("aria-label") !== action) {
      togglePlay.setAttribute("aria-label", action)
      togglePlay.title = action
      togglePlay.replaceChildren(icon(playing || loading ? "pause" : "play"))
    }
    togglePlay.setAttribute("aria-pressed", String(playing || loading))
    togglePlay.disabled = false
    previous.disabled = isRadio
      ? radioSnapshot.stations.length < 2
      : musicSnapshot.tracks.length === 0
    next.disabled = previous.disabled
    seek.disabled = isRadio || musicSnapshot.duration <= 0
    seek.max = String(musicSnapshot.duration)
    if (document.activeElement !== seek) seek.value = String(musicSnapshot.currentTime)
    seek.setAttribute(
      "aria-valuetext",
      `${formatTime(musicSnapshot.currentTime)} of ${formatTime(musicSnapshot.duration)}`,
    )
    elapsed.textContent = formatTime(
      isRadio ? radioSnapshot.liveElapsedSeconds : musicSnapshot.currentTime,
    )
    duration.textContent = isRadio ? "LIVE" : formatTime(musicSnapshot.duration)
    volume.value = String(isRadio ? radioSnapshot.volume : musicSnapshot.volume)
    volume.setAttribute("aria-label", isRadio ? "Radio volume" : "Music volume")
    volume.setAttribute("aria-valuetext", `${Math.round(Number(volume.value) * 100)} percent`)
    if (isRadio) volume.dataset["testid"] = "oho-volume"
    else delete volume.dataset["testid"]
  }
  const renderMusic = (snapshot: WorkspaceMusicSnapshot): void => {
    musicSnapshot = snapshot
    if (activeTab !== snapshot.source) showTab(snapshot.source)
    const count = snapshot.tracks.length
    songCount.textContent = `${count} ${count === 1 ? "song" : "songs"}`
    empty.hidden = count > 0
    heroImport.hidden = count > 0
    heroDescription.textContent =
      count > 0
        ? "Your collection, ready wherever you settle in."
        : "A place for the songs you keep coming back to."
    importButton.disabled = snapshot.importing
    heroImport.disabled = snapshot.importing
    importButton.setAttribute("aria-busy", String(snapshot.importing))
    if (displayedTracks !== snapshot.tracks) {
      displayedTracks = snapshot.tracks
      trackRows.clear()
      const rows = snapshot.tracks.map((track, index) => {
        const row = element("li", "music-track")
        const playTrack = element("button", "music-track-play")
        playTrack.type = "button"
        playTrack.dataset["musicTrack"] = track.id
        playTrack.setAttribute("aria-label", `Play ${track.title}`)
        const number = element("span", "music-track-number", String(index + 1).padStart(2, "0"))
        number.setAttribute("aria-hidden", "true")
        const text = element("span", "music-track-copy")
        text.append(
          element("strong", "music-track-title", track.title),
          element("span", "music-track-detail", track.fileName),
        )
        playTrack.append(
          number,
          artwork("music-track-art"),
          text,
          element("span", "music-track-size", formatSize(track.size)),
        )
        const remove = iconButton(
          `Remove ${track.title} from library`,
          "trash",
          "music-icon-button music-track-remove",
        )
        remove.dataset["musicRemove"] = track.id
        row.append(playTrack, remove)
        trackRows.set(track.id, { row, play: playTrack })
        return row
      })
      trackList.replaceChildren(...rows)
    }
    for (const [id, nodes] of trackRows) {
      const selected = snapshot.activeTrackId === id
      nodes.row.dataset["active"] = String(selected)
      nodes.play.setAttribute("aria-pressed", String(selected && snapshot.status === "playing"))
    }
    storageStatus.textContent =
      snapshot.storageError ??
      (snapshot.storageStatus === "loading"
        ? "Opening your library…"
        : "Saved in this browser. Available on your phone and computer in this workspace.")
    storageStatus.dataset["warning"] = String(snapshot.storageError !== null)
    if (activeTab === "library") {
      notice.textContent = snapshot.error ?? ""
      notice.hidden = snapshot.error === null
    }
    renderPlayer()
  }
  const renderRadio = (snapshot: RadioSnapshot): void => {
    radioSnapshot = snapshot
    const filter = search.value.trim().toLocaleLowerCase()
    const stations = snapshot.stations.filter((station) =>
      station.name.toLocaleLowerCase().includes(filter),
    )
    const stationKey = JSON.stringify(
      stations.map((station) => [station.stationUuid, station.name]),
    )
    if (displayedStations !== stationKey) {
      displayedStations = stationKey
      const items = stations.map((station) => {
        const option = document.createElement("option")
        option.value = station.stationUuid
        option.textContent = station.name
        return option
      })
      if (items.length === 0) {
        const emptyOption = document.createElement("option")
        emptyOption.value = ""
        emptyOption.textContent = filter ? "No matching stations" : "No stations available"
        items.push(emptyOption)
      }
      stationSelect.replaceChildren(...items)
    }
    stationSelect.value = snapshot.selectedStation?.stationUuid ?? ""
    stationSelect.disabled = stations.length === 0
    stationCount.textContent = directoryLoading
      ? "Finding live stations…"
      : `${stations.length} ${stations.length === 1 ? "station" : "stations"}${filter ? " matching your search" : " available"}`
    radioPower.setAttribute("aria-pressed", String(snapshot.powered))
    const powerText = radioPower.querySelector(".music-button-label")
    if (powerText !== null) powerText.textContent = snapshot.powered ? "Power off" : "Power on"
    radioName.textContent = snapshot.selectedStation?.name ?? "A world of sound."
    radioDescription.textContent =
      snapshot.selectedStation === null
        ? "Explore live stations. Find your frequency."
        : `${snapshot.selectedStation.codec || "Audio"}${snapshot.selectedStation.bitrate > 0 ? ` · ${snapshot.selectedStation.bitrate} kbps` : ""} · Live stream`
    radioState.textContent =
      snapshot.error !== null
        ? `${snapshot.error.code}: ${snapshot.error.message}`
        : !snapshot.powered
          ? "Turn the radio on, choose a station, and press Play."
          : snapshot.status === "playing"
            ? `Playing · ${snapshot.selectedStation?.name ?? "Radio"}`
            : snapshot.status === "loading"
              ? "Connecting to the station…"
              : snapshot.status === "paused"
                ? "Playback paused"
                : "Ready to listen"
    radioState.dataset["error"] = String(snapshot.error !== null)
    radioPlay.disabled = snapshot.status === "playing" || snapshot.status === "loading"
    radioPause.disabled = snapshot.status !== "playing" && snapshot.status !== "loading"
    radioStop.disabled = !snapshot.powered
    refresh.disabled = directoryLoading
    renderPlayer()
  }
  const loadStations = (force: boolean): void => {
    if (directoryLoading || disposed) return
    directoryLoading = true
    renderRadio(radioService.read())
    void radioService
      .loadStations({ force })
      .catch(reportFailure)
      .finally(() => {
        if (disposed) return
        directoryLoading = false
        renderRadio(radioService.read())
      })
  }
  const showTab = (tab: "library" | "radio"): void => {
    activeTab = tab
    musicService.setSource(tab)
    root.dataset["view"] = tab
    library.hidden = tab !== "library"
    radio.hidden = tab !== "radio"
    libraryTab.setAttribute("aria-pressed", String(tab === "library"))
    radioTab.setAttribute("aria-pressed", String(tab === "radio"))
    notice.textContent = tab === "library" ? (musicSnapshot.error ?? "") : ""
    notice.hidden = tab !== "library" || musicSnapshot.error === null
    renderPlayer()
    if (tab === "radio" && radioSnapshot.stations.length === 0) loadStations(false)
  }

  const cleanups = [
    listen(libraryTab, "click", () => showTab("library")),
    listen(radioTab, "click", () => showTab("radio")),
    listen(importButton, "click", () => fileInput.click()),
    listen(heroImport, "click", () => fileInput.click()),
    listen(fileInput, "change", () => {
      const files = Array.from(fileInput.files ?? [])
      fileInput.value = ""
      if (files.length > 0) {
        showTab("library")
        void musicService.importFiles(files).catch(reportFailure)
      }
    }),
    listen(trackList, "click", (event) => {
      if (!(event.target instanceof Element)) return
      const remove = event.target.closest<HTMLButtonElement>("[data-music-remove]")
      const playTrack = event.target.closest<HTMLButtonElement>("[data-music-track]")
      const removedId = remove?.dataset["musicRemove"]
      const playedId = playTrack?.dataset["musicTrack"]
      if (removedId !== undefined) musicService.remove(removedId)
      else if (playedId !== undefined) void musicService.play(playedId)
    }),
    listen(previous, "click", () => {
      if (activeTab === "radio") void stepRadioStation(radioService, -1).catch(reportFailure)
      else musicService.previous()
    }),
    listen(next, "click", () => {
      if (activeTab === "radio") void stepRadioStation(radioService, 1).catch(reportFailure)
      else musicService.next()
    }),
    listen(togglePlay, "click", () => {
      if (activeTab === "radio") {
        if (radioSnapshot.status === "playing" || radioSnapshot.status === "loading")
          void pauseRadio(radioService).catch(reportFailure)
        else {
          void playRadio(radioService).catch(reportFailure)
        }
      } else if (musicSnapshot.status === "playing" || musicSnapshot.status === "loading")
        musicService.pause()
      else if (musicSnapshot.tracks.length === 0) fileInput.click()
      else void musicService.play()
    }),
    listen(seek, "input", () => musicService.seek(Number(seek.value))),
    listen(volume, "input", () => {
      if (activeTab === "radio") sendRadio({ kind: "set-volume", volume: Number(volume.value) })
      else musicService.setVolume(Number(volume.value))
    }),
    listen(
      radioPower,
      "click",
      () => void setRadioPower(radioService, !radioSnapshot.powered).catch(reportFailure),
    ),
    listen(radioPlay, "click", () => {
      musicService.setSource("radio")
      void playRadio(radioService).catch(reportFailure)
    }),
    listen(radioPause, "click", () => void pauseRadio(radioService).catch(reportFailure)),
    listen(radioStop, "click", () => void stopRadio(radioService).catch(reportFailure)),
    listen(refresh, "click", () => loadStations(true)),
    listen(
      stationSelect,
      "change",
      () => void selectRadioStation(radioService, stationSelect.value).catch(reportFailure),
    ),
    listen(search, "input", () => renderRadio(radioService.read())),
    musicService.subscribe(renderMusic),
    radioService.subscribe(renderRadio),
  ]
  showTab(musicService.read().source)

  return {
    element: root,
    dispose() {
      if (disposed) return
      disposed = true
      for (const cleanup of cleanups) cleanup()
    },
  }
}
