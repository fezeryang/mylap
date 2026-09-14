import { afterAll, describe, expect, test } from "bun:test"
import { closeSoftwareBrowser, softwarePage } from "./software-browser-test-support"

afterAll(closeSoftwareBrowser)

describe("Workspace V2 real browser applications", () => {
  test("Purpose-built side displays add shared reminders and control the same media session", async () => {
    const page = await softwarePage()
    try {
      const before = await page.evaluate(() => window.softwareTest.activeRadioListeners())
      await page.evaluate(async () => {
        const path = "/src/apps/companion-app.ts"
        const { createCompanionApp } = (await import(path)) as typeof import("./companion-app")
        document.body.style.flexWrap = "wrap"
        const handles = (["music", "reminders"] as const).map((kind) => {
          const container = document.createElement("section")
          container.style.cssText = "width:800px;height:560px;flex-shrink:0"
          document.body.append(container)
          return createCompanionApp(
            { kind: "screen-app-id", value: `qa-${kind}` },
            kind,
            window.softwareTest.dependencies,
          ).mount(
            { append: (node) => container.append(node), clear: () => container.replaceChildren() },
            {
              assetInstanceId: { kind: "asset-instance-id", value: "computer-main" },
              screenId: { kind: "screen-id", value: `qa-${kind}` },
              requestAssetActivation: () => undefined,
              requestScreenFocus: () => undefined,
            },
          )
        })
        window.addEventListener(
          "dispose-companions",
          () => {
            for (const handle of handles) handle.dispose()
          },
          { once: true },
        )
      })
      const today = page.getByTestId("companion-today")
      await today.getByRole("textbox", { name: "新的提醒事项" }).fill("从副屏到手机")
      await today.getByRole("button", { name: "添加提醒事项", exact: true }).click()
      const phone = page.locator(".phone-shell")
      await phone.locator(".phone-os-grid [data-app-id='reminders']").click()
      expect(
        await phone
          .locator(".productivity-reminder-list")
          .getByText("从副屏到手机", { exact: true })
          .count(),
      ).toBe(1)
      await today.getByRole("checkbox", { name: "从副屏到手机" }).check()
      expect(
        await page.evaluate(
          () =>
            window.softwareTest.dependencies.dataService
              .read()
              .reminders.find((item) => item.text === "从副屏到手机")?.completed,
        ),
      ).toBe(true)
      const player = page.getByTestId("companion-player")
      await player.getByRole("combobox", { name: "Audio source" }).selectOption("radio")
      await player.getByTestId("media-play").click()
      await page.waitForFunction(
        () => window.softwareTest.dependencies.radioService.read().status === "playing",
      )
      await player.getByRole("slider", { name: "Radio volume" }).fill("0.3")
      expect(
        await page.evaluate(() => window.softwareTest.dependencies.radioService.read().volume),
      ).toBe(0.3)
      await player.screenshot({ path: "/tmp/todou-v2-left-panel.png" })
      await today.screenshot({ path: "/tmp/todou-v2-right-panel.png" })
      await page.evaluate(() => window.dispatchEvent(new Event("dispose-companions")))
      expect(await page.evaluate(() => window.softwareTest.activeRadioListeners())).toBe(before)
    } finally {
      await page.close()
    }
  }, 30000)

  test("Photos import, original download, persistent reopen and deletion work across both devices", async () => {
    const page = await softwarePage()
    try {
      const computer = page.locator(".desktop-os")
      const phone = page.locator(".phone-shell")
      await computer.locator(".desktop-os-dock [data-app-id='photos']").click()
      await phone.locator(".phone-os-grid [data-app-id='photos']").click()
      const bytes = Buffer.from(
        await page.evaluate(() => {
          const canvas = document.createElement("canvas")
          canvas.width = 24
          canvas.height = 24
          const context = canvas.getContext("2d")
          if (context === null) throw new Error("Canvas is unavailable")
          context.fillStyle = "#ce6681"
          context.fillRect(0, 0, 24, 24)
          return canvas.toDataURL("image/png").split(",")[1] ?? ""
        }),
        "base64",
      )
      await phone.getByTestId("photos-import-files").setInputFiles({
        name: "shared-photo.png",
        mimeType: "image/png",
        buffer: bytes,
      })
      await computer.getByRole("button", { name: "Open shared-photo.png" }).click()
      await computer.getByTestId("photos-zoom").click()
      expect(await computer.getByTestId("photos-zoom").textContent()).toContain("2")
      await computer.getByRole("button", { name: "保存原图到文件" }).click()
      await page.waitForFunction(() =>
        window.softwareTest.dependencies.filesService
          .read()
          .files.some((file) => file.name === "shared-photo.png"),
      )
      await computer.locator(".desktop-os-dock [data-app-id='files']").click()
      await computer.locator(".files-row").filter({ hasText: "shared-photo.png" }).click()
      const downloadReady = page.waitForEvent("download")
      await computer.getByRole("button", { name: "导出到此电脑" }).click()
      const download = await downloadReady
      expect(download.suggestedFilename()).toBe("shared-photo.png")
      const stream = await download.createReadStream()
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(Buffer.from(chunk))
      expect(Buffer.concat(chunks)).toEqual(bytes)
      const persisted = await page.evaluate(async () => {
        const path = "/src/services/workspace-library-service.ts"
        const { createWorkspaceLibraryService } = (await import(
          path
        )) as typeof import("../services/workspace-library-service")
        const restored = createWorkspaceLibraryService()
        await new Promise<void>((resolve) => {
          const unsubscribe = restored.subscribe((snapshot) => {
            if (snapshot.storageStatus !== "loading") {
              unsubscribe()
              resolve()
            }
          })
        })
        const result = restored.read().photos.map((photo) => photo.fileName)
        restored.dispose()
        return result
      })
      expect(persisted).toEqual(["shared-photo.png"])
      await computer.locator(".desktop-os-dock [data-app-id='photos']").click()
      await computer.getByRole("button", { name: "Delete photo", exact: true }).click()
      await computer.getByTestId("photos-delete-confirm").click()
      await page.waitForFunction(
        () => window.softwareTest.dependencies.libraryService.read().photos.length === 0,
      )
      expect(await phone.getByTestId("photos-grid").getByRole("button").count()).toBe(0)
      await phone.getByTestId("photos-import-files").setInputFiles({
        name: "broken.png",
        mimeType: "image/png",
        buffer: Buffer.from("not an image"),
      })
      await page.waitForFunction(
        () => window.softwareTest.dependencies.libraryService.read().photoError !== null,
      )
      expect(
        await page.evaluate(
          () => window.softwareTest.dependencies.libraryService.read().photos.length,
        ),
      ).toBe(0)
    } finally {
      await page.close()
    }
  }, 30000)

  test("Native microphone capture pauses, saves playable audio and releases tracks; recording is shared", async () => {
    const page = await softwarePage()
    try {
      await page.context().grantPermissions(["microphone"])
      await page.evaluate(() => {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        const tracks: MediaStreamTrack[] = []
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          const stream = await original(constraints)
          tracks.push(...stream.getTracks())
          return stream
        }
        Object.defineProperty(window, "captureTrackStates", {
          get: () => tracks.map((track) => track.readyState),
        })
      })
      const computer = page.locator(".desktop-os")
      const phone = page.locator(".phone-shell")
      await computer.locator(".desktop-os-dock [data-app-id='recorder']").click()
      await phone.locator(".phone-os-grid [data-app-id='recorder']").click()
      await phone.getByRole("button", { name: "开始录音", exact: true }).click()
      await page.waitForFunction(
        () => window.softwareTest.dependencies.libraryService.read().recording.durationMs > 1100,
      )
      await computer.getByRole("button", { name: "暂停录音", exact: true }).click()
      await page.waitForFunction(
        () => window.softwareTest.dependencies.libraryService.read().recording.status === "paused",
      )
      expect(await phone.getByRole("button", { name: "继续录音", exact: true }).isVisible()).toBe(
        true,
      )
      await phone.getByRole("button", { name: "继续录音", exact: true }).click()
      await page.waitForFunction(
        () => window.softwareTest.dependencies.libraryService.read().recording.durationMs > 1500,
      )
      await phone.getByRole("button", { name: "停止并保存", exact: true }).click()
      await page.waitForFunction(
        () => window.softwareTest.dependencies.libraryService.read().recordings.length === 1,
      )
      expect(await page.evaluate(() => Reflect.get(window, "captureTrackStates"))).toEqual([
        "ended",
      ])
      const saved = await page.evaluate(
        () => window.softwareTest.dependencies.libraryService.read().recordings[0],
      )
      expect(saved?.size).toBeGreaterThan(100)
      expect(saved?.durationMs).toBeGreaterThan(1500)
      await computer.locator(".voice-row").click()
      await computer.getByRole("textbox", { name: "录音名称" }).fill("共同的声音")
      await computer.getByRole("button", { name: "保存名称" }).click()
      await phone.locator(".voice-row").filter({ hasText: "共同的声音" }).click()
      await phone.getByRole("button", { name: "播放录音", exact: true }).click()
      await page.waitForFunction(
        () => window.softwareTest.dependencies.libraryService.read().playback.status === "playing",
      )
      await computer.getByRole("button", { name: "暂停播放", exact: true }).click()
      expect(
        await page.evaluate(
          () => window.softwareTest.dependencies.libraryService.read().playback.status,
        ),
      ).toBe("paused")
      await phone.getByRole("button", { name: "开始录音", exact: true }).click()
      await page.waitForFunction(
        () =>
          window.softwareTest.dependencies.libraryService.read().recording.status === "recording",
      )
      await phone.getByRole("button", { name: "取消录音", exact: true }).click()
      expect(await page.evaluate(() => Reflect.get(window, "captureTrackStates"))).toEqual([
        "ended",
        "ended",
      ])
      expect(
        await page.evaluate(
          () => window.softwareTest.dependencies.libraryService.read().recordings.length,
        ),
      ).toBe(1)
    } finally {
      await page.close()
    }
  }, 30000)

  test("Shared timers survive app switching and compact controls drive the actual radio", async () => {
    const page = await softwarePage()
    try {
      const computer = page.locator(".desktop-os")
      const phone = page.locator(".phone-shell")
      await computer.locator(".desktop-os-dock [data-app-id='clock']").click()
      await phone.locator(".phone-os-grid [data-app-id='clock']").click()
      await computer.getByRole("tab", { name: "倒计时", exact: true }).click()
      await phone.getByRole("tab", { name: "倒计时", exact: true }).click()
      await computer.getByRole("spinbutton", { name: "倒计时分钟" }).fill("0")
      await computer.getByRole("spinbutton", { name: "倒计时秒数" }).fill("30")
      await computer.getByRole("button", { name: "开始计时", exact: true }).click()
      await phone.getByRole("button", { name: "暂停", exact: true }).click()
      expect(
        await page.evaluate(
          () => window.softwareTest.dependencies.clockService.read().timer.status,
        ),
      ).toBe("paused")
      await phone.getByRole("button", { name: "返回手机主屏幕", exact: true }).click()
      await phone.locator(".phone-os-grid [data-app-id='clock']").click()
      await phone.getByRole("button", { name: "继续", exact: true }).click()
      expect(await computer.getByRole("button", { name: "暂停", exact: true }).isVisible()).toBe(
        true,
      )
      await phone.getByRole("button", { name: "取消", exact: true }).click()
      await computer.getByRole("button", { name: "打开控制中心", exact: true }).click()
      const controls = computer.getByRole("dialog", { name: "控制中心" })
      await controls.getByRole("combobox", { name: "Audio source" }).selectOption("radio")
      await controls.getByTestId("media-play").click()
      await page.waitForFunction(
        () => window.softwareTest.dependencies.radioService.read().status === "playing",
      )
      await phone.getByRole("button", { name: "展开正在播放", exact: true }).click()
      await phone.locator(".phone-os-island-expanded").getByTestId("media-play").click()
      expect(
        await page.evaluate(() => window.softwareTest.dependencies.radioService.read().status),
      ).toBe("paused")
      await page.evaluate(async () => {
        const path = "/src/services/radio-physical-controls.ts"
        const { handleRadioPartPick } = (await import(
          path
        )) as typeof import("../services/radio-physical-controls")
        const service = window.softwareTest.dependencies.radioService
        handleRadioPartPick(service, "transport-controls", "stop")
      })
      await page.waitForFunction(
        () => window.softwareTest.dependencies.radioService.read().status === "idle",
      )
      expect(await controls.getByTestId("media-play").getAttribute("aria-label")).toBe("Play")
    } finally {
      await page.close()
    }
  }, 30000)
})
