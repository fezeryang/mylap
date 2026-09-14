import { describe, expect, test } from "bun:test"

import { createWorkspaceDataService, type WorkspaceDataSnapshot } from "./workspace-data-service"

const STORAGE_KEY = "todou.workspace.data"
const LEGACY_STORAGE_KEY = "todou.workspace.note"

class MemoryStorage implements Storage {
  readonly items = new Map<string, string>()
  readsDenied = false
  writesDenied = false

  get length(): number {
    return this.items.size
  }

  clear(): void {
    this.items.clear()
  }

  getItem(key: string): string | null {
    if (this.readsDenied) throw new DOMException("Denied", "SecurityError")
    return this.items.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.items.delete(key)
  }

  setItem(key: string, value: string): void {
    if (this.writesDenied) throw new DOMException("Full", "QuotaExceededError")
    this.items.set(key, value)
  }
}

const first = <T>(items: readonly T[]): T => {
  const value = items[0]
  if (value === undefined) throw new Error("Expected an item")
  return value
}

const validSavedData = () => ({
  version: 1,
  notes: [{ id: "note-saved", title: "Saved note", text: "Keep this", updatedAt: 1 }],
  reminders: [{ id: "reminder-saved", text: "Water plants", completed: false }],
  events: [{ id: "event-saved", title: "Review", date: "2026-09-12", time: "09:30" }],
  preferences: { appearance: "light", wallpaper: "sunrise", reducedMotion: false },
})

describe("workspace data service", () => {
  test("notes retain IDs and independent edits immediately across reloads", () => {
    const storage = new MemoryStorage()
    const service = createWorkspaceDataService(storage)
    const firstId = service.createNote("Trip", "Book a train")
    const secondId = service.createNote()
    const beforeEdit = service.read()

    service.updateNote(firstId, { text: "Book a train\nPack a camera" })
    service.updateNote(secondId, { title: "Ideas", text: "Build something small" })
    const reloaded = createWorkspaceDataService(storage)

    expect(firstId).not.toBe(secondId)
    expect(reloaded.read()).toEqual(service.read())
    expect(reloaded.read().notes.find((note) => note.id === firstId)).toEqual({
      id: firstId,
      title: "Trip",
      text: "Book a train\nPack a camera",
      updatedAt: expect.any(Number),
    })
    expect(beforeEdit.notes.find((note) => note.id === firstId)?.text).toBe("Book a train")
    expect(Object.isFrozen(service.read())).toBe(true)
    expect(Object.isFrozen(first(service.read().notes))).toBe(true)

    service.updateNote(firstId, { title: "", text: "" })
    expect(service.read().notes.find((note) => note.id === firstId)?.text).toBe("")
    service.deleteNote(secondId)
    expect(
      createWorkspaceDataService(storage)
        .read()
        .notes.map((note) => note.id),
    ).toEqual([firstId])
  })

  test("reminders, calendar entries, and preferences persist their real state", () => {
    const storage = new MemoryStorage()
    const service = createWorkspaceDataService(storage)
    service.addReminder("  Pick up prints  ")
    service.addReminder(" ")
    const reminderId = first(service.read().reminders).id
    service.toggleReminder(reminderId)
    service.addEvent({ title: "Studio visit", date: "2026-09-14", time: "14:30" })
    service.addEvent({ title: "Day off", date: "2026-09-15", time: "" })
    service.setPreferences({ wallpaper: "ocean", reducedMotion: true })
    service.setPreferences({ appearance: "dark" })

    const reloaded = createWorkspaceDataService(storage)
    expect(reloaded.read().reminders).toEqual([
      { id: reminderId, text: "Pick up prints", completed: true },
    ])
    expect(reloaded.read().events.map(({ title, date, time }) => ({ title, date, time }))).toEqual([
      { title: "Studio visit", date: "2026-09-14", time: "14:30" },
      { title: "Day off", date: "2026-09-15", time: "" },
    ])
    expect(reloaded.read().preferences).toEqual({
      appearance: "dark",
      wallpaper: "ocean",
      reducedMotion: true,
    })
    reloaded.toggleReminder(reminderId)
    expect(first(reloaded.read().reminders).completed).toBe(false)
    reloaded.deleteReminder(reminderId)
    reloaded.deleteEvent(first(reloaded.read().events).id)
    expect(createWorkspaceDataService(storage).read().reminders).toEqual([])
    expect(first(createWorkspaceDataService(storage).read().events).title).toBe("Day off")
  })

  test("invalid dates and times cannot produce unreadable persisted events", () => {
    const storage = new MemoryStorage()
    const service = createWorkspaceDataService(storage)
    expect(() =>
      service.addEvent({ title: "Impossible day", date: "2026-02-30", time: "09:00" }),
    ).toThrow(RangeError)
    expect(() =>
      service.addEvent({ title: "Impossible time", date: "2026-02-28", time: "25:00" }),
    ).toThrow(RangeError)
    expect(service.read().events).toEqual([])
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })

  test("legacy text migrates once and a later deletion stays deleted", () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_STORAGE_KEY, "Original note\n日本語のメモ")
    const service = createWorkspaceDataService(storage)
    const note = first(service.read().notes)

    expect(note.text).toBe("Original note\n日本語のメモ")
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull()
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBe(note.text)
    expect(createWorkspaceDataService(storage).read().notes).toEqual([note])

    service.deleteNote(note.id)
    expect(createWorkspaceDataService(storage).read().notes).toEqual([])
  })

  test.each([
    "{broken json",
    "null",
    "[]",
    JSON.stringify({ ...validSavedData(), version: 99 }),
    JSON.stringify({ ...validSavedData(), notes: [{ id: "note", text: false }] }),
    JSON.stringify({
      ...validSavedData(),
      notes: [...validSavedData().notes, ...validSavedData().notes],
    }),
    JSON.stringify({ ...validSavedData(), reminders: [{ id: "r", text: "Hi", completed: "yes" }] }),
    JSON.stringify({
      ...validSavedData(),
      events: [{ id: "e", title: "Hi", date: "bad", time: "" }],
    }),
    JSON.stringify({ ...validSavedData(), preferences: { appearance: "unknown" } }),
  ])("invalid saved data remains untouched until a user changes data: %s", (saved) => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, saved)
    storage.setItem(LEGACY_STORAGE_KEY, "Older data")
    const service = createWorkspaceDataService(storage)

    expect(service.read().notes).toEqual([])
    expect(service.read().storageError).not.toBeNull()
    expect(storage.getItem(STORAGE_KEY)).toBe(saved)
    service.deleteNote("missing")
    expect(storage.getItem(STORAGE_KEY)).toBe(saved)

    service.createNote("New", "Explicit change")
    expect(service.read().storageError).toBeNull()
    expect(first(createWorkspaceDataService(storage).read().notes).text).toBe("Explicit change")
  })

  test("subscribers observe shared state and unsubscribe or disposal stops delivery", () => {
    const service = createWorkspaceDataService(new MemoryStorage())
    const phoneSnapshots: WorkspaceDataSnapshot[] = []
    const computerSnapshots: WorkspaceDataSnapshot[] = []
    const unsubscribe = service.subscribe((snapshot) => phoneSnapshots.push(snapshot))
    service.subscribe((snapshot) => computerSnapshots.push(snapshot))

    const id = service.createNote("Shared", "One")
    expect(first(phoneSnapshots)).toBe(first(computerSnapshots))
    unsubscribe()
    unsubscribe()
    service.updateNote(id, { text: "Two" })
    expect(first(first(phoneSnapshots).notes).text).toBe("One")
    expect(first(computerSnapshots[1]?.notes ?? []).text).toBe("Two")

    const beforeDisposal = service.read()
    service.dispose()
    service.dispose()
    service.subscribe((snapshot) => phoneSnapshots.push(snapshot))
    service.updateNote(id, { text: "Three" })
    service.deleteNote(id)
    service.addReminder("After disposal")
    expect(service.read()).toBe(beforeDisposal)
    expect(phoneSnapshots).toHaveLength(1)
    expect(computerSnapshots).toHaveLength(2)
    expect(() => service.createNote()).toThrow("disposed")
  })

  test("quota errors preserve memory and old saved data, then a successful edit recovers", () => {
    const storage = new MemoryStorage()
    const service = createWorkspaceDataService(storage)
    const id = service.createNote("Draft", "Saved")
    const saved = storage.getItem(STORAGE_KEY)
    const snapshots: WorkspaceDataSnapshot[] = []
    service.subscribe((snapshot) => snapshots.push(snapshot))
    storage.writesDenied = true
    service.updateNote(id, { text: "Still editable" })

    expect(first(service.read().notes).text).toBe("Still editable")
    expect(first(snapshots).storageError).not.toBeNull()
    expect(storage.getItem(STORAGE_KEY)).toBe(saved)
    expect(first(createWorkspaceDataService(storage).read().notes).text).toBe("Saved")

    storage.writesDenied = false
    service.addReminder("Save everything")
    expect(service.read().storageError).toBeNull()
    expect(first(createWorkspaceDataService(storage).read().notes).text).toBe("Still editable")
  })

  test("denied reads leave a usable in-memory workspace", () => {
    const storage = new MemoryStorage()
    storage.readsDenied = true
    storage.writesDenied = true
    const service = createWorkspaceDataService(storage)
    expect(service.read().storageError).not.toBeNull()

    service.createNote("Local", "Retained")
    service.addReminder("Do this")
    expect(first(service.read().notes).text).toBe("Retained")
    expect(service.read().reminders).toHaveLength(1)
    expect(service.read().storageError).not.toBeNull()
  })
})
