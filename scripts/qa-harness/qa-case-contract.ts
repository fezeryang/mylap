export type QaCheck = {
  readonly id: string
  readonly passed: boolean
}

export type QaCaseContext = {
  readonly root: HTMLElement
}

export type QaCaseModule = {
  readonly caseId: string
  mount(context: QaCaseContext): void | Promise<void>
}

declare global {
  interface Window {
    __todouComponentQa?: {
      readonly caseId: string
      readonly ready: boolean
    }
  }
}
