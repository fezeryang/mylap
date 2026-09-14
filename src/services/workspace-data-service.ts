export type WorkspaceNote = {
  readonly id: string
  readonly title: string
  readonly text: string
  readonly updatedAt: number
}

export type WorkspaceReminder = {
  readonly id: string
  readonly text: string
  readonly completed: boolean
}

export type WorkspaceEvent = {
  readonly id: string
  readonly title: string
  readonly date: string
  readonly time: string
}

export type WorkspacePreferences = {
  readonly appearance: "light" | "dark"
  readonly wallpaper: "sunrise" | "ocean" | "lavender"
  readonly reducedMotion: boolean
}

export type WorkspaceDataSnapshot = {
  readonly notes: readonly WorkspaceNote[]
  readonly reminders: readonly WorkspaceReminder[]
  readonly events: readonly WorkspaceEvent[]
  readonly preferences: WorkspacePreferences
  readonly storageError: string | null
}

type NotePatch = { readonly title?: string; readonly text?: string }
type EventInput = { readonly title: string; readonly date: string; readonly time: string }
type Listener = (snapshot: WorkspaceDataSnapshot) => void
type WorkspaceData = Omit<WorkspaceDataSnapshot, "storageError">

export type WorkspaceDataService = {
  read(): WorkspaceDataSnapshot
  subscribe(listener: Listener): () => void
  createNote(title?: string, text?: string): string
  updateNote(id: string, patch: NotePatch): void
  deleteNote(id: string): void
  addReminder(text: string): void
  toggleReminder(id: string): void
  deleteReminder(id: string): void
  addEvent(event: EventInput): void
  deleteEvent(id: string): void
  setPreferences(patch: Partial<WorkspacePreferences>): void
  dispose(): void
}

const STORAGE_KEY = "todou.workspace.data"
const LEGACY_STORAGE_KEY = "todou.workspace.note"
const STORAGE_ERROR = "Changes are kept in memory because browser storage is unavailable."
const INVALID_STORAGE_ERROR =
  "Saved workspace data could not be read. It will be replaced when you make a change."

const emptyData = (): WorkspaceData => ({
  notes: [],
  reminders: [],
  events: [],
  preferences: { appearance: "light", wallpaper: "sunrise", reducedMotion: false },
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0

const isDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const isTime = (value: unknown): value is string =>
  typeof value === "string" && (value === "" || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))

const isNote = (value: unknown): value is WorkspaceNote => {
  if (!isRecord(value)) return false
  const { id, title, text, updatedAt } = value
  return (
    isId(id) &&
    typeof title === "string" &&
    typeof text === "string" &&
    typeof updatedAt === "number" &&
    Number.isFinite(updatedAt) &&
    updatedAt >= 0
  )
}

const isReminder = (value: unknown): value is WorkspaceReminder => {
  if (!isRecord(value)) return false
  const { id, text, completed } = value
  return isId(id) && typeof text === "string" && typeof completed === "boolean"
}

const isEvent = (value: unknown): value is WorkspaceEvent => {
  if (!isRecord(value)) return false
  const { id, title, date, time } = value
  return isId(id) && typeof title === "string" && isDate(date) && isTime(time)
}

const isPreferences = (value: unknown): value is WorkspacePreferences => {
  if (!isRecord(value)) return false
  const { appearance, wallpaper, reducedMotion } = value
  return (
    (appearance === "light" || appearance === "dark") &&
    (wallpaper === "sunrise" || wallpaper === "ocean" || wallpaper === "lavender") &&
    typeof reducedMotion === "boolean"
  )
}

const isCollection = <T extends { readonly id: string }>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): value is T[] => {
  if (!Array.isArray(value) || !value.every(isItem)) return false
  return new Set(value.map((item) => item.id)).size === value.length
}

const parseData = (text: string): WorkspaceData | null => {
  const value: unknown = JSON.parse(text)
  if (!isRecord(value)) return null
  const { version, notes, reminders, events, preferences } = value
  if (
    version !== 1 ||
    !isCollection(notes, isNote) ||
    !isCollection(reminders, isReminder) ||
    !isCollection(events, isEvent) ||
    !isPreferences(preferences)
  ) {
    return null
  }
  return {
    notes: notes.map(({ id, title, text, updatedAt }) => ({
      id,
      title,
      text,
      updatedAt,
    })),
    reminders: reminders.map(({ id, text, completed }) => ({ id, text, completed })),
    events: events.map(({ id, title, date, time }) => ({ id, title, date, time })),
    preferences: {
      appearance: preferences.appearance,
      wallpaper: preferences.wallpaper,
      reducedMotion: preferences.reducedMotion,
    },
  }
}

const freezeSnapshot = (data: WorkspaceData, storageError: string | null): WorkspaceDataSnapshot =>
  Object.freeze({
    notes: Object.freeze(data.notes.map((note) => Object.freeze(note))),
    reminders: Object.freeze(data.reminders.map((reminder) => Object.freeze(reminder))),
    events: Object.freeze(data.events.map((event) => Object.freeze(event))),
    preferences: Object.freeze(data.preferences),
    storageError,
  })

let fallbackId = 0
const createId = (kind: string): string => {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid !== undefined) return `${kind}-${uuid}`
  fallbackId += 1
  return `${kind}-${Date.now().toString(36)}-${fallbackId}-${Math.random().toString(36).slice(2)}`
}

export const createWorkspaceDataService = (storage?: Storage): WorkspaceDataService => {
  let data = emptyData()
  let storageError: string | null = null
  let migrated = false

  try {
    storage ??= globalThis.localStorage
    const saved = storage?.getItem(STORAGE_KEY)
    if (saved != null) {
      try {
        const parsed = parseData(saved)
        if (parsed === null) storageError = INVALID_STORAGE_ERROR
        else data = parsed
      } catch {
        storageError = INVALID_STORAGE_ERROR
      }
    } else {
      const legacyText = storage?.getItem(LEGACY_STORAGE_KEY)
      if (legacyText != null) {
        data = {
          ...data,
          notes: [
            {
              id: createId("note"),
              title: "Workspace note",
              text: legacyText,
              updatedAt: Date.now(),
            },
          ],
        }
        migrated = true
      }
    }
  } catch {
    storageError = STORAGE_ERROR
  }

  const persist = (next: WorkspaceData): string | null => {
    if (storage === undefined) return storageError
    try {
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          notes: next.notes,
          reminders: next.reminders,
          events: next.events,
          preferences: next.preferences,
        }),
      )
      return null
    } catch {
      return STORAGE_ERROR
    }
  }

  if (migrated) storageError = persist(data)
  let snapshot = freezeSnapshot(data, storageError)
  let disposed = false
  const listeners = new Set<Listener>()

  const commit = (next: WorkspaceData): void => {
    snapshot = freezeSnapshot(next, persist(next))
    const notification = snapshot
    for (const listener of [...listeners]) {
      if (listeners.has(listener)) listener(notification)
    }
  }

  return {
    read: () => snapshot,
    subscribe(listener) {
      if (!disposed) listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    createNote(title = "Untitled note", text = "") {
      if (disposed) throw new Error("Workspace data service has been disposed")
      const id = createId("note")
      commit({
        ...snapshot,
        notes: [{ id, title, text, updatedAt: Date.now() }, ...snapshot.notes],
      })
      return id
    },
    updateNote(id, patch) {
      if (disposed || !snapshot.notes.some((note) => note.id === id)) return
      commit({
        ...snapshot,
        notes: snapshot.notes.map((note) =>
          note.id === id
            ? {
                ...note,
                title: patch.title ?? note.title,
                text: patch.text ?? note.text,
                updatedAt: Date.now(),
              }
            : note,
        ),
      })
    },
    deleteNote(id) {
      if (disposed || !snapshot.notes.some((note) => note.id === id)) return
      commit({ ...snapshot, notes: snapshot.notes.filter((note) => note.id !== id) })
    },
    addReminder(text) {
      if (disposed || text.trim() === "") return
      commit({
        ...snapshot,
        reminders: [
          ...snapshot.reminders,
          { id: createId("reminder"), text: text.trim(), completed: false },
        ],
      })
    },
    toggleReminder(id) {
      if (disposed || !snapshot.reminders.some((reminder) => reminder.id === id)) return
      commit({
        ...snapshot,
        reminders: snapshot.reminders.map((reminder) =>
          reminder.id === id ? { ...reminder, completed: !reminder.completed } : reminder,
        ),
      })
    },
    deleteReminder(id) {
      if (disposed || !snapshot.reminders.some((reminder) => reminder.id === id)) return
      commit({
        ...snapshot,
        reminders: snapshot.reminders.filter((reminder) => reminder.id !== id),
      })
    },
    addEvent(event) {
      if (disposed || event.title.trim() === "") return
      if (!isDate(event.date) || !isTime(event.time)) {
        throw new RangeError("Events need a valid date and time")
      }
      commit({
        ...snapshot,
        events: [
          ...snapshot.events,
          { ...event, title: event.title.trim(), id: createId("event") },
        ],
      })
    },
    deleteEvent(id) {
      if (disposed || !snapshot.events.some((event) => event.id === id)) return
      commit({ ...snapshot, events: snapshot.events.filter((event) => event.id !== id) })
    },
    setPreferences(patch) {
      if (disposed) return
      const preferences = { ...snapshot.preferences, ...patch }
      if (!isPreferences(preferences)) throw new TypeError("Invalid workspace preferences")
      commit({ ...snapshot, preferences })
    },
    dispose() {
      disposed = true
      listeners.clear()
    },
  }
}
