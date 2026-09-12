import { describe, expect, test } from "bun:test"
import { createRadioBrowserDirectory } from "./radio-directory"
import { jsonResponse, validRow } from "./radio-directory.test-support"

export function registerRadioDirectoryParserTests(): void {
  describe("Radio Browser response parsing", () => {
    test("coerces boundaries, prefers resolved URLs, filters unsafe rows, and code-point sorts", async () => {
      const rows = [
        validRow,
        {
          ...validRow,
          stationuuid: "station-a",
          name: "Beta",
          url_resolved: "ftp://bad",
          url: "https://fallback.example/a",
          bitrate: "01",
          hls: false,
          lastcheckok: true,
        },
        { ...validRow, stationuuid: "astral", name: "𐀀", bitrate: 64.7, hls: 1 },
        { ...validRow, stationuuid: "bmp", name: "", bitrate: "1.0", hls: "0" },
        { ...validRow, stationuuid: "http", url_resolved: "http://stream.example/radio.mp3" },
        { ...validRow, stationuuid: "unhealthy", lastcheckok: "0" },
        { ...validRow, stationuuid: "bad-hls", hls: "1.0" },
        { ...validRow, stationuuid: "missing-name", name: " " },
      ]
      const result = await createRadioBrowserDirectory({
        fetch: async () => jsonResponse(rows),
        mirrors: ["https://a.example"],
      }).list(new AbortController().signal)
      expect(result.map((station) => station.stationUuid)).toEqual([
        "station-a",
        "station-b",
        "bmp",
        "astral",
      ])
      expect(result[0]).toMatchObject({
        streamUrl: "https://fallback.example/a",
        bitrate: 0,
        codec: "MP3",
        healthy: true,
      })
      expect(result[1]).toMatchObject({
        homepage: "https://station.example/home",
        bitrate: 128,
        hls: false,
      })
    })

    test("accepts only the locked numeric-string grammar", async () => {
      const bitrates = ["0", "1", "1.0", " 12.9 ", "01", "+1", "-1", "1e2", "1 2", ""]
      const rows = bitrates.map((bitrate, index) => ({
        ...validRow,
        stationuuid: `id-${index}`,
        name: `N${index}`,
        bitrate,
      }))
      const result = await createRadioBrowserDirectory({
        fetch: async () => jsonResponse(rows),
        mirrors: ["https://a.example"],
      }).list(new AbortController().signal)
      expect(result.map((station) => station.bitrate)).toEqual([0, 1, 1, 12, 0, 0, 0, 0, 0, 0])
    })

    test("accepts only locked boolean grammar and canonical credential-free metadata", async () => {
      const rows = [
        { ...validRow, stationuuid: "bool-true", hls: " 1 ", lastcheckok: true },
        { ...validRow, stationuuid: "bool-false", hls: 0, lastcheckok: " 1 " },
        {
          ...validRow,
          stationuuid: "metadata",
          homepage: "https://user:pass@station.example/",
          favicon: "ftp://station.example/icon",
          codec: " ",
        },
        { ...validRow, stationuuid: "relative", url_resolved: "/radio.mp3", url: "/fallback" },
        {
          ...validRow,
          stationuuid: "credentials",
          url_resolved: "https://user:pass@stream.example/radio",
          url: "https://user@fallback.example/radio",
        },
        { ...validRow, stationuuid: "health-invalid", lastcheckok: "1.0" },
        { ...validRow, stationuuid: "hls-invalid", hls: 2 },
      ]
      const result = await createRadioBrowserDirectory({
        fetch: async () => jsonResponse(rows),
        mirrors: ["https://a.example"],
      }).list(new AbortController().signal)
      expect(result.map((station) => station.stationUuid)).toEqual([
        "bool-false",
        "bool-true",
        "metadata",
      ])
      expect(result.find((station) => station.stationUuid === "metadata")).toMatchObject({
        homepage: null,
        favicon: null,
        codec: "UNKNOWN",
      })
    })

    test("distinguishes malformed responses from well-formed empty responses", async () => {
      const malformed = createRadioBrowserDirectory({
        fetch: async () => jsonResponse({ stations: [] }),
        mirrors: ["https://a.example"],
      })
      await expect(malformed.list(new AbortController().signal)).rejects.toMatchObject({
        code: "directory-invalid",
      })
      const empty = createRadioBrowserDirectory({
        fetch: async () => jsonResponse([{ ...validRow, url_resolved: "http://unsafe.example" }]),
        mirrors: ["https://a.example"],
      })
      await expect(empty.list(new AbortController().signal)).rejects.toMatchObject({
        code: "directory-empty",
      })
    })
  })
}
