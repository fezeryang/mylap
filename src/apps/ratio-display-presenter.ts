import type { ScreenAppDefinition, ScreenAppHandle } from "../runtime/screen-app"
import type { RadioMediaService, RadioSnapshot } from "../services/radio-contracts"
import { RATIO_CASSETTE_DISPLAY_APP_ID, RATIO_TUNER_DISPLAY_APP_ID } from "./app-ids"

export type RatioDisplayAppOptions = {
  readonly radioService: RadioMediaService
}

export type RatioDisplaySnapshot = {
  readonly elapsedLabel: string
  readonly errorLabel: string | null
  readonly playbackLabel: string
  readonly samples: readonly number[]
  readonly stationName: string
  readonly volumeLabel: string
}

const formatElapsed = (seconds: number): string => {
  const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const wholeSeconds = Math.floor(elapsed)
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`
}

export const presentRatioDisplaySnapshot = (snapshot: RadioSnapshot): RatioDisplaySnapshot => {
  const errorLabel =
    snapshot.error === null
      ? null
      : `${snapshot.error.code.toUpperCase()} · ${snapshot.error.message}`
  return {
    elapsedLabel: formatElapsed(snapshot.liveElapsedSeconds),
    errorLabel,
    playbackLabel:
      errorLabel !== null
        ? "ERROR"
        : snapshot.powered
          ? snapshot.status.toUpperCase()
          : "POWER OFF",
    samples: snapshot.visualization.map((sample) =>
      Math.round(Math.min(1, Math.max(0, sample)) * 10),
    ),
    stationName: snapshot.selectedStation?.name ?? "No station selected",
    volumeLabel: `${Math.round(snapshot.volume * 100)}%`,
  }
}

const displayStyles = `
  .ratio-display { min-height: 100%; box-sizing: border-box; display: grid; align-content: center; gap: 8px; padding: 12px 16px; overflow: hidden; color: var(--pearl-0, #ddd9ee); background: radial-gradient(circle at 78% 18%, color-mix(in srgb, var(--violet-0, #7657ff) 34%, transparent), transparent 40%), linear-gradient(112deg, var(--glass-0, #07102b), #02040e); font: 12px/1.35 "IBM Plex Mono", monospace; letter-spacing: .04em; }
  .ratio-display-heading { margin: 0; color: var(--cyan-0, #34d9ff); font-size: 12px; letter-spacing: .15em; }
  .ratio-display-station { min-width: 0; overflow: hidden; color: var(--pearl-1, #f4f2ff); font-size: clamp(14px, 2.5vw, 22px); font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .ratio-display-readout { display: flex; min-width: 0; align-items: baseline; gap: 8px; color: var(--lavender-0, #9799de); }
  .ratio-display-state { color: var(--magenta-0, #ff55ca); font-weight: 700; }
  .ratio-display-error { min-width: 0; overflow: hidden; color: var(--warning-0, #ffc76d); text-overflow: ellipsis; white-space: nowrap; }
  .ratio-display-samples { min-width: 0; overflow: hidden; color: var(--cyan-0, #34d9ff); font-size: 10px; letter-spacing: .12em; text-overflow: ellipsis; white-space: nowrap; }
  .ratio-cassette-display { text-align: center; background: radial-gradient(ellipse at center, color-mix(in srgb, var(--violet-0, #7657ff) 35%, var(--glass-0, #07102b)), var(--studio-0, #03040a) 74%); }
  .ratio-cassette-reels { display: flex; justify-content: center; gap: 18px; }
  .ratio-cassette-reel { width: 18px; aspect-ratio: 1; border: 2px dotted var(--violet-0, #7657ff); border-radius: 50%; opacity: .86; }
  .ratio-cassette-display[data-radio-state="playing"] .ratio-cassette-reel { animation: ratio-cassette-spin 1.4s linear infinite; }
  .ratio-cassette-display[data-radio-state="playing"] .ratio-cassette-reel:last-child { animation-direction: reverse; }
  @keyframes ratio-cassette-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .ratio-cassette-display[data-radio-state="playing"] .ratio-cassette-reel { animation: none; } }
`

type RatioDisplayKind = "cassette" | "tuner"

const sampleText = (samples: readonly number[]): string =>
  samples.length === 0 ? "SAMPLES · —" : `SAMPLES · ${samples.join(" ")}`

const createDisplay = (
  appId: ScreenAppDefinition["appId"],
  kind: RatioDisplayKind,
  radioService: RadioMediaService,
): ScreenAppDefinition => ({
  appId,
  mount: (host, context): ScreenAppHandle => {
    let disposed = false
    const root = document.createElement("section")
    const style = document.createElement("style")
    const heading = document.createElement("h2")
    const station = document.createElement("strong")
    const readout = document.createElement("p")
    const state = document.createElement("output")
    const volume = document.createElement("span")
    const elapsed = document.createElement("span")
    const error = document.createElement("p")
    const samples = document.createElement("p")
    const reels = document.createElement("div")
    const leftReel = document.createElement("span")
    const rightReel = document.createElement("span")
    const render = (snapshot: RadioSnapshot): void => {
      if (disposed) return
      const view = presentRatioDisplaySnapshot(snapshot)
      root.dataset["radioState"] = snapshot.status
      root.dataset["powered"] = String(snapshot.powered)
      station.textContent = view.stationName
      state.textContent = view.playbackLabel
      volume.textContent = `VOL ${view.volumeLabel}`
      elapsed.textContent = `ELAPSED ${view.elapsedLabel}`
      error.hidden = view.errorLabel === null
      error.textContent = view.errorLabel ?? ""
      samples.textContent = sampleText(view.samples)
    }

    style.textContent = displayStyles
    root.className = `screen-app ratio-display ratio-${kind}-display`
    root.dataset["testid"] = `ratio-${kind}-display-app`
    root.dataset["assetInstance"] = context.assetInstanceId.value
    root.setAttribute("aria-label", `RATIO ${kind} read-only display`)
    heading.className = "ratio-display-heading"
    heading.textContent = kind === "tuner" ? "RATIO // TUNER" : "RATIO // CASSETTE"
    station.className = "ratio-display-station"
    readout.className = "ratio-display-readout"
    state.className = "ratio-display-state"
    state.setAttribute("aria-live", "polite")
    volume.className = "ratio-display-volume"
    elapsed.className = "ratio-display-elapsed"
    readout.append(state, volume)
    if (kind === "cassette") readout.append(elapsed)
    error.className = "ratio-display-error"
    samples.className = "ratio-display-samples"
    if (kind === "cassette") {
      reels.className = "ratio-cassette-reels"
      reels.setAttribute("aria-hidden", "true")
      leftReel.className = "ratio-cassette-reel"
      rightReel.className = "ratio-cassette-reel"
      reels.append(leftReel, rightReel)
      root.append(style, heading, reels, station, readout, error, samples)
    } else {
      root.append(style, heading, station, readout, error, samples)
    }
    host.append(root)
    render(radioService.read())
    const unsubscribe = radioService.subscribe(render)
    return {
      dispose: () => {
        if (disposed) return
        disposed = true
        unsubscribe()
      },
      setActive: (active) => {
        root.dataset["active"] = String(active)
      },
      update: (snapshot) => {
        root.dataset["selectedPart"] = snapshot.selectedPart
      },
    }
  },
})

export const createRatioTunerDisplayApp = (options: RatioDisplayAppOptions): ScreenAppDefinition =>
  createDisplay(RATIO_TUNER_DISPLAY_APP_ID, "tuner", options.radioService)

export const createRatioCassetteDisplayApp = (
  options: RatioDisplayAppOptions,
): ScreenAppDefinition =>
  createDisplay(RATIO_CASSETTE_DISPLAY_APP_ID, "cassette", options.radioService)
