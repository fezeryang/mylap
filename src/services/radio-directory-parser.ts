import type { RadioStation } from "./radio-contracts"

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function trimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function absoluteHttpUrl(value: unknown): string | null {
  const text = trimmedString(value)
  if (text === null) return null
  try {
    const url = new URL(text)
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null
    }
    return url.href
  } catch (error) {
    if (error instanceof TypeError) return null
    throw error
  }
}

function streamUrl(row: Readonly<Record<string, unknown>>): string | null {
  return absoluteHttpUrl(row["url_resolved"]) ?? absoluteHttpUrl(row["url"])
}

function bitrate(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0
  }
  if (typeof value !== "string") return 0
  const trimmed = value.trim()
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(trimmed)) return 0
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

function binaryBoolean(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "1") return true
  if (value === false || value === 0 || value === "0") return false
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed === "1") return true
  if (trimmed === "0") return false
  return null
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = [...left]
  const rightPoints = [...right]
  const sharedLength = Math.min(leftPoints.length, rightPoints.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const difference =
      (leftPoints[index]?.codePointAt(0) ?? 0) - (rightPoints[index]?.codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function parseStation(value: unknown): RadioStation | null {
  if (!isRecord(value)) return null
  const stationUuid = trimmedString(value["stationuuid"])
  const name = trimmedString(value["name"])
  const parsedStreamUrl = streamUrl(value)
  const hls = binaryBoolean(value["hls"])
  const healthy = binaryBoolean(value["lastcheckok"]) ?? false
  if (
    stationUuid === null ||
    name === null ||
    parsedStreamUrl === null ||
    !parsedStreamUrl.startsWith("https://") ||
    hls === null ||
    !healthy
  ) {
    return null
  }
  return {
    source: "radio-browser",
    stationUuid,
    name,
    streamUrl: parsedStreamUrl,
    homepage: absoluteHttpUrl(value["homepage"]),
    favicon: absoluteHttpUrl(value["favicon"]),
    codec: trimmedString(value["codec"])?.toUpperCase() ?? "UNKNOWN",
    bitrate: bitrate(value["bitrate"]),
    hls,
    healthy,
  }
}

export function parseRadioBrowserStations(rows: readonly unknown[]): readonly RadioStation[] {
  const stations: RadioStation[] = []
  for (const row of rows) {
    const station = parseStation(row)
    if (station !== null) stations.push(station)
  }
  stations.sort((left, right) => {
    const nameOrder = compareCodePoints(left.name, right.name)
    return nameOrder !== 0 ? nameOrder : compareCodePoints(left.stationUuid, right.stationUuid)
  })
  return stations
}
