import type { ScreenAppRegistry } from "../runtime/screen-app-registry"
import type { RadioMediaService } from "../services/radio-contracts"
import type { WorkspaceNotesService } from "../services/workspace-notes-service"
import type { BrowserPolicy } from "./browser-url-policy"
import { createMainWorkspaceApp } from "./main-workspace-app"
import { createPhoneShellApp } from "./phone-shell-app"
import {
  createRatioCassetteDisplayApp,
  createRatioTunerDisplayApp,
} from "./ratio-display-presenter"
import { structureAnalysisApp } from "./structure-analysis-app"
import { systemTelemetryApp } from "./system-telemetry-app"

export type DefaultAppDependencies = {
  readonly browserPolicy: BrowserPolicy
  readonly notesService?: WorkspaceNotesService
  readonly radioService: RadioMediaService
}

export const registerDefaultApps = (
  registry: ScreenAppRegistry,
  dependencies: DefaultAppDependencies,
): void => {
  registry.register(createMainWorkspaceApp(dependencies))
  registry.register(systemTelemetryApp)
  registry.register(structureAnalysisApp)
  registry.register(createPhoneShellApp(dependencies))
  registry.register(createRatioTunerDisplayApp(dependencies))
  registry.register(createRatioCassetteDisplayApp(dependencies))
}
