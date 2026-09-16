import { type ChildProcess, spawn } from "node:child_process"
import { type Browser, chromium, type Page } from "playwright-core"
import type { ScreenAppHandle } from "../runtime/screen-app"
import type { DeviceSoftwareDependencies } from "./device-applications"

declare global {
  interface Window {
    softwareTest: {
      readonly dependencies: DeviceSoftwareDependencies
      readonly computer: ScreenAppHandle
      readonly phone: ScreenAppHandle
      readonly mountedApps: readonly string[]
      readonly activeRadioListeners: () => number
    }
  }
}

let server: ChildProcess | undefined
let origin = ""
let browser: Browser | undefined
let starting: Promise<void> | undefined

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms),
    ),
  ])

const closeFully = async (): Promise<void> => {
  const currentBrowser = browser
  const currentServer = server
  browser = undefined
  server = undefined
  starting = undefined
  origin = ""
  try {
    await currentBrowser?.close()
  } catch {
    // The browser may already be gone after an external (dangling-process) kill.
  }
  if (currentServer !== undefined && currentServer.exitCode === null) {
    const stopped = new Promise<void>((resolve) => currentServer.once("exit", () => resolve()))
    currentServer.kill("SIGTERM")
    await stopped
  }
}

// Kept as a no-op on purpose: browser and server are process-lifetime singletons.
// Closing them per file forces repeated chromium relaunches, which intermittently
// hang in this environment; process exit reaps everything instead.
export const closeSoftwareBrowser = async (): Promise<void> => {}

const start = async (): Promise<void> => {
  server = spawn(
    "node",
    [
      "--input-type=module",
      "-e",
      `
      import { createServer } from "vite"
      const server = await createServer({
        configFile: false,
        optimizeDeps: { noDiscovery: true, include: [] },
        server: { host: "127.0.0.1", port: 0, watch: null },
        logLevel: "error",
      })
      await server.listen()
      console.log("http://127.0.0.1:" + server.httpServer.address().port)
      process.on("SIGTERM", async () => { await server.close(); process.exit(0) })
    `,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  )
  const child = server
  origin = await withTimeout(
    new Promise<string>((resolve, reject) => {
      child.once("error", reject)
      child.once("exit", (code) => reject(new Error(`Software test server exited: ${code}`)))
      let output = ""
      child.stdout?.on("data", (chunk: Buffer) => {
        output += chunk.toString()
        const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
        if (url !== undefined) resolve(url)
      })
    }),
    15000,
    "Software test server start",
  )
  browser = await withTimeout(
    chromium.launch({
      executablePath: process.env["CHROME_PATH"] ?? "/opt/google/chrome/chrome",
      headless: true,
      args: [
        "--no-sandbox",
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-device-for-media-stream",
      ],
    }),
    20000,
    "Software test browser launch",
  )
}

export const softwarePage = async (options?: { readonly unlockPhone?: boolean }): Promise<Page> => {
  if (
    (browser !== undefined && !browser.isConnected()) ||
    (server !== undefined && server.exitCode !== null)
  )
    await closeFully()
  starting ??= start().catch(async (error: unknown) => {
    await closeFully()
    throw error
  })
  await starting
  if (browser === undefined) throw new Error("Software test browser did not start")
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10000)
  await page.goto(`${origin}/qa/iframe-fixture.html`)
  await page.evaluate(
    async (setup) => {
      const load = async (file: string): Promise<unknown> => import(`/src/${file}.ts`)
      const { createMainWorkspaceApp } = (await load(
        "apps/main-workspace-app",
      )) as typeof import("./main-workspace-app")
      const { createPhoneShellApp } = (await load(
        "apps/phone-shell-app",
      )) as typeof import("./phone-shell-app")
      const { createBrowserPolicy } = (await load(
        "apps/browser-url-policy",
      )) as typeof import("./browser-url-policy")
      const { createWorkspaceDataService } = (await load(
        "services/workspace-data-service",
      )) as typeof import("../services/workspace-data-service")
      const { createWorkspaceMusicService } = (await load(
        "services/workspace-music-service",
      )) as typeof import("../services/workspace-music-service")
      const { createRadioMediaService } = (await load(
        "services/radio-media-service",
      )) as typeof import("../services/radio-media-service")
      const { ScreenAppRegistry } = (await load(
        "runtime/screen-app-registry",
      )) as typeof import("../runtime/screen-app-registry")
      const { registerDefaultApps } = (await load(
        "apps/register-default-apps",
      )) as typeof import("./register-default-apps")
      const { assetInstanceId, screenId } = (await load(
        "runtime/ids",
      )) as typeof import("../runtime/ids")
      const audio = new Audio()
      const service = createRadioMediaService({
        allowQaFixtures: true,
        mediaElement: audio,
        directory: {
          list: async () => [
            {
              stationUuid: "dawn-relay",
              name: "Dawn Relay",
              source: "qa-fixture",
              streamUrl: "/qa/valid.wav",
              homepage: null,
              favicon: null,
              codec: "WAV",
              bitrate: 128,
              hls: false,
              healthy: true,
            },
            {
              stationUuid: "night-shift",
              name: "Night Shift",
              source: "qa-fixture",
              streamUrl: "/qa/valid.wav",
              homepage: null,
              favicon: null,
              codec: "WAV",
              bitrate: 128,
              hls: false,
              healthy: true,
            },
          ],
        },
      })
      let listeners = 0
      const radioService: typeof service = {
        ...service,
        subscribe: (callback) => {
          listeners++
          const unsubscribe = service.subscribe(callback)
          let removed = false
          return () => {
            if (!removed) {
              removed = true
              listeners--
              unsubscribe()
            }
          }
        },
      }
      await radioService.loadStations()
      const dependencies = {
        browserService: (
          (await load(
            "services/workspace-browser-service",
          )) as typeof import("../services/workspace-browser-service")
        ).createWorkspaceBrowserService(localStorage),
        filesService: (
          (await load(
            "services/workspace-files-service",
          )) as typeof import("../services/workspace-files-service")
        ).createWorkspaceFilesService(),
        radioService,
        dataService: createWorkspaceDataService(localStorage),
        musicService: createWorkspaceMusicService(radioService),
        libraryService: (
          (await load(
            "services/workspace-library-service",
          )) as typeof import("../services/workspace-library-service")
        ).createWorkspaceLibraryService(),
        clockService: (
          (await load(
            "services/workspace-clock-service",
          )) as typeof import("../services/workspace-clock-service")
        ).createWorkspaceClockService(localStorage),
        browserPolicy: createBrowserPolicy({
          currentOrigin: location.origin,
          allowRelativeQa: true,
        }),
      }
      const registry = new ScreenAppRegistry()
      registerDefaultApps(registry, dependencies)
      const appIds = [
        "main-workspace",
        "system-telemetry",
        "structure-analysis",
        "phone-shell",
        "ratio-tuner-display",
        "ratio-cassette-display",
      ]
      const mountedApps = appIds.map(
        (value) => registry.resolve({ kind: "screen-app-id", value }).appId.value,
      )
      document.body.replaceChildren()
      document.body.style.cssText =
        "margin:0;display:flex;gap:20px;align-items:start;background:#ece9e5"
      for (const name of [
        "device-os",
        "phone-os",
        "productivity-apps",
        "music-app",
        "library-apps",
        "system-controls",
        "companion-os",
        "design-tokens",
        "animations",
        "workspace-browser-files",
      ]) {
        const link = document.createElement("link")
        link.rel = "stylesheet"
        link.href = `/src/${name}.css`
        document.head.append(link)
      }
      const mount = (kind: "computer" | "phone"): ScreenAppHandle => {
        const container = document.createElement("section")
        container.style.cssText =
          kind === "computer"
            ? "width:980px;height:750px;flex-shrink:0"
            : "width:400px;height:840px;flex-shrink:0"
        document.body.append(container)
        const definition =
          kind === "computer"
            ? createMainWorkspaceApp(dependencies)
            : createPhoneShellApp(dependencies)
        const handle = definition.mount(
          { append: (node) => container.append(node), clear: () => container.replaceChildren() },
          {
            assetInstanceId: assetInstanceId(`${kind}-main`),
            screenId: screenId(`${kind}-primary`),
            requestAssetActivation: () => undefined,
            requestScreenFocus: () => undefined,
          },
        )
        if (kind === "phone" && setup.unlockPhone)
          container.querySelector<HTMLButtonElement>(".phone-os-unlock")?.click()
        return handle
      }
      window.softwareTest = {
        dependencies,
        computer: mount("computer"),
        phone: mount("phone"),
        mountedApps,
        activeRadioListeners: () => listeners,
      }
    },
    { unlockPhone: options?.unlockPhone ?? true },
  )
  await page.waitForFunction(() => document.styleSheets.length >= 4)
  return page
}
