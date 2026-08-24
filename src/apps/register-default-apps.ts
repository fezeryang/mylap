import type { ScreenAppRegistry } from "../runtime/screen-app-registry"
import { mainWorkspaceApp } from "./main-workspace-app"
import { structureAnalysisApp } from "./structure-analysis-app"
import { systemTelemetryApp } from "./system-telemetry-app"

export const registerDefaultApps = (registry: ScreenAppRegistry): void => {
  registry.register(mainWorkspaceApp)
  registry.register(systemTelemetryApp)
  registry.register(structureAnalysisApp)
}
