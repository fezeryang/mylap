import type { PartsManifest, PhoneModel } from "./model/modelTypes"
import type { PhoneViewer } from "./viewer/createViewer"

declare global {
  interface Window {
    __interactive: boolean
    __ready: boolean
    __phone: {
      readonly model: PhoneModel
      readonly viewer: PhoneViewer
      readonly manifest: () => PartsManifest
    }
  }
}
