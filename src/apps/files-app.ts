import type { WorkspaceDataService } from "../services/workspace-data-service"
import type { WorkspaceFile, WorkspaceFilesService } from "../services/workspace-files-service"
import { element, listen } from "./dom"
import { createProductivityApp } from "./productivity-apps"

const button = (label: string): HTMLButtonElement => {
  const node = element("button", "library-button", label)
  node.type = "button"
  return node
}
const size = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`
export const createFilesApp = (service: WorkspaceFilesService, data: WorkspaceDataService) => {
  const root = element("section", "files-app")
  root.setAttribute("aria-label", "文件")
  const header = element("header", "files-toolbar")
  const downloads = button("下载")
  const notesTab = button("备忘录文件")
  const importButton = button("导入文件")
  const upload = element("input", "")
  upload.type = "file"
  upload.multiple = true
  upload.hidden = true
  header.append(downloads, notesTab, importButton, upload)
  const status = element("p", "files-status")
  status.setAttribute("role", "status")
  const panel = element("div", "files-downloads")
  const transfers = element("div", "files-transfers")
  const list = element("div", "files-list")
  const preview = element("section", "files-preview")
  preview.hidden = true
  const previewHeader = element("header", "files-preview-header")
  const close = button("返回文件")
  const rename = element("form", "files-rename")
  const name = element("input", "")
  name.setAttribute("aria-label", "文件名称")
  name.maxLength = 180
  const saveName = button("重命名")
  saveName.type = "submit"
  rename.append(name, saveName)
  const exportFile = button("导出到此电脑")
  const remove = button("删除文件")
  const confirmation = element("div", "files-confirm")
  confirmation.hidden = true
  const keep = button("保留")
  const confirm = button("确认删除")
  confirmation.append(element("p", "", "从所有虚拟设备中删除此文件？"), keep, confirm)
  const content = element("div", "files-preview-content")
  previewHeader.append(close, rename)
  preview.append(previewHeader, content, exportFile, remove, confirmation)
  const notes = createProductivityApp("files", data, service)
  notes.element.hidden = true
  panel.append(transfers, list)
  root.append(header, status, panel, preview, notes.element)
  let selected: WorkspaceFile | null = null
  let previewUrl: string | null = null
  let generation = 0
  let disposed = false
  const exportUrls = new Map<string, ReturnType<typeof setTimeout>>()
  const report = (text: string): void => {
    status.textContent = text
    status.hidden = !text
  }
  const perform = (action: () => Promise<unknown>, success?: string): void => {
    void action()
      .then(() => {
        if (!disposed && success) report(success)
      })
      .catch((error: unknown) => {
        if (!disposed) report(error instanceof Error ? error.message : "文件操作失败")
      })
  }
  const clearPreview = (): void => {
    generation++
    for (const media of content.querySelectorAll("audio,video"))
      if (media instanceof HTMLMediaElement) {
        media.pause()
        media.removeAttribute("src")
        media.load()
      }
    content.replaceChildren()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrl = null
  }
  const closePreview = (): void => {
    clearPreview()
    selected = null
    preview.hidden = true
    panel.hidden = false
    confirmation.hidden = true
  }
  const open = async (id: string): Promise<void> => {
    clearPreview()
    const version = generation
    const file = service.read().files.find((entry) => entry.id === id)
    if (!file) throw new Error("文件已被删除")
    selected = file
    name.value = file.name
    panel.hidden = true
    preview.hidden = false
    confirmation.hidden = true
    content.append(element("p", "", "正在打开…"))
    const blob = await service.blob(id)
    if (disposed || generation !== version) return
    content.replaceChildren()
    if (/^text\//.test(file.type) || /\.(txt|md|json|csv)$/i.test(file.name)) {
      // Never execute HTML/SVG imported as documents, and bound large-text DOM work.
      const text = await blob.slice(0, 1024 * 1024).text()
      if (disposed || generation !== version) return
      content.append(element("pre", "files-text-preview", text))
      if (blob.size > 1024 * 1024)
        content.append(element("p", "", "仅预览前 1 MB；导出保留完整文件。"))
    } else if (/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(file.type)) {
      previewUrl = URL.createObjectURL(blob)
      const image = element("img", "files-image-preview")
      image.alt = file.name
      image.src = previewUrl
      content.append(image)
    } else if (file.type.startsWith("audio/")) {
      previewUrl = URL.createObjectURL(blob)
      const audio = element("audio", "")
      audio.controls = true
      audio.src = previewUrl
      content.append(audio)
    } else if (file.type === "application/pdf") {
      previewUrl = URL.createObjectURL(blob)
      const frame = element("iframe", "files-pdf-preview")
      frame.title = file.name
      frame.setAttribute("sandbox", "allow-scripts")
      frame.src = previewUrl
      content.append(frame)
    } else content.append(element("p", "", "此格式不提供内嵌预览，可导出原文件。"))
    content.append(
      element("p", "files-metadata", `${file.name} · ${size(file.size)} · ${file.source}`),
    )
  }
  let renderedFiles: readonly WorkspaceFile[] | null = null
  const render = (): void => {
    const snapshot = service.read()
    if (snapshot.error) report(snapshot.error)
    if (renderedFiles !== snapshot.files) {
      renderedFiles = snapshot.files
      list.replaceChildren()
      for (const file of snapshot.files) {
        const row = button("")
        row.className = "files-row"
        row.dataset["fileId"] = file.id
        row.append(
          element(
            "span",
            "files-glyph",
            file.type.startsWith("image/") ? "▧" : file.type.startsWith("audio/") ? "♪" : "▤",
          ),
          element("strong", "", file.name),
          element("span", "files-metadata", `${size(file.size)} · ${file.source}`),
        )
        list.append(row)
      }
      if (!snapshot.files.length)
        list.append(
          element(
            "p",
            "files-empty",
            snapshot.ready ? "下载和保存的文件会出现在这里，电脑与手机共享。" : "正在打开文件存储…",
          ),
        )
      if (selected && !snapshot.files.some((file) => file.id === selected?.id)) closePreview()
    }
    transfers.replaceChildren()
    for (const transfer of snapshot.transfers.slice(0, 12)) {
      const row = element("div", "files-transfer")
      row.dataset["transferId"] = transfer.id
      const label = {
        loading: "下载中",
        saving: "保存中",
        complete: "已保存",
        error: "失败",
        cancelled: "已取消",
      }[transfer.status]
      row.append(
        element("strong", "", transfer.name),
        element("span", "", transfer.error ?? `${label} · ${size(transfer.received)}`),
      )
      if (["loading", "saving"].includes(transfer.status)) {
        const progress = element("progress", "")
        progress.setAttribute("aria-label", `下载 ${transfer.name}`)
        if (transfer.total !== null) {
          progress.max = transfer.total
          progress.value = transfer.received
        }
        const cancel = button("取消下载")
        cancel.dataset["cancelTransfer"] = transfer.id
        row.append(progress, cancel)
      } else if (["error", "cancelled"].includes(transfer.status)) {
        const retry = button("重试下载")
        retry.dataset["retryTransfer"] = transfer.id
        row.append(retry)
      }
      transfers.append(row)
    }
  }
  const cleanups = [
    service.subscribe(render),
    listen(list, "click", (event) => {
      if (event.target instanceof Element) {
        const id = event.target.closest<HTMLElement>("[data-file-id]")?.dataset["fileId"]
        if (id) perform(() => open(id))
      }
    }),
    listen(close, "click", closePreview),
    listen(downloads, "click", () => {
      notes.element.hidden = true
      closePreview()
    }),
    listen(notesTab, "click", () => {
      closePreview()
      panel.hidden = true
      notes.element.hidden = false
    }),
    listen(importButton, "click", () => upload.click()),
    listen(upload, "change", () => {
      const imported = Array.from(upload.files ?? [])
      upload.value = ""
      perform(async () => {
        for (const file of imported) await service.save(file, file.name, "导入")
      }, "已保存到共享下载。")
    }),
    listen(rename, "submit", (event) => {
      event.preventDefault()
      if (selected) {
        const id = selected.id
        perform(() => service.rename(id, name.value), "文件已重命名。")
      }
    }),
    listen(remove, "click", () => {
      confirmation.hidden = false
      keep.focus()
    }),
    listen(keep, "click", () => {
      confirmation.hidden = true
      remove.focus()
    }),
    listen(confirm, "click", () => {
      if (selected) {
        const id = selected.id
        perform(() => service.remove(id), "文件已删除。")
      }
    }),
    listen(exportFile, "click", () => {
      const file = service.read().files.find((entry) => entry.id === selected?.id)
      if (!file) return
      perform(async () => {
        const blob = await service.blob(file.id)
        if (disposed) return
        const url = URL.createObjectURL(blob)
        const anchor = element("a", "")
        anchor.href = url
        anchor.download = file.name
        anchor.hidden = true
        root.append(anchor)
        anchor.click()
        anchor.remove()
        exportUrls.set(
          url,
          setTimeout(() => {
            URL.revokeObjectURL(url)
            exportUrls.delete(url)
          }, 30000),
        )
      }, "已交给真实浏览器下载。")
    }),
    listen(transfers, "click", (event) => {
      if (!(event.target instanceof Element)) return
      const target = event.target.closest<HTMLElement>("button")
      if (target?.dataset["cancelTransfer"]) service.cancel(target.dataset["cancelTransfer"])
      if (target?.dataset["retryTransfer"]) service.retry(target.dataset["retryTransfer"])
    }),
  ]
  render()
  return {
    element: root,
    dispose: () => {
      disposed = true
      clearPreview()
      notes.dispose()
      for (const cleanup of cleanups) cleanup()
      for (const [url, timer] of exportUrls) {
        clearTimeout(timer)
        URL.revokeObjectURL(url)
      }
      exportUrls.clear()
    },
  }
}
