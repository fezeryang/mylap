import type { ScreenAppRegistry } from "../runtime/screen-app-registry"
import { STRUCTURE_ANALYSIS_APP_ID, SYSTEM_TELEMETRY_APP_ID } from "./app-ids"
import { createCompanionApp } from "./companion-app"
import type { DeviceSoftwareDependencies } from "./device-applications"
import { createMainWorkspaceApp } from "./main-workspace-app"
import { createPhoneShellApp } from "./phone-shell-app"
import {
  createRatioCassetteDisplayApp,
  createRatioTunerDisplayApp,
} from "./ratio-display-presenter"

export type DefaultAppDependencies = DeviceSoftwareDependencies

export const registerDefaultApps = (
  registry: ScreenAppRegistry,
  dependencies: DefaultAppDependencies,
): void => {
  registry.register(createMainWorkspaceApp(dependencies))
  // The authored wing IDs face the model, opposite the user's focused camera view.
  registry.register(createCompanionApp(SYSTEM_TELEMETRY_APP_ID, "reminders", dependencies))
  registry.register(createCompanionApp(STRUCTURE_ANALYSIS_APP_ID, "music", dependencies))
  registry.register(createPhoneShellApp(dependencies))
  registry.register(createRatioTunerDisplayApp(dependencies))
  registry.register(createRatioCassetteDisplayApp(dependencies))
}
