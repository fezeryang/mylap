import { describe, expect, test } from "bun:test"
import { createQaRadioDirectory } from "./fixtures/radio-directory"
import type {
  RadioCommand,
  RadioDirectory,
  RadioErrorCode,
  RadioMediaService,
  RadioPlaybackStatus,
  RadioSnapshot,
  RadioStation,
} from "./radio-contracts"
import {
  createRadioBrowserDirectory,
  RADIO_BROWSER_MIRRORS,
  RadioDirectoryError,
} from "./radio-directory"
import { jsonResponse, validRow } from "./radio-directory.test-support"

export function registerRadioDirectoryContractTests(): void {
  describe("radio public contracts", () => {
    test("compiles every exact public type and literal error code", () => {
      const station: RadioStation = {
        source: "radio-browser",
        stationUuid: "uuid",
        name: "Station",
        streamUrl: "https://stream.example/radio.mp3",
        homepage: null,
        favicon: null,
        codec: "MP3",
        bitrate: 128,
        hls: false,
        healthy: true,
      }
      const statuses = [
        "idle",
        "loading",
        "playing",
        "paused",
        "error",
      ] satisfies readonly RadioPlaybackStatus[]
      const codes = [
        "directory-unavailable",
        "directory-invalid",
        "directory-empty",
        "power-off",
        "station-unavailable",
        "stream-insecure",
        "play-blocked",
        "unsupported-format",
        "stream-failed",
      ] satisfies readonly RadioErrorCode[]
      const commands: readonly RadioCommand[] = [
        { kind: "set-power", powered: true },
        { kind: "select-station", stationUuid: "uuid" },
        { kind: "play" },
        { kind: "pause" },
        { kind: "stop" },
        { kind: "set-volume", volume: 0.5 },
      ]
      const snapshot: RadioSnapshot = {
        powered: false,
        status: "idle",
        stations: [station],
        selectedStation: station,
        volume: 0.7,
        liveElapsedSeconds: 0,
        visualization: [0],
        error: { code: "directory-unavailable", message: "message" },
      }
      const directory: RadioDirectory = { list: async () => [station] }
      const media: RadioMediaService | null = null
      expect([snapshot, directory, media, commands, codes, statuses]).toHaveLength(6)
    })

    test("exports the exact ordered production mirrors and typed directory errors", () => {
      expect(RADIO_BROWSER_MIRRORS).toEqual([
        "https://de1.api.radio-browser.info",
        "https://de2.api.radio-browser.info",
        "https://fi1.api.radio-browser.info",
      ])
      expect(new RadioDirectoryError("directory-empty", "empty")).toMatchObject({
        name: "RadioDirectoryError",
        code: "directory-empty",
        message: "empty",
      })
    })
  })

  describe("radio directory configuration", () => {
    test("rejects invalid mirror counts, origins, credentials, duplicates, and timeouts", () => {
      const invalidMirrors: readonly (readonly string[])[] = [
        [],
        ["https://a.example", "https://b.example", "https://c.example", "https://d.example"],
        ["http://a.example"],
        ["https://user:a@a.example"],
        ["https://a.example/path"],
        ["https://a.example?query=1"],
        ["https://a.example#hash"],
        ["not a url"],
        ["https://a.example", "https://a.example/"],
      ]
      for (const mirrors of invalidMirrors) {
        expect(() => createRadioBrowserDirectory({ fetch, mirrors })).toThrow(TypeError)
      }
      for (const timeoutMs of [0, 30_001, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => createRadioBrowserDirectory({ fetch, timeoutMs })).toThrow(TypeError)
      }
    })

    test("canonicalizes valid mirror origins and sends the exact locked query", async () => {
      const requests: string[] = []
      const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
        requests.push(String(input))
        return jsonResponse([validRow])
      }
      await createRadioBrowserDirectory({
        fetch: fetcher,
        mirrors: ["https://A.example:443/"],
      }).list(new AbortController().signal)
      expect(requests).toEqual([
        "https://a.example/json/stations/search?is_https=true&hidebroken=true&order=name&reverse=false&offset=0&limit=40",
      ])
    })
  })

  describe("QA directories", () => {
    test("returns ordered playable fixture stations", async () => {
      const stations = await createQaRadioDirectory("playable").list(new AbortController().signal)
      expect(
        stations.map((station) => [station.source, station.stationUuid, station.streamUrl]),
      ).toEqual([
        ["qa-fixture", "qa-radio-wav", "/qa/radio.wav"],
        ["qa-fixture", "qa-radio-stream", "https://stream.example/qa.mp3"],
      ])
    })

    test("supports terminal exhaustion and abort-only pending settlement", async () => {
      await expect(
        createQaRadioDirectory("mirror-exhaustion").list(new AbortController().signal),
      ).rejects.toMatchObject({ code: "directory-unavailable" })
      const controller = new AbortController()
      const pending = createQaRadioDirectory("pending").list(controller.signal)
      controller.abort()
      await expect(pending).rejects.toMatchObject({ name: "AbortError" })
      const alreadyAborted = new AbortController()
      alreadyAborted.abort()
      await expect(
        createQaRadioDirectory("playable").list(alreadyAborted.signal),
      ).rejects.toMatchObject({ name: "AbortError" })
    })
  })
}
