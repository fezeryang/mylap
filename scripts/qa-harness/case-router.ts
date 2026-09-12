/// <reference types="vite/client" />

import type { QaCaseModule } from "./qa-case-contract"
import { selectQaCaseImporter } from "./case-selection"

const caseImporters = import.meta.glob<QaCaseModule>("../qa-cases/*.case.ts")

export const availableQaCases = (): readonly string[] =>
  Object.keys(caseImporters)
    .map((path) => path.match(/\/([^/]+)\.case\.ts$/)?.[1])
    .filter((caseId): caseId is string => caseId !== undefined)
    .sort()

export const loadQaCase = async (caseId: string): Promise<QaCaseModule> => {
  return selectQaCaseImporter(caseImporters, caseId)()
}
