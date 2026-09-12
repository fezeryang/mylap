import { createBrowserPolicy } from "../../src/apps/browser-url-policy"
import { createMainWorkspaceApp } from "../../src/apps/main-workspace-app"
import { assetInstanceId, screenId } from "../../src/runtime/ids"
import type { ScreenAppHost } from "../../src/runtime/screen-app"
import { createRadioMediaService, type RadioMediaElement } from "../../src/services/radio-media-service"
import type { RadioDirectory, RadioMediaService, RadioStation } from "../../src/services/radio-contracts"
import type { QaCaseModule } from "../qa-harness/qa-case-contract"

const station: RadioStation = {
  bitrate: 1411,
  codec: "WAV",
  favicon: null,
  healthy: true,
  hls: false,
  homepage: null,
  name: "QA Local WAV",
  source: "qa-fixture",
  stationUuid: "launcher-qa-wav",
  streamUrl: "/qa/valid.wav",
}

class QaMediaElement extends EventTarget implements RadioMediaElement {
  currentTime = 0
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
    this.dispatchEvent(new Event("playing"))
    return Promise.resolve()
  }

  removeAttribute(name: string): void {
    if (name === "src") this.src = ""
  }
}

const directory: RadioDirectory = {
  list: async (): Promise<readonly RadioStation[]> => [station],
}

const subscribeCounted = (service: RadioMediaService, onChange: (active: number) => void): RadioMediaService => {
  let active = 0
  return {
    dispatch: (command) => service.dispatch(command),
    dispose: () => service.dispose(),
    loadStations: (options) => service.loadStations(options),
    read: () => service.read(),
    subscribe: (listener) => {
      active += 1
      onChange(active)
      const unsubscribe = service.subscribe(listener)
      return () => {
        unsubscribe()
        active -= 1
        onChange(active)
      }
    },
  }
}

export const caseId = "launcher"

export const mount: QaCaseModule["mount"] = async ({ root }) => {
  const status = document.createElement("output")
  status.dataset["testid"] = "launcher-qa-status"
  status.hidden = true
  const baseService = createRadioMediaService({
    allowQaFixtures: true,
    directory,
    mediaElement: new QaMediaElement(),
  })
  await baseService.loadStations()
  const service = subscribeCounted(baseService, (active) => {
    status.dataset["subscriptions"] = String(active)
  })
  const app = createMainWorkspaceApp({
    browserPolicy: createBrowserPolicy({ currentOrigin: window.location.origin, allowRelativeQa: true }),
    radioService: service,
  })
  let sessions = 0
  const host: ScreenAppHost = {
    append: (node) => root.append(node),
    clear: () => root.replaceChildren(),
  }
  const handle = app.mount(host, {
    assetInstanceId: assetInstanceId("computer-main"),
    requestAssetActivation: () => undefined,
    requestScreenFocus: () => undefined,
    screenId: screenId("computer-primary"),
  })
  sessions += 1
  status.dataset["sessions"] = String(sessions)
  status.dataset["subscriptions"] = "1"
  const dispose = document.createElement("button")
  dispose.className = "launcher-button"
  dispose.type = "button"
  dispose.textContent = "Dispose launcher"
  dispose.dataset["testid"] = "launcher-dispose"
  dispose.addEventListener("click", () => {
    handle.dispose()
    status.dataset["disposed"] = "true"
  })
  root.append(status, dispose)
}
