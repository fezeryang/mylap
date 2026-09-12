import type { QaCaseModule } from "./qa-case-contract"

export type QaCaseImporter = () => Promise<QaCaseModule>

export class UnknownQaCaseError extends Error {
  constructor(readonly caseId: string) {
    super(`Unknown component QA case: ${caseId}`)
    this.name = "UnknownQaCaseError"
  }
}

export const selectQaCaseImporter = (
  importers: Readonly<Record<string, QaCaseImporter>>,
  caseId: string,
): QaCaseImporter => {
  const importer = importers[`../qa-cases/${caseId}.case.ts`]
  if (importer === undefined) throw new UnknownQaCaseError(caseId)
  return importer
}
