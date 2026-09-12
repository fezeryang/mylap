import { Box3 } from "three"

import type { AssetStage } from "../runtime/asset-stage"
import { UnknownAssetInstanceError } from "../runtime/asset-stage"
import type { AssetInstanceId } from "../runtime/ids"
import type { KeyboardRouteDiagnostic, KeyboardRouter } from "../runtime/keyboard-router"
import type { ScreenRuntime } from "../runtime/screen-runtime"
import type { RadioMediaService } from "../services/radio-contracts"
import type { DesktopNavigationController } from "../shell/desktop-navigation"
import type { ShellDomBinding } from "../shell/shell-dom"
import type { TodouQaApi, TodouQaSnapshot } from "./todou-qa"

type TodouQaControllerOptions = {
  readonly clearDiagnostic: () => void
  readonly keyboardRouter: Pick<KeyboardRouter, "releaseAll">
  readonly navigation: Pick<DesktopNavigationController, "read" | "request">
  readonly radioService: Pick<RadioMediaService, "read">
  readonly readKeyboardRoute: () => KeyboardRouteDiagnostic | null
  readonly routeKeyboardTo: (assetId: AssetInstanceId) => void
  readonly screens: Pick<ScreenRuntime, "focusedScreen" | "releaseScreenFocus">
  readonly shell: Pick<ShellDomBinding, "sync">
  readonly stage: Pick<AssetStage, "active" | "activate" | "assets" | "remove">
}

export type TodouQaController = {
  readonly api: TodouQaApi
  recordAssetDisposal(instanceId: string): void
}

export const createTodouQaController = (options: TodouQaControllerOptions): TodouQaController => {
  const disposalCounts: Record<string, number> = Object.fromEntries(
    options.stage.assets.map((asset) => [asset.instanceId.value, 0]),
  )
  const read = (): TodouQaSnapshot => ({
    activeAsset: options.stage.active?.instanceId.value ?? null,
    disposalCounts: { ...disposalCounts },
    focusedScreen:
      options.screens.focusedScreen === null
        ? null
        : {
            assetId: options.screens.focusedScreen.assetId.value,
            screenId: options.screens.focusedScreen.screenId.value,
          },
    instances: options.stage.assets.map((asset) => {
      const bounds = new Box3().setFromObject(asset.root)
      return {
        bounds: [
          bounds.min.x,
          bounds.min.y,
          bounds.min.z,
          bounds.max.x,
          bounds.max.y,
          bounds.max.z,
        ],
        instanceId: asset.instanceId.value,
        screenIds: asset.screens.map((screen) => screen.screenId.value),
        typeId: asset.typeId.value,
      }
    }),
    lastKeyboardRoute: options.readKeyboardRoute(),
    navigationState: options.navigation.read().state,
    radio: options.radioService.read(),
    screenSessionCount: options.stage.assets.reduce(
      (count, asset) => count + asset.screens.length,
      0,
    ),
  })
  return {
    api: {
      read,
      removeAsset: (instanceId) => {
        const id: AssetInstanceId = { kind: "asset-instance-id", value: instanceId }
        if (!options.stage.assets.some((asset) => asset.instanceId.value === instanceId)) {
          throw new UnknownAssetInstanceError(id)
        }
        const removingPhone = instanceId === "phone-main"
        options.stage.remove(id)
        if (!removingPhone) return
        options.screens.releaseScreenFocus()
        options.keyboardRouter.releaseAll()
        const computerId: AssetInstanceId = {
          kind: "asset-instance-id",
          value: "computer-main",
        }
        options.stage.activate(computerId)
        options.routeKeyboardTo(computerId)
        options.clearDiagnostic()
        options.navigation.request("return-overview")
        options.shell.sync()
      },
    },
    recordAssetDisposal: (instanceId) => {
      disposalCounts[instanceId] = (disposalCounts[instanceId] ?? 0) + 1
    },
  }
}
