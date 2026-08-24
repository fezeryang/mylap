import type { DisplayBuildOptions, DisplaysBuild } from "./display-shared"
import { buildMainDisplay } from "./main-display"
import { buildWingDisplay } from "./wing-displays"

export type { DisplayAppIds, DisplaysBuild } from "./display-shared"

export const buildDisplays = (options: DisplayBuildOptions): DisplaysBuild => ({
  screens: [
    buildMainDisplay(options),
    buildWingDisplay(options, "left"),
    buildWingDisplay(options, "right"),
  ],
})
