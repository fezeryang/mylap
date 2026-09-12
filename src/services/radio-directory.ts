import type { RadioDirectory, RadioErrorCode, RadioStation } from "./radio-contracts"
import { isUnknownArray, parseRadioBrowserStations } from "./radio-directory-parser"

export type RadioDirectoryErrorCode = Extract<
  RadioErrorCode,
  "directory-unavailable" | "directory-invalid" | "directory-empty"
>

export class RadioDirectoryError extends Error {
  readonly name = "RadioDirectoryError"

  constructor(
    readonly code: RadioDirectoryErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export const RADIO_BROWSER_MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
] as const

const SEARCH_PATH =
  "/json/stations/search?is_https=true&hidebroken=true&order=name&reverse=false&offset=0&limit=40"

export type RadioDirectoryFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

type RadioBrowserDirectoryOptions = {
  readonly fetch: RadioDirectoryFetch
  readonly mirrors?: readonly string[]
  readonly timeoutMs?: number
}

type AttemptResult =
  | { readonly kind: "stations"; readonly stations: readonly RadioStation[] }
  | { readonly kind: "empty" }
  | { readonly kind: "invalid" }
  | { readonly kind: "unavailable" }

type ValidatedDirectoryOptions = {
  readonly fetcher: RadioDirectoryFetch
  readonly mirrors: readonly string[]
  readonly timeoutMs: number
}

type MirrorAttempt = {
  readonly fetcher: RadioDirectoryFetch
  readonly mirror: string
  readonly timeoutMs: number
  readonly callerSignal: AbortSignal
}

function createAbortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError")
}

function canonicalMirror(rawMirror: string): string {
  try {
    const url = new URL(rawMirror)
    const valid =
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    if (!valid) throw new TypeError("Radio Browser mirrors must be credential-free HTTPS origins")
    return url.origin
  } catch (error) {
    if (error instanceof TypeError) {
      throw new TypeError("Radio Browser mirrors must be credential-free HTTPS origins")
    }
    throw error
  }
}

function validateOptions(options: RadioBrowserDirectoryOptions): ValidatedDirectoryOptions {
  const mirrors = options.mirrors ?? RADIO_BROWSER_MIRRORS
  const timeoutMs = options.timeoutMs ?? 5_000
  if (mirrors.length < 1 || mirrors.length > 3) {
    throw new TypeError("Radio Browser requires between one and three mirrors")
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new TypeError("Radio Browser timeout must be an integer from 1 to 30000 milliseconds")
  }
  const canonicalMirrors = mirrors.map(canonicalMirror)
  if (new Set(canonicalMirrors).size !== canonicalMirrors.length) {
    throw new TypeError("Radio Browser mirrors must be unique")
  }
  return { fetcher: options.fetch, mirrors: canonicalMirrors, timeoutMs }
}

async function attemptMirror(attempt: MirrorAttempt): Promise<AttemptResult> {
  if (attempt.callerSignal.aborted) throw createAbortError()
  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = (): void => controller.abort()
  attempt.callerSignal.addEventListener("abort", abortFromCaller, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, attempt.timeoutMs)
  try {
    let response: Response
    try {
      response = await attempt.fetcher(`${attempt.mirror}${SEARCH_PATH}`, {
        signal: controller.signal,
      })
    } catch (error) {
      if (attempt.callerSignal.aborted) throw createAbortError()
      if (error instanceof Error) return { kind: "unavailable" }
      return { kind: "unavailable" }
    }
    if (attempt.callerSignal.aborted) throw createAbortError()
    if (timedOut) return { kind: "unavailable" }
    if (!response.ok) return { kind: "invalid" }
    let payload: unknown
    try {
      payload = await response.json()
    } catch (error) {
      if (attempt.callerSignal.aborted) throw createAbortError()
      if (timedOut) return { kind: "unavailable" }
      if (error instanceof Error) return { kind: "invalid" }
      return { kind: "invalid" }
    }
    if (!isUnknownArray(payload)) return { kind: "invalid" }
    const stations = parseRadioBrowserStations(payload)
    return stations.length > 0 ? { kind: "stations", stations } : { kind: "empty" }
  } finally {
    clearTimeout(timer)
    attempt.callerSignal.removeEventListener("abort", abortFromCaller)
  }
}

async function listStations(
  options: ValidatedDirectoryOptions,
  signal: AbortSignal,
): Promise<readonly RadioStation[]> {
  if (signal.aborted) throw createAbortError()
  let sawEmpty = false
  let sawInvalid = false
  for (const mirror of options.mirrors) {
    const result = await attemptMirror({
      fetcher: options.fetcher,
      mirror,
      timeoutMs: options.timeoutMs,
      callerSignal: signal,
    })
    switch (result.kind) {
      case "stations":
        return result.stations
      case "empty":
        sawEmpty = true
        break
      case "invalid":
        sawInvalid = true
        break
      case "unavailable":
        break
      default:
        return assertNever(result)
    }
  }
  if (sawEmpty)
    throw new RadioDirectoryError("directory-empty", "No playable radio stations were found")
  if (sawInvalid)
    throw new RadioDirectoryError("directory-invalid", "Radio directory responses were invalid")
  throw new RadioDirectoryError("directory-unavailable", "Radio directory is unavailable")
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected radio directory result: ${String(value)}`)
}

export function createRadioBrowserDirectory(options: RadioBrowserDirectoryOptions): RadioDirectory {
  const validated = validateOptions(options)
  return {
    list: (signal) => listStations(validated, signal),
  }
}
