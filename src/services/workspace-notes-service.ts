export type WorkspaceNotesSnapshot = {
  readonly savedAt: number | null
  readonly text: string
}

export type WorkspaceNotesService = {
  read(): WorkspaceNotesSnapshot
  save(text: string): void
  subscribe(listener: (snapshot: WorkspaceNotesSnapshot) => void): () => void
}

const STORAGE_KEY = "todou.workspace.note"

export const createWorkspaceNotesService = (storage?: Storage): WorkspaceNotesService => {
  let snapshot: WorkspaceNotesSnapshot = {
    savedAt: null,
    text: storage?.getItem(STORAGE_KEY) ?? "",
  }
  const listeners = new Set<(next: WorkspaceNotesSnapshot) => void>()

  return {
    read: () => snapshot,
    save: (text) => {
      storage?.setItem(STORAGE_KEY, text)
      snapshot = { savedAt: Date.now(), text }
      listeners.forEach((listener) => listener(snapshot))
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
