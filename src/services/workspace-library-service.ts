export type WorkspacePhoto = {
  readonly id: string
  readonly fileName: string
  readonly mimeType: string
  readonly size: number
  readonly addedAt: number
  readonly width: number
  readonly height: number
}

export type WorkspaceRecording = {
  readonly id: string
  readonly title: string
  readonly fileName: string
  readonly mimeType: string
  readonly size: number
  readonly addedAt: number
  readonly durationMs: number
}

export type WorkspaceLibrarySnapshot = {
  readonly photos: readonly WorkspacePhoto[]
  readonly recordings: readonly WorkspaceRecording[]
  readonly storageStatus: "loading" | "ready" | "unavailable"
  readonly storageError: string | null
  readonly importing: boolean
  readonly photoError: string | null
  readonly recording: {
    readonly status: "idle" | "requesting" | "recording" | "paused" | "saving"
    readonly durationMs: number
    readonly error: string | null
  }
  readonly playback: {
    readonly recordingId: string | null
    readonly status: "idle" | "loading" | "playing" | "paused" | "error"
    readonly currentTime: number
    readonly duration: number
    readonly error: string | null
  }
}

export interface WorkspaceLibraryService {
  read(): WorkspaceLibrarySnapshot
  subscribe(listener: (snapshot: WorkspaceLibrarySnapshot) => void): () => void
  importPhotos(files: readonly File[]): Promise<void>
  photoUrl(id: string): string | null
  photoBlob(id: string): Blob | null
  removePhoto(id: string): Promise<void>
  startRecording(): Promise<void>
  pauseRecording(): void
  resumeRecording(): void
  stopRecording(): void
  cancelRecording(): void
  renameRecording(id: string, title: string): Promise<void>
  removeRecording(id: string): Promise<void>
  recordingBlob(id: string): Blob | null
  playRecording(id: string): Promise<void>
  pausePlayback(): void
  seekPlayback(seconds: number): void
  dispose(): void
}

type StoredPhoto = WorkspacePhoto & { readonly blob: Blob }
type StoredRecording = WorkspaceRecording & { readonly blob: Blob }
type LibraryStore = "photos" | "recordings"
type Capture = {
  readonly recorder: MediaRecorder
  readonly stream: MediaStream
  readonly chunks: Blob[]
  readonly cleanup: (() => void)[]
  elapsedMs: number
  startedAt: number | null
  cancelled: boolean
  stopping: boolean
}

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
])

const openLibrary = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Local storage is unavailable in this browser."))
      return
    }
    const request = indexedDB.open("todou-workspace-library", 1)
    let settled = false
    const timeout = setTimeout(() => {
      settled = true
      reject(new Error("Local storage did not open. Close other TODŌU tabs and reload."))
    }, 5000)
    request.onupgradeneeded = () => {
      for (const name of ["photos", "recordings"]) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name, { keyPath: "id" })
        }
      }
    }
    request.onsuccess = () => {
      clearTimeout(timeout)
      if (settled) request.result.close()
      else {
        settled = true
        resolve(request.result)
      }
    }
    request.onerror = () => {
      clearTimeout(timeout)
      if (settled) return
      settled = true
      reject(request.error ?? new Error("Local storage could not be opened."))
    }
  })

const validStored = (value: unknown): value is StoredPhoto | StoredRecording => {
  if (typeof value !== "object" || value === null) return false
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "fileName" in value &&
    typeof value.fileName === "string" &&
    "mimeType" in value &&
    typeof value.mimeType === "string" &&
    "size" in value &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    "addedAt" in value &&
    typeof value.addedAt === "number" &&
    Number.isFinite(value.addedAt) &&
    "blob" in value &&
    value.blob instanceof Blob &&
    value.blob.size > 0 &&
    (("width" in value &&
      typeof value.width === "number" &&
      value.width > 0 &&
      "height" in value &&
      typeof value.height === "number" &&
      value.height > 0) ||
      ("title" in value &&
        typeof value.title === "string" &&
        "durationMs" in value &&
        typeof value.durationMs === "number" &&
        Number.isFinite(value.durationMs) &&
        value.durationMs >= 0))
  )
}

const readStore = (database: IDBDatabase, name: LibraryStore): Promise<unknown[]> =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction(name, "readonly")
    const request = transaction.objectStore(name).getAll()
    transaction.oncomplete = () => resolve(request.result as unknown[])
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("The library could not be read."))
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("The library could not be read."))
  })

const imageDimensions = async (file: File): Promise<{ width: number; height: number }> => {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file)
    const dimensions = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return dimensions
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

const microphoneError = (error: unknown): string => {
  const name = error instanceof DOMException ? error.name : ""
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was denied. Allow the microphone in your browser’s site settings, then try again."
  }
  if (name === "NotFoundError") return "No microphone was found. Connect one and try again."
  if (name === "NotReadableError")
    return "The microphone is unavailable. Check whether another app is using it."
  return error instanceof Error ? error.message : "Recording could not start. Please try again."
}

export const createWorkspaceLibraryService = (): WorkspaceLibraryService => {
  const photos = new Map<string, StoredPhoto>()
  const recordings = new Map<string, StoredRecording>()
  const photoUrls = new Map<string, string>()
  const listeners = new Set<(snapshot: WorkspaceLibrarySnapshot) => void>()
  const audio = new Audio()
  audio.preload = "metadata"
  let snapshot: WorkspaceLibrarySnapshot = Object.freeze({
    photos: Object.freeze([]),
    recordings: Object.freeze([]),
    storageStatus: "loading",
    storageError: null,
    importing: false,
    photoError: null,
    recording: Object.freeze({ status: "idle", durationMs: 0, error: null }),
    playback: Object.freeze({
      recordingId: null,
      status: "idle",
      currentTime: 0,
      duration: 0,
      error: null,
    }),
  })
  let database: IDBDatabase | null = null
  let disposed = false
  let pendingImports = 0
  let capture: Capture | null = null
  let captureGeneration = 0
  let captureTimer: ReturnType<typeof setInterval> | null = null
  let playbackUrl: string | null = null
  let playbackGeneration = 0
  let wantsPlayback = false

  const publish = (patch: Partial<WorkspaceLibrarySnapshot>): void => {
    if (disposed) return
    snapshot = Object.freeze({ ...snapshot, ...patch })
    for (const listener of listeners) listener(snapshot)
  }
  const setRecording = (patch: Partial<WorkspaceLibrarySnapshot["recording"]>): void => {
    publish({ recording: Object.freeze({ ...snapshot.recording, ...patch }) })
  }
  const setPlayback = (patch: Partial<WorkspaceLibrarySnapshot["playback"]>): void => {
    publish({ playback: Object.freeze({ ...snapshot.playback, ...patch }) })
  }
  const publishPhotos = (): void => {
    publish({
      photos: Object.freeze(
        [...photos.values()].map(({ blob: _blob, ...item }) => Object.freeze(item)),
      ),
    })
  }
  const publishRecordings = (): void => {
    publish({
      recordings: Object.freeze(
        [...recordings.values()].map(({ blob: _blob, ...item }) => Object.freeze(item)),
      ),
    })
  }
  const storageFailure = (error: unknown): void => {
    const detail =
      error instanceof DOMException && error.name === "QuotaExceededError"
        ? "Browser storage is full."
        : error instanceof Error
          ? error.message
          : "Local storage is unavailable."
    publish({
      storageStatus: "unavailable",
      storageError: `${detail} Unsaved items remain available until you reload. Download them to keep a copy.`,
    })
  }
  const ready = openLibrary()
    .then(async (opened) => {
      if (disposed) {
        opened.close()
        return
      }
      database = opened
      opened.onversionchange = () => {
        opened.close()
        database = null
        storageFailure(new Error("Local storage changed in another tab. Reload to reconnect."))
      }
      const [storedPhotos, storedRecordings] = await Promise.all([
        readStore(opened, "photos"),
        readStore(opened, "recordings"),
      ])
      if (disposed) return
      for (const item of storedPhotos.filter(validStored)) {
        if ("width" in item) photos.set(item.id, item)
      }
      for (const item of storedRecordings.filter(validStored)) {
        if ("title" in item) recordings.set(item.id, item)
      }
      publishPhotos()
      publishRecordings()
      publish({ storageStatus: "ready", storageError: null })
    })
    .catch(storageFailure)

  const persist = async (
    name: LibraryStore,
    action: (store: IDBObjectStore) => void,
  ): Promise<boolean> => {
    await ready
    if (disposed || database === null) return false
    try {
      const opened = database
      await new Promise<void>((resolve, reject) => {
        const transaction = opened.transaction(name, "readwrite")
        action(transaction.objectStore(name))
        transaction.oncomplete = () => resolve()
        transaction.onabort = () =>
          reject(transaction.error ?? new Error("This change could not be saved."))
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("This change could not be saved."))
      })
      return true
    } catch (error) {
      storageFailure(error)
      return false
    }
  }

  const stopTracks = (stream: MediaStream): void => {
    for (const track of stream.getTracks()) track.stop()
  }
  const duration = (session: Capture): number =>
    session.elapsedMs +
    (session.startedAt === null ? 0 : Math.max(0, performance.now() - session.startedAt))
  const freezeDuration = (session: Capture): void => {
    session.elapsedMs = duration(session)
    session.startedAt = null
  }
  const clearCaptureTimer = (): void => {
    if (captureTimer !== null) clearInterval(captureTimer)
    captureTimer = null
  }
  const releaseCapture = (session: Capture): void => {
    stopTracks(session.stream)
    for (const cleanup of session.cleanup) cleanup()
    session.cleanup.length = 0
    if (capture === session) {
      capture = null
      clearCaptureTimer()
    }
  }
  const finishCapture = async (session: Capture): Promise<void> => {
    freezeDuration(session)
    const blob = new Blob(session.chunks, {
      type: session.recorder.mimeType || session.chunks[0]?.type || "audio/webm",
    })
    session.chunks.length = 0
    releaseCapture(session)
    if (session.cancelled || disposed) return
    if (blob.size === 0) {
      setRecording({
        status: "idle",
        error: "The microphone produced no audio. Try recording again.",
      })
      return
    }
    const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"
    const addedAt = Date.now()
    const title = `Recording ${new Date(addedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
    const record: StoredRecording = {
      id: crypto.randomUUID(),
      title,
      fileName: `${title.replace(/[^\p{L}\p{N} -]/gu, "")}.${extension}`,
      mimeType: blob.type,
      size: blob.size,
      addedAt,
      durationMs: session.elapsedMs,
      blob,
    }
    await persist("recordings", (store) => store.put(record))
    if (disposed) return
    recordings.set(record.id, record)
    publishRecordings()
    setRecording({ status: "idle", durationMs: 0, error: null })
  }
  const cancelRecording = (): void => {
    if (disposed) return
    captureGeneration += 1
    const session = capture
    if (session !== null) {
      session.cancelled = true
      if (session.recorder.state !== "inactive") session.recorder.stop()
      session.chunks.length = 0
      releaseCapture(session)
    }
    clearCaptureTimer()
    setRecording({ status: "idle", durationMs: 0, error: null })
  }
  const pausePlayback = (): void => {
    if (disposed) return
    playbackGeneration += 1
    wantsPlayback = false
    audio.pause()
    if (snapshot.playback.recordingId !== null) setPlayback({ status: "paused" })
  }
  const clearPlayback = (): void => {
    wantsPlayback = false
    audio.pause()
    audio.removeAttribute("src")
    audio.load()
    if (playbackUrl !== null) URL.revokeObjectURL(playbackUrl)
    playbackUrl = null
  }
  const updatePlaybackTime = (): void => {
    if (playbackUrl === null) return
    const recorded = snapshot.recordings.find((item) => item.id === snapshot.playback.recordingId)
    setPlayback({
      currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      duration: Number.isFinite(audio.duration)
        ? audio.duration
        : (recorded?.durationMs ?? 0) / 1000,
    })
  }
  const playbackFailure = (error: unknown): void => {
    wantsPlayback = false
    setPlayback({
      status: "error",
      error:
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Your browser blocked playback. Press Play to try again."
          : "This recording could not be played by your browser. You can download the original audio.",
    })
  }
  const audioListeners: readonly (readonly [string, () => void])[] = [
    ["timeupdate", updatePlaybackTime],
    ["loadedmetadata", updatePlaybackTime],
    ["durationchange", updatePlaybackTime],
    [
      "playing",
      () => {
        if (wantsPlayback && playbackUrl !== null && !audio.paused)
          setPlayback({ status: "playing", error: null })
      },
    ],
    [
      "pause",
      () => {
        if (audio.paused && playbackUrl !== null && snapshot.playback.status === "playing")
          setPlayback({ status: "paused" })
      },
    ],
    [
      "waiting",
      () => {
        if (wantsPlayback && playbackUrl !== null) setPlayback({ status: "loading" })
      },
    ],
    [
      "ended",
      () => {
        wantsPlayback = false
        setPlayback({ status: "paused" })
        updatePlaybackTime()
      },
    ],
    [
      "error",
      () => {
        if (playbackUrl !== null && audio.error !== null) playbackFailure(audio.error)
      },
    ],
  ]
  for (const [event, handler] of audioListeners) audio.addEventListener(event, handler)

  return {
    read: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => undefined
      listeners.add(listener)
      listener(snapshot)
      return () => {
        listeners.delete(listener)
      }
    },
    async importPhotos(files) {
      if (disposed || files.length === 0) return
      pendingImports += 1
      publish({ importing: true, photoError: null })
      const errors: string[] = []
      try {
        await ready
        for (const file of files) {
          if (disposed) return
          if (!IMAGE_TYPES.has(file.type)) {
            errors.push(`${file.name}: choose a JPEG, PNG, WebP, GIF, AVIF, or BMP image.`)
            continue
          }
          if (file.size === 0 || file.size > MAX_PHOTO_BYTES) {
            errors.push(`${file.name}: images must be nonempty and no larger than 25 MB.`)
            continue
          }
          try {
            const dimensions = await imageDimensions(file)
            if (disposed) return
            if (
              dimensions.width < 1 ||
              dimensions.height < 1 ||
              dimensions.width * dimensions.height > 80_000_000
            ) {
              errors.push(
                `${file.name}: images must have valid dimensions and at most 80 megapixels.`,
              )
              continue
            }
            const record: StoredPhoto = {
              id: crypto.randomUUID(),
              fileName: file.name,
              mimeType: file.type,
              size: file.size,
              addedAt: Date.now(),
              ...dimensions,
              blob: file,
            }
            await persist("photos", (store) => store.put(record))
            if (disposed) return
            photos.set(record.id, record)
            publishPhotos()
          } catch {
            errors.push(`${file.name}: this image could not be decoded. Try another file.`)
          }
        }
      } finally {
        pendingImports -= 1
        publish({
          importing: pendingImports > 0,
          photoError: errors.length > 0 ? errors.join(" ") : null,
        })
      }
    },
    photoUrl(id) {
      if (disposed) return null
      const photo = photos.get(id)
      if (photo === undefined) return null
      let url = photoUrls.get(id)
      if (url === undefined) {
        url = URL.createObjectURL(photo.blob)
        photoUrls.set(id, url)
      }
      return url
    },
    photoBlob: (id) => (disposed ? null : (photos.get(id)?.blob ?? null)),
    async removePhoto(id) {
      if (disposed || !photos.has(id)) return
      const saved = await persist("photos", (store) => store.delete(id))
      if (disposed) return
      if (!saved && database !== null) {
        publish({
          photoError: "The photo could not be deleted from storage. Try again after freeing space.",
        })
        return
      }
      photos.delete(id)
      const url = photoUrls.get(id)
      if (url !== undefined) URL.revokeObjectURL(url)
      photoUrls.delete(id)
      publishPhotos()
    },
    async startRecording() {
      if (disposed || snapshot.recording.status !== "idle") return
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setRecording({
          error:
            "Recording is unavailable. Use a browser with microphone recording support on HTTPS or localhost.",
        })
        return
      }
      pausePlayback()
      const generation = ++captureGeneration
      setRecording({ status: "requesting", durationMs: 0, error: null })
      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (disposed || generation !== captureGeneration) {
          stopTracks(stream)
          return
        }
        const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(
          (type) => MediaRecorder.isTypeSupported(type),
        )
        const recorder =
          mimeType === undefined
            ? new MediaRecorder(stream)
            : new MediaRecorder(stream, { mimeType })
        const session: Capture = {
          recorder,
          stream,
          chunks: [],
          cleanup: [],
          elapsedMs: 0,
          startedAt: null,
          cancelled: false,
          stopping: false,
        }
        capture = session
        const on = <K extends keyof MediaRecorderEventMap>(
          event: K,
          handler: (event: MediaRecorderEventMap[K]) => void,
        ): void => {
          recorder.addEventListener(event, handler)
          session.cleanup.push(() => recorder.removeEventListener(event, handler))
        }
        on("dataavailable", (event) => {
          if (!session.cancelled && event.data.size > 0) session.chunks.push(event.data)
        })
        on("start", () => {
          if (session.stopping || session.cancelled || disposed) return
          session.startedAt = performance.now()
          setRecording({ status: "recording", error: null })
        })
        on("pause", () => {
          if (session.stopping || session.cancelled || disposed) return
          freezeDuration(session)
          setRecording({ status: "paused", durationMs: duration(session) })
        })
        on("resume", () => {
          if (session.stopping || session.cancelled || disposed) return
          session.startedAt = performance.now()
          setRecording({ status: "recording" })
        })
        on("stop", () => {
          void finishCapture(session)
        })
        on("error", () => {
          session.cancelled = true
          if (recorder.state !== "inactive") recorder.stop()
          releaseCapture(session)
          setRecording({
            status: "idle",
            error:
              "The microphone stopped unexpectedly. Your unfinished recording could not be saved. Try again.",
          })
        })
        for (const track of stream.getAudioTracks()) {
          const ended = (): void => {
            if (session.stopping || session.cancelled || disposed) return
            session.stopping = true
            freezeDuration(session)
            setRecording({
              status: "saving",
              error: "The microphone disconnected. Saving the audio recorded so far.",
            })
            if (recorder.state !== "inactive") recorder.stop()
            stopTracks(session.stream)
          }
          track.addEventListener("ended", ended)
          session.cleanup.push(() => track.removeEventListener("ended", ended))
        }
        recorder.start(1000)
        captureTimer = setInterval(() => {
          if (capture === session && snapshot.recording.status === "recording")
            setRecording({ durationMs: duration(session) })
        }, 100)
      } catch (error) {
        if (stream !== null) stopTracks(stream)
        if (capture !== null) releaseCapture(capture)
        if (!disposed && generation === captureGeneration)
          setRecording({ status: "idle", error: microphoneError(error) })
      }
    },
    pauseRecording() {
      if (!disposed && capture?.recorder.state === "recording" && !capture.stopping)
        capture.recorder.pause()
    },
    resumeRecording() {
      if (!disposed && capture?.recorder.state === "paused" && !capture.stopping)
        capture.recorder.resume()
    },
    stopRecording() {
      const session = capture
      if (disposed || session === null || session.stopping || session.recorder.state === "inactive")
        return
      session.stopping = true
      freezeDuration(session)
      setRecording({ status: "saving", durationMs: session.elapsedMs })
      clearCaptureTimer()
      session.recorder.stop()
      stopTracks(session.stream)
    },
    cancelRecording,
    async renameRecording(id, title) {
      const record = recordings.get(id)
      if (disposed || record === undefined) return
      const name = title.trim().slice(0, 120)
      if (!name) {
        setRecording({ error: "Give this recording a name before saving." })
        return
      }
      const updated: StoredRecording = { ...record, title: name }
      const saved = await persist("recordings", (store) => store.put(updated))
      if (disposed) return
      if (!saved && database !== null) {
        setRecording({ error: "The name could not be saved. Please try again." })
        return
      }
      if (!recordings.has(id)) return
      recordings.set(id, updated)
      publishRecordings()
    },
    async removeRecording(id) {
      if (disposed || !recordings.has(id)) return
      const saved = await persist("recordings", (store) => store.delete(id))
      if (disposed) return
      if (!saved && database !== null) {
        setRecording({
          error: "The recording could not be deleted from storage. Please try again.",
        })
        return
      }
      if (snapshot.playback.recordingId === id) {
        playbackGeneration += 1
        clearPlayback()
        setPlayback({ recordingId: null, status: "idle", currentTime: 0, duration: 0, error: null })
      }
      recordings.delete(id)
      publishRecordings()
    },
    recordingBlob: (id) => (disposed ? null : (recordings.get(id)?.blob ?? null)),
    async playRecording(id) {
      if (disposed) return
      const record = recordings.get(id)
      if (record === undefined) return
      if (snapshot.recording.status !== "idle") {
        setPlayback({ error: "Stop or cancel your recording before playing a memo." })
        return
      }
      const generation = ++playbackGeneration
      try {
        if (snapshot.playback.recordingId !== id || playbackUrl === null) {
          clearPlayback()
          playbackUrl = URL.createObjectURL(record.blob)
          audio.src = playbackUrl
          setPlayback({ recordingId: id, currentTime: 0, duration: record.durationMs / 1000 })
        } else if (audio.ended) audio.currentTime = 0
        wantsPlayback = true
        setPlayback({ status: "loading", error: null })
        await audio.play()
      } catch (error) {
        if (!disposed && generation === playbackGeneration) playbackFailure(error)
      }
    },
    pausePlayback,
    seekPlayback(seconds) {
      if (disposed || playbackUrl === null || !Number.isFinite(seconds)) return
      try {
        audio.currentTime = Math.min(snapshot.playback.duration, Math.max(0, seconds))
        updatePlaybackTime()
      } catch {
        setPlayback({ error: "This recording cannot seek yet. Wait for it to load and try again." })
      }
    },
    dispose() {
      if (disposed) return
      cancelRecording()
      disposed = true
      playbackGeneration += 1
      for (const [event, handler] of audioListeners) audio.removeEventListener(event, handler)
      clearPlayback()
      for (const url of photoUrls.values()) URL.revokeObjectURL(url)
      photoUrls.clear()
      database?.close()
      database = null
      photos.clear()
      recordings.clear()
      listeners.clear()
    },
  }
}
