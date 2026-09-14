export const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024
export type WorkspaceFile = {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly size: number
  readonly addedAt: number
  readonly source: string
}
export type FileTransfer = {
  readonly id: string
  readonly name: string
  readonly status: "loading" | "saving" | "complete" | "cancelled" | "error"
  readonly received: number
  readonly total: number | null
  readonly error: string | null
}
export type FilesSnapshot = {
  readonly files: readonly WorkspaceFile[]
  readonly transfers: readonly FileTransfer[]
  readonly ready: boolean
  readonly error: string | null
}
export type DownloadLoader = (
  signal: AbortSignal,
  progress: (received: number, total: number | null) => void,
) => Promise<{ blob: Blob; name: string }>
export interface WorkspaceFilesService {
  read(): FilesSnapshot
  subscribe(listener: () => void): () => void
  save(blob: Blob, name: string, source: string): Promise<WorkspaceFile>
  blob(id: string): Promise<Blob>
  rename(id: string, name: string): Promise<void>
  remove(id: string): Promise<void>
  download(url: string, name?: string): string
  transfer(name: string, source: string, loader: DownloadLoader): string
  cancel(id: string): void
  retry(id: string): void
  dispose(): void
}
const fileName = (value: string): string =>
  value
    .replace(/[\\/]/g, "_")
    .replace(/\p{Cc}/gu, "_")
    .trim()
    .slice(0, 180) || "未命名文件"
const message = (error: unknown): string =>
  error instanceof DOMException && error.name === "QuotaExceededError"
    ? "存储空间不足，请先删除一些文件。"
    : error instanceof Error
      ? error.message
      : "文件操作失败，请重试。"
const openFiles = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("浏览器存储不可用"))
      return
    }
    const request = indexedDB.open("todou-workspace-files", 1)
    let expired = false
    const timer = setTimeout(() => {
      expired = true
      reject(new Error("文件存储未能打开，请关闭其他旧版页面后重试。"))
    }, 5000)
    request.onupgradeneeded = () => {
      request.result.createObjectStore("entries", { keyPath: "id" })
      request.result.createObjectStore("blobs")
    }
    request.onerror = () => {
      clearTimeout(timer)
      reject(request.error)
    }
    request.onsuccess = () => {
      clearTimeout(timer)
      if (expired) request.result.close()
      else resolve(request.result)
    }
  })
const result = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
const committed = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error("文件保存已取消"))
    transaction.onerror = () => reject(transaction.error)
  })
export const fetchDownload = async (
  url: string,
  signal: AbortSignal,
  progress: (received: number, total: number | null) => void,
  name?: string,
): Promise<{ blob: Blob; name: string }> => {
  const address = new URL(url)
  if (
    (address.protocol !== "https:" &&
      !(address.protocol === "http:" && ["localhost", "127.0.0.1"].includes(address.hostname))) ||
    address.username ||
    address.password
  )
    throw new Error("仅支持无登录凭据的 HTTPS 下载。")
  const response = await fetch(address, { signal, credentials: "omit" })
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`)
  const declared = Number(response.headers.get("content-length"))
  const total = declared > 0 && Number.isFinite(declared) ? declared : null
  if (total !== null && total > MAX_DOWNLOAD_BYTES) {
    await response.body?.cancel()
    throw new Error("单个文件不能超过 50 MB")
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error("下载内容不可读取")
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let received = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) break
      received += chunk.value.byteLength
      if (received > MAX_DOWNLOAD_BYTES) throw new Error("单个文件不能超过 50 MB")
      chunks.push(new Uint8Array(chunk.value))
      progress(received, total !== null && received <= total ? total : null)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  return {
    blob: new Blob(chunks, {
      type: response.headers.get("content-type") ?? "application/octet-stream",
    }),
    name: name || decodeURIComponent(address.pathname.split("/").pop() || "下载文件"),
  }
}
export const createWorkspaceFilesService = (): WorkspaceFilesService => {
  let files: readonly WorkspaceFile[] = []
  let ready = false
  let error: string | null = null
  let disposed = false
  const listeners = new Set<() => void>()
  const transfers = new Map<string, FileTransfer>()
  const jobs = new Map<
    string,
    { loader: DownloadLoader; source: string; controller: AbortController }
  >()
  const emit = (): void => {
    if (!disposed) for (const listener of listeners) listener()
  }
  const database = openFiles()
  const initialized = database
    .then(async (db) => {
      if (disposed) {
        db.close()
        return
      }
      db.onversionchange = () => {
        db.close()
        error = "文件存储已更新，请刷新页面。"
        emit()
      }
      files = await result<WorkspaceFile[]>(
        db.transaction("entries").objectStore("entries").getAll(),
      )
      ready = true
      emit()
    })
    .catch((reason: unknown) => {
      error = message(reason)
      emit()
    })
  const save = async (
    blob: Blob,
    name: string,
    source: string,
    signal?: AbortSignal,
  ): Promise<WorkspaceFile> => {
    try {
      if (blob.size > MAX_DOWNLOAD_BYTES) throw new Error("单个文件不能超过 50 MB")
      await initialized
      if (disposed) throw new Error("文件服务已关闭")
      signal?.throwIfAborted()
      const db = await database
      const file: WorkspaceFile = {
        id: crypto.randomUUID(),
        name: fileName(name),
        type: blob.type,
        size: blob.size,
        addedAt: Date.now(),
        source: source.slice(0, 80),
      }
      const tx = db.transaction(["entries", "blobs"], "readwrite")
      const done = committed(tx)
      const abort = (): void => {
        try {
          tx.abort()
        } catch {
          /* Transaction already settled. */
        }
      }
      signal?.addEventListener("abort", abort, { once: true })
      try {
        tx.objectStore("entries").put(file)
        tx.objectStore("blobs").put(blob, file.id)
        await done
      } catch (reason) {
        // A synchronous put failure must abort the transaction too; otherwise the
        // metadata write can commit without its matching blob.
        abort()
        await done.catch(() => undefined)
        throw reason
      } finally {
        signal?.removeEventListener("abort", abort)
      }
      files = [file, ...files]
      error = null
      emit()
      return file
    } catch (reason) {
      if (!signal?.aborted) {
        error = message(reason)
        emit()
      }
      throw reason
    }
  }
  const run = async (id: string): Promise<void> => {
    const job = jobs.get(id)
    const entry = transfers.get(id)
    if (!job || !entry || disposed) return
    const { signal } = job.controller
    const patch = (changes: Partial<FileTransfer>): void => {
      if (jobs.get(id) !== job || disposed) return
      const previous = transfers.get(id)
      if (previous) transfers.set(id, { ...previous, ...changes })
      emit()
    }
    patch({ status: "loading", error: null, received: 0, total: null })
    try {
      const output = await job.loader(signal, (received, total) => {
        if (signal.aborted) return
        if (!Number.isFinite(received) || received < 0 || received > MAX_DOWNLOAD_BYTES)
          throw new Error("下载超过 50 MB 或进度无效")
        patch({
          received,
          total: total !== null && Number.isFinite(total) && total > 0 ? total : null,
        })
      })
      signal.throwIfAborted()
      patch({ status: "saving", name: fileName(output.name), received: output.blob.size })
      await save(output.blob, output.name, job.source, signal)
      patch({ status: "complete", received: output.blob.size, total: output.blob.size })
    } catch (reason) {
      patch({
        status: signal.aborted ? "cancelled" : "error",
        error: signal.aborted ? null : message(reason),
      })
    }
  }
  const transfer = (name: string, source: string, loader: DownloadLoader): string => {
    const id = crypto.randomUUID()
    transfers.set(id, {
      id,
      name: fileName(name),
      status: "loading",
      received: 0,
      total: null,
      error: null,
    })
    jobs.set(id, { loader, source, controller: new AbortController() })
    void run(id)
    return id
  }
  return {
    read: () => ({ files, transfers: [...transfers.values()].reverse(), ready, error }),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    save,
    blob: async (id) => {
      await initialized
      const db = await database
      const blob: unknown = await result(db.transaction("blobs").objectStore("blobs").get(id))
      if (!(blob instanceof Blob)) throw new Error("找不到此文件，可能已在另一设备中删除。")
      return blob
    },
    rename: async (id, name) => {
      await initialized
      const existing = files.find((file) => file.id === id)
      if (!existing) throw new Error("找不到此文件")
      const updated = { ...existing, name: fileName(name) }
      const db = await database
      const tx = db.transaction("entries", "readwrite")
      const done = committed(tx)
      tx.objectStore("entries").put(updated)
      await done
      files = files.map((file) => (file.id === id ? updated : file))
      emit()
    },
    remove: async (id) => {
      await initialized
      const db = await database
      const tx = db.transaction(["entries", "blobs"], "readwrite")
      const done = committed(tx)
      tx.objectStore("entries").delete(id)
      tx.objectStore("blobs").delete(id)
      await done
      files = files.filter((file) => file.id !== id)
      emit()
    },
    download: (url, name) =>
      transfer(name || "下载文件", "浏览器", (signal, progress) =>
        fetchDownload(url, signal, progress, name),
      ),
    transfer,
    cancel: (id) => {
      const current = transfers.get(id)
      if (!current || !["loading", "saving"].includes(current.status)) return
      jobs.get(id)?.controller.abort()
      transfers.set(id, { ...current, status: "cancelled", error: null })
      emit()
    },
    retry: (id) => {
      const job = jobs.get(id)
      const current = transfers.get(id)
      if (!job || !current || !["error", "cancelled"].includes(current.status)) return
      jobs.set(id, { ...job, controller: new AbortController() })
      void run(id)
    },
    dispose: () => {
      disposed = true
      for (const job of jobs.values()) job.controller.abort()
      listeners.clear()
      void database.then((db) => db.close()).catch(() => undefined)
    },
  }
}
