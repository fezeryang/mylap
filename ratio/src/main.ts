import "./style.css"
import { Mesh, MeshBasicMaterial } from "three"
import { createRadioModel } from "./model/createRadioModel"
import { PART_IDS, type PartId } from "./model/parts"
import { createDemoAudioPlayer } from "./ui/audioPlayer"
import { initialRadioState, RADIO_BANDS, type RadioState, reduceRadioState } from "./ui/mediaState"
import { type CameraView, createViewer } from "./viewer/createViewer"

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (element === null) throw new TypeError(`Missing required radio element: #${id}`)
  return element as T
}

const model = createRadioModel()
const search = new URLSearchParams(location.search)
const reviewMode = search.get("review") === "1"
if (reviewMode) {
  document.documentElement.classList.add("review-mode")
  document.body.classList.add("review-mode")
}
if (search.get("flat") === "1") {
  const blockoutMaterial = new MeshBasicMaterial({ color: 0xb7b5c9 })
  model.root.traverse((object) => {
    if (object instanceof Mesh) object.material = blockoutMaterial
  })
}
const player = createDemoAudioPlayer()
let state = initialRadioState()
let selectedPart: PartId | null = null
const tuner = byId<HTMLInputElement>("frequency")
const status = byId<HTMLElement>("status")
const selected = byId<HTMLElement>("selected-part")
const spectrum = byId<HTMLElement>("spectrum")
for (let index = 0; index < 24; index += 1) spectrum.append(document.createElement("i"))

const viewer = createViewer({
  host: byId("stage"),
  tunerScreen: byId("tuner-screen"),
  cassetteScreen: byId("cassette-screen"),
  model,
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  reviewMode,
  onPartSelected(partId) {
    selectedPart = PART_IDS.includes(partId as PartId) ? (partId as PartId) : null
    selected.textContent = selectedPart ?? "none"
    status.textContent = selectedPart === null ? "Selection cleared" : `Selected ${selectedPart}`
  },
  animationState: () => state.media,
})

function render(next: RadioState): void {
  state = next
  document.body.dataset["power"] = state.power
  byId("frequency-value").textContent =
    `${state.frequency.toFixed(state.band === "FM" ? 1 : 0)} ${state.band === "FM" ? "MHz" : "kHz"}`
  byId("track-title").textContent = state.media.track.title
  byId("track-artist").textContent = state.media.track.artist
  byId("time").textContent = formatTime(state.media.currentTimeSeconds)
  byId("playback-state").textContent = state.media.playback.toUpperCase()
  byId<HTMLButtonElement>("play").setAttribute(
    "aria-pressed",
    String(state.media.playback === "playing"),
  )
  for (const [index, bar] of Array.from(spectrum.children).entries()) {
    const value = state.media.spectrum[index] ?? 0.08
    ;(bar as HTMLElement).style.setProperty("--level", String(value))
  }
  const [minimum, maximum] =
    state.band === "FM" ? [87.5, 108] : state.band === "AM" ? [530, 1710] : [5.9, 17.9]
  tuner.min = String(minimum)
  tuner.max = String(maximum)
  tuner.step = state.band === "AM" ? "10" : "0.1"
  tuner.value = String(state.frequency)
  model.setTuning((state.frequency - minimum) / (maximum - minimum))
  document.querySelectorAll<HTMLButtonElement>("[data-band]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset["band"] === state.band))
  })
}

player.subscribe((snapshot) =>
  render(reduceRadioState(state, { kind: "media-snapshot", snapshot })),
)
byId("power").addEventListener("click", () => {
  render(reduceRadioState(state, { kind: "toggle-power" }))
  if (state.power === "off") player.stop()
})
byId("play").addEventListener("click", () =>
  state.media.playback === "playing" ? player.pause() : player.play(),
)
byId("stop").addEventListener("click", player.stop)
byId("rew").addEventListener("click", () => player.seekBy(-10))
byId("ff").addEventListener("click", () => player.seekBy(10))
byId<HTMLInputElement>("volume").addEventListener("input", (event) => {
  const value = Number((event.currentTarget as HTMLInputElement).value)
  player.setVolume(value)
  model.setSlider("volume-slider", value)
})
tuner.addEventListener("input", () =>
  render(reduceRadioState(state, { kind: "tune", frequency: Number(tuner.value) })),
)
document.querySelectorAll<HTMLButtonElement>("[data-band]").forEach((button) => {
  button.addEventListener("click", () => {
    const band = RADIO_BANDS.find((candidate) => candidate === button.dataset["band"])
    if (band !== undefined) render(reduceRadioState(state, { kind: "set-band", band }))
  })
})
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
  button.addEventListener("click", () => viewer.setView(button.dataset["view"] as CameraView))
})
byId<HTMLInputElement>("explode").addEventListener("input", (event) =>
  viewer.setExplosion(Number((event.currentTarget as HTMLInputElement).value)),
)
byId("reset").addEventListener("click", () => {
  viewer.reset()
  selectedPart = null
  selected.textContent = "none"
  status.textContent = "View reset"
})

let previous = performance.now()
function tick(now: number): void {
  const delta = Math.min((now - previous) / 1000, 0.05)
  previous = now
  player.update(delta)
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
render(state)

Object.assign(window, {
  __ready: true,
  __interactive: true,
  __radio: { model, viewer, player, getState: () => state, getSelectedPart: () => selectedPart },
})

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`
}
