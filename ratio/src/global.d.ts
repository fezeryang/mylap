import type { RadioModel } from "./model/modelTypes"

declare global {
  interface Window {
    __ready: boolean
    __interactive: boolean
    __radio: {
      readonly model: RadioModel
      readonly getState: () => unknown
      readonly getSelectedPart: () => unknown
    }
  }
}
