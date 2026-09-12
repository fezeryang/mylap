import { describe, expect, test } from "bun:test"
import { getEventListeners } from "node:events"
import { createRadioBrowserDirectory } from "./radio-directory"
import { abortError, jsonResponse, validRow } from "./radio-directory.test-support"

export function registerRadioDirectoryNetworkTests(): void {
  describe("mirror retries, cancellation, and precedence", () => {
    test("continues in order until a later mirror returns playable stations", async () => {
      const requested: string[] = []
      const directory = createRadioBrowserDirectory({
        fetch: async (input) => {
          requested.push(String(input))
          return requested.length === 1 ? jsonResponse([], 503) : jsonResponse([validRow])
        },
        mirrors: ["https://a.example", "https://b.example", "https://c.example"],
      })
      expect((await directory.list(new AbortController().signal))[0]?.stationUuid).toBe("station-b")
      expect(requested).toHaveLength(2)
    })

    test("applies empty over invalid over unavailable terminal precedence", async () => {
      const cases: readonly {
        readonly responses: readonly Response[]
        readonly code: "directory-empty" | "directory-invalid"
      }[] = [
        {
          responses: [jsonResponse([], 503), new Response("bad json"), jsonResponse([])],
          code: "directory-empty",
        },
        {
          responses: [jsonResponse([], 503), new Response("bad json"), jsonResponse([], 502)],
          code: "directory-invalid",
        },
      ]
      for (const { responses, code } of cases) {
        let index = 0
        const directory = createRadioBrowserDirectory({
          fetch: async () => responses[index++] ?? jsonResponse([], 503),
          mirrors: ["https://a.example", "https://b.example", "https://c.example"],
        })
        await expect(directory.list(new AbortController().signal)).rejects.toMatchObject({ code })
      }
    })

    test("reports directory unavailable after mirror exhaustion", async () => {
      let attempts = 0
      const directory = createRadioBrowserDirectory({
        fetch: async (_input, init) => {
          attempts += 1
          return await new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () => reject(abortError()), { once: true }),
          )
        },
        mirrors: ["https://a.example", "https://b.example", "https://c.example"],
        timeoutMs: 5,
      })
      await expect(directory.list(new AbortController().signal)).rejects.toMatchObject({
        code: "directory-unavailable",
      })
      expect(attempts).toBe(3)
    })

    test("caller abort rejects AbortError, aborts fetch, and removes its listener", async () => {
      const caller = new AbortController()
      let fetchAborted = false
      const directory = createRadioBrowserDirectory({
        fetch: async (_input, init) =>
          await new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener(
              "abort",
              () => {
                fetchAborted = true
                reject(abortError())
              },
              { once: true },
            ),
          ),
        mirrors: ["https://a.example"],
        timeoutMs: 30_000,
      })
      const pending = directory.list(caller.signal)
      caller.abort()
      await expect(pending).rejects.toMatchObject({ name: "AbortError" })
      expect(fetchAborted).toBe(true)
      expect(getEventListeners(caller.signal, "abort")).toHaveLength(0)
    })

    test("caller abort between mirror attempts rejects before another fetch", async () => {
      const caller = new AbortController()
      let attempts = 0
      class AbortAfterJsonResponse extends Response {
        override async json(): Promise<unknown> {
          queueMicrotask(() => caller.abort())
          return []
        }
      }
      const directory = createRadioBrowserDirectory({
        fetch: async () => {
          attempts += 1
          return attempts === 1 ? new AbortAfterJsonResponse() : jsonResponse([validRow])
        },
        mirrors: ["https://a.example", "https://b.example"],
      })
      await expect(directory.list(caller.signal)).rejects.toMatchObject({ name: "AbortError" })
      expect(attempts).toBe(1)
    })

    test("cleans caller listener after successful settlement", async () => {
      const caller = new AbortController()
      const directory = createRadioBrowserDirectory({
        fetch: async () => jsonResponse([validRow]),
        mirrors: ["https://a.example"],
      })
      await directory.list(caller.signal)
      expect(getEventListeners(caller.signal, "abort")).toHaveLength(0)
    })
  })
}
