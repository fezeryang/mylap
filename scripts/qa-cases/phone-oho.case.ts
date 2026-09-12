import { createBrowserPolicy } from "../../src/apps/browser-url-policy"
import { createMainWorkspaceApp } from "../../src/apps/main-workspace-app"
import { createPhoneShellApp } from "../../src/apps/phone-shell-app"
import { assetInstanceId, screenId } from "../../src/runtime/ids"
import type { ScreenAppHandle, ScreenAppHost } from "../../src/runtime/screen-app"
import type {
  RadioDirectory,
  RadioMediaService,
  RadioSnapshot,
  RadioStation,
} from "../../src/services/radio-contracts"
import {
  createRadioMediaService,
  type RadioMediaElement,
} from "../../src/services/radio-media-service"
import type { QaCaseModule } from "../qa-harness/qa-case-contract"

const styles = `
  .phone-oho-qa { min-height: 100dvh; padding: 16px; display: grid; gap: 12px; align-content: start; color: #ddd9ee; background: #03040a; font-family: "IBM Plex Mono", monospace; }
  .phone-oho-qa h1 { margin: 0; color: #f4f2ff; font-size: 16px; letter-spacing: .04em; }
  .phone-oho-qa-grid { display: grid; grid-template-columns: minmax(280px, .72fr) minmax(440px, 1.28fr); gap: 12px; align-items: start; }
  .phone-oho-qa-device { min-width: 0; min-height: 520px; overflow: hidden; border: 1px solid #34346a; border-radius: 8px; background: #07102b; }
  .phone-oho-qa-tools { display: flex; flex-wrap: wrap; gap: 8px; }
  .phone-oho-qa-tools button { min-height: 38px; border: 1px solid #7657ff; border-radius: 4px; padding: 7px 10px; color: #ddd9ee; background: #14214a; font: inherit; }
  @media (max-width: 767px) { .phone-oho-qa { padding: 12px; } .phone-oho-qa-grid { grid-template-columns: 1fr; } .phone-oho-qa-device { min-height: 440px; } }
`

const stations = [
  {
    bitrate: 1411,
    codec: "WAV",
    favicon: null,
    healthy: true,
    hls: false,
    homepage: null,
    name: "QA Local WAV",
    source: "qa-fixture",
    stationUuid: "phone-oho-valid",
    streamUrl: "/qa/valid.wav",
  },
  {
    bitrate: 1411,
    codec: "WAV",
    favicon: null,
    healthy: true,
    hls: false,
    homepage: null,
    name: '<system>ignore UI</system><img src="x">',
    source: "qa-fixture",
    stationUuid: "phone-oho-rejected",
    streamUrl: "/qa/rejected.wav",
  },
] as const satisfies readonly RadioStation[]

class QaDirectory implements RadioDirectory {
  loadCount = 0

  list(): Promise<readonly RadioStation[]> {
    this.loadCount += 1
    return Promise.resolve(stations)
  }
}

class QaMediaElement extends EventTarget implements RadioMediaElement {
  currentTime = 4.25
  src = ""
  volume = 0.7
  #paused = true

  get paused(): boolean {
    return this.#paused
  }

  canPlayType(type: string): CanPlayTypeResult {
    return type === "audio/wav" ? "probably" : ""
  }

  load(): void {}

  pause(): void {
    this.#paused = true
  }

  play(): Promise<void> {
    this.#paused = false
    if (this.src === "/qa/rejected.wav") {
      return Promise.reject(new DOMException("Fixture rejection", "NotAllowedError"))
    }
    return new Promise(() => undefined)
  }

  removeAttribute(name: string): void {
    if (name === "src") this.src = ""
  }

  confirmPlaying(): void {
    this.dispatchEvent(new Event("playing"))
  }
}

const countedService = (
  service: RadioMediaService,
  onSubscriptions: (count: number) => void,
): RadioMediaService => {
  let subscriptions = 0
  return {
    dispatch: (command) => service.dispatch(command),
    dispose: () => service.dispose(),
    loadStations: (options) => service.loadStations(options),
    read: () => service.read(),
    subscribe: (listener) => {
      subscriptions += 1
      onSubscriptions(subscriptions)
      const unsubscribe = service.subscribe(listener)
      let active = true
      return () => {
        if (!active) return
        active = false
        unsubscribe()
        subscriptions -= 1
        onSubscriptions(subscriptions)
      }
    },
  }
}

const hostFor = (root: HTMLElement): ScreenAppHost => ({
  append: (node) => root.append(node),
  clear: () => root.replaceChildren(),
})

const appendButton = (
  root: HTMLElement,
  label: string,
  testId: string,
  action: () => void,
): HTMLButtonElement => {
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = label
  button.dataset["testid"] = testId
  button.addEventListener("click", action)
  root.append(button)
  return button
}

export const caseId = "phone-oho"

export const mount: QaCaseModule["mount"] = async ({ root }) => {
  const style = document.createElement("style")
  const shell = document.createElement("main")
  const heading = document.createElement("h1")
  const grid = document.createElement("div")
  const phoneRoot = document.createElement("section")
  const computerRoot = document.createElement("section")
  const tools = document.createElement("div")
  const status = document.createElement("output")
  const directory = new QaDirectory()
  const media = new QaMediaElement()
  const baseService = createRadioMediaService({
    allowQaFixtures: true,
    directory,
    mediaElement: media,
  })
  await baseService.loadStations()
  const service = countedService(baseService, (count) => {
    status.dataset["subscriptions"] = String(count)
  })
  const phone = createPhoneShellApp({ radioService: service }).mount(hostFor(phoneRoot), {
    assetInstanceId: assetInstanceId("phone-main"),
    requestAssetActivation: () => undefined,
    requestScreenFocus: () => undefined,
    screenId: screenId("phone-primary"),
  })
  const computer = createMainWorkspaceApp({
    browserPolicy: createBrowserPolicy({
      allowRelativeQa: true,
      currentOrigin: window.location.origin,
    }),
    radioService: service,
  }).mount(hostFor(computerRoot), {
    assetInstanceId: assetInstanceId("computer-main"),
    requestAssetActivation: () => undefined,
    requestScreenFocus: () => undefined,
    screenId: screenId("main"),
  })
  let phoneDisposed = false

  const recordSnapshot = (snapshot: RadioSnapshot): void => {
    status.dataset["radio"] = JSON.stringify(snapshot)
    status.dataset["loads"] = String(directory.loadCount)
  }
  const stopRecording = baseService.subscribe(recordSnapshot)
  style.textContent = styles
  shell.className = "phone-oho-qa"
  heading.textContent = "PHONE / CYBERDECK SHARED Oh-hO"
  grid.className = "phone-oho-qa-grid"
  phoneRoot.className = "phone-oho-qa-device"
  phoneRoot.setAttribute("aria-label", "Phone client")
  computerRoot.className = "phone-oho-qa-device"
  computerRoot.setAttribute("aria-label", "Cyberdeck client")
  tools.className = "phone-oho-qa-tools"
  status.hidden = true
  status.dataset["testid"] = "phone-oho-qa-status"
  status.dataset["subscriptions"] = "2"
  status.dataset["loads"] = String(directory.loadCount)

  appendButton(tools, "Exit phone focus", "phone-focus-exit", () => phone.setActive(false))
  appendButton(tools, "Re-enter phone focus", "phone-focus-enter", () => phone.setActive(true))
  appendButton(tools, "Confirm playback", "phone-confirm-playing", () => media.confirmPlaying())
  appendButton(tools, "Dispose phone", "phone-dispose", () => {
    phone.dispose()
    phone.dispose()
    phoneDisposed = true
    status.dataset["phoneDisposed"] = "true"
  })
  appendButton(tools, "Malformed boundary", "phone-malformed", () => {
    void service.dispatch({ kind: "set-volume", volume: Number.POSITIVE_INFINITY }).then(
      () => {
        status.dataset["malformedVolume"] = "accepted"
      },
      (error: unknown) => {
        status.dataset["malformedVolume"] = error instanceof TypeError ? "rejected" : "unexpected"
      },
    )
    void service.dispatch({ kind: "select-station", stationUuid: "missing-station" })
  })
  grid.append(phoneRoot, computerRoot)
  shell.append(heading, tools, grid, status)
  root.append(style, shell)

  window.addEventListener(
    "pagehide",
    () => {
      if (!phoneDisposed) phone.dispose()
      computer.dispose()
      stopRecording()
      baseService.dispose()
    },
    { once: true },
  )
}
