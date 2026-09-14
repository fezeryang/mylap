import type { WorkspaceFilesService } from "../services/workspace-files-service"
import { MAX_DOWNLOAD_BYTES } from "../services/workspace-files-service"
import type { BrowserPolicy } from "./browser-url-policy"

const CHANNEL = "todou-browser-v1"
export const connectBrowserSite = (options: {
  frame: HTMLIFrameElement
  policy: BrowserPolicy
  files: WorkspaceFilesService
  onPage(page: { url: string; title?: string; scrollY?: number }): void
  onOpen(url: string, newTab: boolean): void
  onWorkspace(): void
  onDownload(): void
}) => {
  const { frame, policy, files } = options
  let origin = ""
  let session = crypto.randomUUID()
  const pending = new Map<
    string,
    {
      resolve: (value: { blob: Blob; name: string }) => void
      reject: (error: Error) => void
      progress: (received: number, total: number | null) => void
      cleanup: () => void
    }
  >()
  const tell = (message: object): void => {
    if (origin) frame.contentWindow?.postMessage({ channel: CHANNEL, session, ...message }, origin)
  }
  const abandon = (): void => {
    for (const [id, job] of pending) {
      tell({ type: "cancel-download", id })
      job.cleanup()
      job.reject(new Error("来源标签已离开，请重新打开下载页面后重试。"))
    }
    pending.clear()
  }
  const receive = (event: MessageEvent<unknown>): void => {
    if (
      event.source !== frame.contentWindow ||
      event.origin !== origin ||
      !policy.isPersonalSite(frame.src)
    )
      return
    const data = event.data
    if (
      !data ||
      typeof data !== "object" ||
      !("channel" in data) ||
      data.channel !== CHANNEL ||
      !("session" in data) ||
      data.session !== session ||
      !("type" in data)
    )
      return
    if (data.type === "ready" || data.type === "page") {
      if (!("url" in data) || typeof data.url !== "string" || !policy.isPersonalSite(data.url))
        return
      options.onPage({
        url: data.url,
        ...("title" in data && typeof data.title === "string" ? { title: data.title } : {}),
        ...("scrollY" in data && typeof data.scrollY === "number" && Number.isFinite(data.scrollY)
          ? { scrollY: data.scrollY }
          : {}),
      })
      return
    }
    if (data.type === "open" && "url" in data && typeof data.url === "string") {
      options.onOpen(data.url, "newTab" in data && data.newTab === true)
      return
    }
    if (data.type === "workspace") {
      options.onWorkspace()
      return
    }
    if (data.type === "download" && "url" in data && typeof data.url === "string") {
      let url: URL
      try {
        url = new URL(data.url)
      } catch {
        return
      }
      if (url.origin !== origin || url.username || url.password) return
      const name = "name" in data && typeof data.name === "string" ? data.name : "网站下载"
      const downloadUrl = url.href
      const sourceOrigin = origin
      files.transfer(
        name,
        "我的网站",
        (signal, progress) =>
          new Promise((resolve, reject) => {
            if (sourceOrigin !== origin || !policy.isPersonalSite(frame.src)) {
              reject(new Error("请先打开原网站标签，再重试下载。"))
              return
            }
            const id = crypto.randomUUID()
            const abort = (): void => {
              tell({ type: "cancel-download", id })
              clearTimeout(timeout)
              pending.delete(id)
              reject(new DOMException("已取消", "AbortError"))
            }
            const timeout = setTimeout(() => {
              tell({ type: "cancel-download", id })
              pending.delete(id)
              signal.removeEventListener("abort", abort)
              reject(new Error("下载超时，请重试。"))
            }, 120000)
            signal.addEventListener("abort", abort, { once: true })
            pending.set(id, {
              resolve,
              reject,
              progress,
              cleanup: () => {
                clearTimeout(timeout)
                signal.removeEventListener("abort", abort)
              },
            })
            tell({ type: "fetch-download", id, url: downloadUrl, name })
          }),
      )
      options.onDownload()
      return
    }
    if (!("id" in data) || typeof data.id !== "string") return
    const job = pending.get(data.id)
    if (!job) return
    if (
      data.type === "download-progress" &&
      "received" in data &&
      typeof data.received === "number"
    ) {
      const total = "total" in data && typeof data.total === "number" ? data.total : null
      try {
        job.progress(data.received, total)
      } catch {
        tell({ type: "cancel-download", id: data.id })
        job.cleanup()
        pending.delete(data.id)
        job.reject(new Error("单个文件不能超过 50 MB"))
      }
    }
    if (data.type === "download-result" || data.type === "download-error") {
      job.cleanup()
      pending.delete(data.id)
      if (
        data.type === "download-result" &&
        "bytes" in data &&
        data.bytes instanceof ArrayBuffer &&
        data.bytes.byteLength <= MAX_DOWNLOAD_BYTES &&
        "name" in data &&
        typeof data.name === "string"
      ) {
        job.resolve({
          blob: new Blob([data.bytes], {
            type:
              "mime" in data && typeof data.mime === "string"
                ? data.mime
                : "application/octet-stream",
          }),
          name: data.name,
        })
      } else
        job.reject(
          new Error(
            "message" in data && typeof data.message === "string"
              ? data.message.slice(0, 200)
              : "下载内容无效",
          ),
        )
    }
  }
  window.addEventListener("message", receive)
  const visibility = new IntersectionObserver(([entry]) => {
    tell({ type: "visibility", visible: entry?.isIntersecting === true && !document.hidden })
  })
  const pageVisibility = (): void => {
    tell({ type: "visibility", visible: !document.hidden && frame.getClientRects().length > 0 })
  }
  document.addEventListener("visibilitychange", pageVisibility)
  visibility.observe(frame)
  return {
    tell,
    navigate: (url: string): void => {
      abandon()
      session = crypto.randomUUID()
      origin = url ? new URL(url).origin : ""
    },
    dispose: (): void => {
      abandon()
      origin = ""
      visibility.disconnect()
      window.removeEventListener("message", receive)
      document.removeEventListener("visibilitychange", pageVisibility)
    },
  }
}
