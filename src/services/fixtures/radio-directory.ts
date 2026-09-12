import type { RadioDirectory, RadioStation } from "../radio-contracts"
import { RadioDirectoryError } from "../radio-directory"

export type QaRadioDirectoryScenario = "playable" | "mirror-exhaustion" | "pending"

const PLAYABLE_STATIONS: readonly RadioStation[] = [
  {
    source: "qa-fixture",
    stationUuid: "qa-radio-wav",
    name: "QA Local WAV",
    streamUrl: "/qa/radio.wav",
    homepage: null,
    favicon: null,
    codec: "WAV",
    bitrate: 1411,
    hls: false,
    healthy: true,
  },
  {
    source: "qa-fixture",
    stationUuid: "qa-radio-stream",
    name: "QA HTTPS Stream",
    streamUrl: "https://stream.example/qa.mp3",
    homepage: "https://stream.example/",
    favicon: null,
    codec: "MP3",
    bitrate: 128,
    hls: false,
    healthy: true,
  },
]

function createAbortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError")
}

function pending(signal: AbortSignal): Promise<readonly RadioStation[]> {
  if (signal.aborted) return Promise.reject(createAbortError())
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(createAbortError()), { once: true })
  })
}

function rejectIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw createAbortError()
}

export function createQaRadioDirectory(scenario: QaRadioDirectoryScenario): RadioDirectory {
  switch (scenario) {
    case "playable":
      return {
        list: async (signal) => {
          rejectIfAborted(signal)
          return PLAYABLE_STATIONS
        },
      }
    case "mirror-exhaustion":
      return {
        list: async (signal) => {
          rejectIfAborted(signal)
          throw new RadioDirectoryError(
            "directory-unavailable",
            "QA radio directory mirrors are unavailable",
          )
        },
      }
    case "pending":
      return { list: pending }
    default:
      return assertNever(scenario)
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected QA radio directory scenario: ${String(value)}`)
}
