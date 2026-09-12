import {
  createQaRadioDirectory,
  type QaRadioDirectoryScenario,
} from "../services/fixtures/radio-directory"
import type { RadioDirectory, RadioMediaService } from "../services/radio-contracts"
import { createRadioBrowserDirectory, type RadioDirectoryFetch } from "../services/radio-directory"

export class RadioScenarioError extends TypeError {
  constructor(readonly scenario: string) {
    super(`Unknown QA radio scenario: ${scenario}`)
    this.name = "RadioScenarioError"
  }
}

export type RootRadioConfiguration = {
  readonly allowQaFixtures: boolean
  readonly directory: RadioDirectory
  readonly directoryLabel: string
  readonly qaEnabled: boolean
}

const parseScenario = (value: string): QaRadioDirectoryScenario => {
  switch (value) {
    case "playable":
    case "mirror-exhaustion":
    case "pending":
      return value
    default:
      throw new RadioScenarioError(value)
  }
}

export const selectRootRadioConfiguration = (
  query: URLSearchParams,
  fetcher: RadioDirectoryFetch,
): RootRadioConfiguration => {
  const qaEnabled = query.get("qa") === "1"
  const allowQaFixtures = qaEnabled && query.get("radio-fixtures") === "1"
  if (!allowQaFixtures) {
    return {
      allowQaFixtures,
      directory: createRadioBrowserDirectory({ fetch: fetcher }),
      directoryLabel: "production",
      qaEnabled,
    }
  }
  const scenario = parseScenario(query.get("radio-scenario") ?? "playable")
  return {
    allowQaFixtures,
    directory: createQaRadioDirectory(scenario),
    directoryLabel: `fixture:${scenario}`,
    qaEnabled,
  }
}

export const startInitialRadioLoad = (
  radioService: Pick<RadioMediaService, "loadStations">,
): Promise<void> =>
  radioService.loadStations().catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") return
    throw error
  })
