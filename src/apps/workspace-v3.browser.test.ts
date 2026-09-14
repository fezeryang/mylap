import { afterAll, describe, expect, test } from "bun:test"
import { closeSoftwareBrowser, softwarePage } from "./software-browser-test-support"

afterAll(closeSoftwareBrowser)

describe("Workspace V3 native software flows", () => {
  test("browser tabs retain instance history, share favorites and never spawn real tabs", async () => {
    const page = await softwarePage()
    try {
      const computer = page.locator(".desktop-os")
      const phone = page.locator(".phone-shell")
      await computer.locator(".desktop-os-dock [data-app-id='browser']").click()
      await phone.locator(".phone-os-grid [data-app-id='browser']").click()
      const address = computer.getByRole("searchbox", { name: "搜索或输入网站地址" })
      await address.fill(new URL("/qa/iframe-fixture.html?first", page.url()).href)
      await computer.getByRole("button", { name: "前往网站" }).click()
      await computer.getByRole("button", { name: "收藏当前网页" }).click()
      expect(await phone.locator(".safari-favorites [data-address]").count()).toBe(2)
      await computer.getByRole("button", { name: "新建标签页" }).click()
      await address.fill("https://unlisted.example.test/")
      await computer.getByRole("button", { name: "前往网站" }).click()
      expect(await computer.locator(".safari-feedback").innerText()).toContain("不会打开真实浏览器")
      expect(page.context().pages().length).toBe(1)
      await computer.locator(".safari-tab-select").first().click()
      expect(await computer.locator(".safari-frame").getAttribute("src")).toContain("?first")
      await computer.getByRole("button", { name: "新建标签页" }).click()
      await computer.locator(".safari-tab-close").last().click()
      expect(await computer.locator(".safari-tab-select").count()).toBe(2)
      const state = await page.evaluate(() => ({
        computer: window.softwareTest.dependencies.browserService.read("computer-main"),
        phone: window.softwareTest.dependencies.browserService.read("phone-main"),
      }))
      expect(state.phone.tabs.length).toBe(1)
      expect(state.phone.tabs[0]?.history).toEqual([""])
      await phone.getByRole("button", { name: "标签页总览" }).click()
      expect(await phone.locator(".safari-tab-card").count()).toBe(1)
      await phone.getByRole("button", { name: "完成标签管理" }).click()
      await computer.screenshot({ path: "/tmp/todou-v3-browser-tabs.png" })
    } finally {
      await page.close()
    }
  }, 30000)

  test("shared downloads persist, preview safely, rename, export original bytes, and delete", async () => {
    const page = await softwarePage()
    try {
      const computer = page.locator(".desktop-os")
      const phone = page.locator(".phone-shell")
      await computer.locator(".desktop-os-dock [data-app-id='files']").click()
      await phone.locator(".phone-os-grid [data-app-id='files']").click()
      const bytes = Buffer.from(
        "Shared workspace\n<script>throw new Error('must stay text')</script>",
      )
      await phone
        .locator(".files-toolbar input[type='file']")
        .setInputFiles({ name: "shared.txt", mimeType: "text/plain", buffer: bytes })
      await computer.locator(".files-row").filter({ hasText: "shared.txt" }).click()
      await page.waitForFunction(() =>
        document
          .querySelector(".desktop-os .files-text-preview")
          ?.textContent?.includes("<script>"),
      )
      await computer.getByRole("textbox", { name: "文件名称" }).fill("renamed.txt")
      await computer.getByRole("button", { name: "重命名", exact: true }).click()
      await phone.locator(".files-row").filter({ hasText: "renamed.txt" }).waitFor()
      const exporting = page.waitForEvent("download")
      await computer.getByRole("button", { name: "导出到此电脑" }).click()
      const exported = await exporting
      expect(exported.suggestedFilename()).toBe("renamed.txt")
      const stream = await exported.createReadStream()
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(Buffer.from(chunk))
      expect(Buffer.concat(chunks)).toEqual(bytes)
      const restored = await page.evaluate(async () => {
        const path = "/src/services/workspace-files-service.ts"
        const { createWorkspaceFilesService } = (await import(
          path
        )) as typeof import("../services/workspace-files-service")
        const service = createWorkspaceFilesService()
        await new Promise<void>((resolve) => {
          const off = service.subscribe(() => {
            if (service.read().ready) {
              off()
              resolve()
            }
          })
        })
        const file = service.read().files[0]
        const text = file ? await (await service.blob(file.id)).text() : ""
        service.dispose()
        return { name: file?.name, text }
      })
      expect(restored).toEqual({ name: "renamed.txt", text: bytes.toString() })
      await phone.screenshot({ path: "/tmp/todou-v3-files-phone.png" })
      await computer.getByRole("button", { name: "删除文件", exact: true }).click()
      await computer.getByRole("button", { name: "确认删除", exact: true }).click()
      await page.waitForFunction(
        () => window.softwareTest.dependencies.filesService.read().files.length === 0,
      )
      expect(await phone.locator(".files-row").count()).toBe(0)
    } finally {
      await page.close()
    }
  }, 30000)

  test("download failures, cancellation, quota and size limits cannot report saved files", async () => {
    const page = await softwarePage()
    try {
      await page.route("**/qa/failing-download", (route) =>
        route.fulfill({ status: 503, body: "Unavailable" }),
      )
      const state = await page.evaluate(async () => {
        const service = window.softwareTest.dependencies.filesService
        const until = (condition: () => boolean): Promise<void> =>
          condition()
            ? Promise.resolve()
            : new Promise((resolve) => {
                const off = service.subscribe(() => {
                  if (condition()) {
                    off()
                    resolve()
                  }
                })
              })
        const failedId = service.download(
          new URL("/qa/failing-download", location.href).href,
          "failed.txt",
        )
        await until(() =>
          service
            .read()
            .transfers.some((entry) => entry.id === failedId && entry.status === "error"),
        )
        const cancelledId = service.transfer(
          "cancelled.txt",
          "QA",
          (signal, progress) =>
            new Promise((_resolve, reject) => {
              progress(2, null)
              signal.addEventListener(
                "abort",
                () => reject(new DOMException("Cancelled", "AbortError")),
                { once: true },
              )
            }),
        )
        service.cancel(cancelledId)
        await until(() =>
          service
            .read()
            .transfers.some((entry) => entry.id === cancelledId && entry.status === "cancelled"),
        )
        const errors: string[] = []
        try {
          await service.save(
            new Blob([new Uint8Array(50 * 1024 * 1024 + 1)]),
            "too-large.bin",
            "QA",
          )
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "")
        }
        const original = IDBObjectStore.prototype.put
        IDBObjectStore.prototype.put = () => {
          throw new DOMException("Full", "QuotaExceededError")
        }
        try {
          await service.save(new Blob(["small"]), "quota.txt", "QA")
        } catch (error) {
          errors.push(error instanceof Error ? error.name : "")
        } finally {
          IDBObjectStore.prototype.put = original
        }
        const failed = service.read().transfers.find((entry) => entry.id === failedId)
        return {
          errors,
          failed: failed?.error,
          count: service.read().files.length,
          cancelled: service.read().transfers.find((entry) => entry.id === cancelledId)?.status,
        }
      })
      expect(state.errors).toEqual(["单个文件不能超过 50 MB", "QuotaExceededError"])
      expect(state.failed).toContain("503")
      expect(state.cancelled).toBe("cancelled")
      expect(state.count).toBe(0)
      await page.unroute("**/qa/failing-download")
      await page.route("**/qa/failing-download", (route) =>
        route.fulfill({ status: 200, contentType: "text/plain", body: "recovered" }),
      )
      await page.evaluate(() => {
        const service = window.softwareTest.dependencies.filesService
        const transfer = service.read().transfers.find((entry) => entry.status === "error")
        if (transfer) service.retry(transfer.id)
      })
      await page.waitForFunction(
        () => window.softwareTest.dependencies.filesService.read().files.length === 1,
      )
      expect(
        await page.evaluate(async () => {
          const service = window.softwareTest.dependencies.filesService
          const file = service.read().files[0]
          return file ? (await service.blob(file.id)).text() : ""
        }),
      ).toBe("recovered")
    } finally {
      await page.close()
    }
  }, 30000)
})
