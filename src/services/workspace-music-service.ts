import type { RadioMediaService } from "./radio-contracts"
import { pauseRadio } from "./radio-physical-controls"

export type WorkspaceMusicTrack = {
  readonly id: string
  readonly title: string
  readonly fileName: string
  readonly mimeType: string
  readonly size: number
  readonly addedAt: number
}

export type WorkspaceMusicSource = "library" | "radio"

export type WorkspaceMusicSnapshot = {
  readonly source: WorkspaceMusicSource
  readonly tracks: readonly WorkspaceMusicTrack[]
  readonly activeTrackId: string | null
  readonly status: "idle" | "loading" | "playing" | "paused" | "error"
  readonly currentTime: number
  readonly duration: number
  readonly volume: number
  readonly importing: boolean
  readonly storageStatus: "loading" | "ready" | "unavailable"
  readonly storageError: string | null
  readonly error: string | null
}

export interface WorkspaceMusicService {
  read(): WorkspaceMusicSnapshot
  subscribe(listener: (snapshot: WorkspaceMusicSnapshot) => void): () => void
  setSource(source: WorkspaceMusicSource): void
  importFiles(files: readonly File[]): Promise<void>
  play(id?: string): Promise<void>
  pause(): void
  next(): void
  previous(): void
  seek(seconds: number): void
  setVolume(volume: number): void
  remove(id: string): void
  dispose(): void
}

type StoredTrack = WorkspaceMusicTrack & {
  readonly blob: Blob
  readonly lastModified: number
}

const DATABASE_NAME = "todou-music-library"
const STORE_NAME = "tracks"
const AUDIO_FILE = /\.(mp3|m4a|aac|wav|wave|ogg|oga|opus|flac|webm|aiff|aif)$/i

const isStoredTrack = (value: unknown): value is StoredTrack => {
  if (typeof value !== "object" || value === null) return false
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "fileName" in value &&
    typeof value.fileName === "string" &&
    "mimeType" in value &&
    typeof value.mimeType === "string" &&
    "size" in value &&
    typeof value.size === "number" &&
    "addedAt" in value &&
    typeof value.addedAt === "number" &&
    "lastModified" in value &&
    typeof value.lastModified === "number" &&
    "blob" in value &&
    value.blob instanceof Blob
  )
}

const openLibrary = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Local music storage is unavailable in this browser."))
      return
    }
    const request = indexedDB.open(DATABASE_NAME, 1)
    let settled = false
    const timeout = setTimeout(() => {
      settled = true
      reject(new Error("Local music storage did not open. Close other TODŌU tabs and reload."))
    }, 5000)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
    }
    request.onsuccess = () => {
      clearTimeout(timeout)
      if (settled) {
        request.result.close()
        return
      }
      settled = true
      resolve(request.result)
    }
    request.onerror = () => {
      clearTimeout(timeout)
      if (settled) return
      settled = true
      reject(request.error ?? new Error("Local music storage could not be opened."))
    }
  })

const readLibrary = (database: IDBDatabase): Promise<readonly StoredTrack[]> =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly")
    const request = transaction.objectStore(STORE_NAME).getAll()
    let records: readonly StoredTrack[] = []
    request.onsuccess = () => {
      const result: unknown = request.result
      records = Array.isArray(result) ? result.filter(isStoredTrack) : []
    }
    transaction.oncomplete = () => resolve(records)
    transaction.onabort = () => reject(transaction.error ?? new Error("Could not read your music."))
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not read your music."))
  })

const writeLibrary = (
  database: IDBDatabase,
  action: (store: IDBObjectStore) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    action(transaction.objectStore(STORE_NAME))
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error("Your music was not saved."))
    transaction.onerror = () => reject(transaction.error ?? new Error("Your music was not saved."))
  })

const trackMetadata = (track: StoredTrack): WorkspaceMusicTrack =>
  Object.freeze({
    id: track.id,
    title: track.title,
    fileName: track.fileName,
    mimeType: track.mimeType,
    size: track.size,
    addedAt: track.addedAt,
  })

const playbackError = (error: unknown): string => {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Your browser paused playback. Press Play to listen."
  }
  if (error instanceof DOMException && error.name === "NotSupportedError") {
    return "This audio format cannot be played by your browser. Try an MP3 or WAV file."
  }
  return "This audio file could not be played. Try another file."
}

export const createWorkspaceMusicService = (
  radioService: RadioMediaService,
): WorkspaceMusicService => {
  const audio = new Audio()
  audio.preload = "metadata"
  audio.volume = 0.7
  const records = new Map<string, StoredTrack>()
  const listeners = new Set<(snapshot: WorkspaceMusicSnapshot) => void>()
  let snapshot: WorkspaceMusicSnapshot = Object.freeze({
    source: "library",
    tracks: Object.freeze([]),
    activeTrackId: null,
    status: "idle",
    currentTime: 0,
    duration: 0,
    volume: audio.volume,
    importing: false,
    storageStatus: "loading",
    storageError: null,
    error: null,
  })
  let database: IDBDatabase | null = null
  let sourceUrl: string | null = null
  let disposed = false
  let playGeneration = 0
  let pendingImports = 0
  let wantsPlayback = false

  const publish = (patch: Partial<WorkspaceMusicSnapshot>): void => {
    if (disposed) return
    snapshot = Object.freeze({ ...snapshot, ...patch })
    for (const listener of listeners) listener(snapshot)
  }
  const publishTracks = (): void => {
    publish({ tracks: Object.freeze([...records.values()].map(trackMetadata)) })
  }
  const storageFailure = (error: unknown): void => {
    const detail =
      error instanceof DOMException && error.name === "QuotaExceededError"
        ? "Browser storage is full."
        : error instanceof Error
          ? error.message
          : "Local music storage is unavailable."
    publish({
      storageStatus: "unavailable",
      storageError: `${detail} New music is available for this session; it may not survive a reload.`,
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
        storageFailure(new Error("Local music storage changed in another tab."))
      }
      const stored = await readLibrary(opened)
      if (disposed) return
      for (const record of [...stored].sort((left, right) => left.addedAt - right.addedAt)) {
        records.set(record.id, record)
      }
      publishTracks()
      publish({ storageStatus: "ready", storageError: null })
    })
    .catch(storageFailure)

  const persist = async (action: (store: IDBObjectStore) => void): Promise<void> => {
    if (database === null || disposed) return
    try {
      await writeLibrary(database, action)
    } catch (error) {
      storageFailure(error)
    }
  }

  const pause = (): void => {
    if (disposed) return
    playGeneration += 1
    wantsPlayback = false
    audio.pause()
    if (snapshot.activeTrackId !== null) publish({ status: "paused" })
  }
  const clearSource = (): void => {
    wantsPlayback = false
    audio.pause()
    audio.removeAttribute("src")
    audio.load()
    if (sourceUrl !== null) URL.revokeObjectURL(sourceUrl)
    sourceUrl = null
  }
  const setSource = (source: WorkspaceMusicSource): void => {
    if (disposed || source === snapshot.source) return
    if (source === "radio") pause()
    else {
      void pauseRadio(radioService).catch(() => {
        publish({ error: "The radio could not be paused. Stop the radio, then try again." })
      })
    }
    publish({ source })
  }
  const play = async (id?: string): Promise<void> => {
    if (disposed) return
    setSource("library")
    const selectedId = id ?? snapshot.activeTrackId ?? snapshot.tracks[0]?.id
    const selected = selectedId === undefined ? undefined : records.get(selectedId)
    if (selected === undefined) {
      publish({ error: "Add an audio file to your library to start listening." })
      return
    }
    const generation = ++playGeneration
    try {
      if (
        snapshot.activeTrackId !== selected.id ||
        sourceUrl === null ||
        snapshot.status === "error"
      ) {
        clearSource()
        sourceUrl = URL.createObjectURL(selected.blob)
        audio.src = sourceUrl
        publish({ activeTrackId: selected.id, currentTime: 0, duration: 0 })
      }
      if (audio.ended) audio.currentTime = 0
      wantsPlayback = true
      publish({ status: "loading", error: null })
      void pauseRadio(radioService).catch(() => {
        if (disposed || generation !== playGeneration) return
        pause()
        publish({ error: "The radio could not be paused. Stop the radio, then try Play again." })
      })
      await audio.play()
    } catch (error) {
      if (disposed || generation !== playGeneration) return
      wantsPlayback = false
      publish({ status: "error", error: playbackError(error) })
    }
  }
  const adjacent = (offset: number): void => {
    const tracks = snapshot.tracks
    if (disposed || tracks.length === 0) return
    const index = tracks.findIndex((track) => track.id === snapshot.activeTrackId)
    const targetIndex = index < 0 ? (offset > 0 ? 0 : tracks.length - 1) : index + offset
    const target = tracks[(targetIndex + tracks.length) % tracks.length]
    if (target !== undefined) void play(target.id)
  }
  const updateTime = (): void => {
    if (sourceUrl === null) return
    publish({
      currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
    })
  }
  const mediaListeners = new Map<string, () => void>([
    ["timeupdate", updateTime],
    ["loadedmetadata", updateTime],
    ["durationchange", updateTime],
    [
      "playing",
      () => {
        if (!wantsPlayback || sourceUrl === null || audio.paused) return
        publish({ status: "playing", error: null })
        updateTime()
      },
    ],
    [
      "pause",
      () => {
        if (audio.paused && sourceUrl !== null && snapshot.status === "playing") {
          publish({ status: "paused" })
        }
      },
    ],
    [
      "waiting",
      () => {
        if (wantsPlayback && sourceUrl !== null) publish({ status: "loading" })
      },
    ],
    [
      "ended",
      () => {
        if (!wantsPlayback) return
        const index = snapshot.tracks.findIndex((track) => track.id === snapshot.activeTrackId)
        const next = snapshot.tracks[index + 1]
        if (next !== undefined) void play(next.id)
        else {
          wantsPlayback = false
          publish({ status: "paused" })
          updateTime()
        }
      },
    ],
    [
      "error",
      () => {
        if (sourceUrl === null || audio.error === null) return
        wantsPlayback = false
        publish({ status: "error", error: playbackError(audio.error) })
      },
    ],
    ["volumechange", () => publish({ volume: audio.volume })],
  ])
  for (const [event, handler] of mediaListeners) audio.addEventListener(event, handler)
  let radioStatus = radioService.read().status
  const unsubscribeRadio = radioService.subscribe((radio) => {
    const enteredPlayback =
      (radio.status === "playing" || radio.status === "loading") &&
      radioStatus !== "playing" &&
      radioStatus !== "loading"
    radioStatus = radio.status
    if (enteredPlayback) {
      if (wantsPlayback) pause()
      if (snapshot.source !== "radio") publish({ source: "radio" })
    }
  })

  return {
    read: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => undefined
      listeners.add(listener)
      listener(snapshot)
      return () => listeners.delete(listener)
    },
    setSource,
    async importFiles(files) {
      if (disposed || files.length === 0) return
      pendingImports += 1
      publish({ importing: true, error: null })
      try {
        await ready
        if (disposed) return
        const added: StoredTrack[] = []
        let rejected = 0
        for (const file of files) {
          if (file.size === 0 || (!file.type.startsWith("audio/") && !AUDIO_FILE.test(file.name))) {
            rejected += 1
            continue
          }
          const duplicate = [...records.values()].some(
            (track) =>
              track.fileName === file.name &&
              track.size === file.size &&
              track.lastModified === file.lastModified,
          )
          if (duplicate) continue
          const track: StoredTrack = {
            id: crypto.randomUUID(),
            title: file.name.replace(/\.[^.]+$/, "").replace(/_/g, " ") || file.name,
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
            addedAt: Date.now(),
            lastModified: file.lastModified,
            blob: file,
          }
          records.set(track.id, track)
          added.push(track)
        }
        publishTracks()
        if (rejected > 0) {
          publish({
            error: `${rejected} empty or unsupported file${rejected === 1 ? " was" : "s were"} skipped. Choose audio files such as MP3, M4A, or WAV.`,
          })
        }
        if (added.length > 0) {
          await persist((store) => {
            for (const track of added) store.put(track)
          })
        }
      } catch {
        publish({ error: "These files could not be imported. Please try again." })
      } finally {
        pendingImports -= 1
        publish({ importing: pendingImports > 0 })
      }
    },
    play,
    pause,
    next: () => adjacent(1),
    previous() {
      if (audio.currentTime > 3) {
        audio.currentTime = 0
        updateTime()
      } else adjacent(-1)
    },
    seek(seconds) {
      if (
        disposed ||
        !Number.isFinite(seconds) ||
        !Number.isFinite(snapshot.duration) ||
        snapshot.duration <= 0
      )
        return
      audio.currentTime = Math.max(0, Math.min(snapshot.duration, seconds))
      updateTime()
    },
    setVolume(volume) {
      if (disposed || !Number.isFinite(volume)) return
      audio.volume = Math.min(1, Math.max(0, volume))
      publish({ volume: audio.volume })
    },
    remove(id) {
      if (disposed || !records.has(id)) return
      if (snapshot.activeTrackId === id) {
        playGeneration += 1
        clearSource()
        publish({ activeTrackId: null, status: "idle", currentTime: 0, duration: 0, error: null })
      }
      records.delete(id)
      publishTracks()
      void persist((store) => store.delete(id))
    },
    dispose() {
      if (disposed) return
      disposed = true
      playGeneration += 1
      unsubscribeRadio()
      for (const [event, handler] of mediaListeners) audio.removeEventListener(event, handler)
      clearSource()
      database?.close()
      database = null
      records.clear()
      listeners.clear()
    },
  }
}
