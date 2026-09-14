import type { SpotlightSearchItem } from "./spotlight-search"

export type SpotlightSearchRegistry = {
  registerApp(id: string, name: string, icon: string, action: () => void): void
  registerTool(id: string, name: string, icon: string, action: () => void): void
  registerSetting(id: string, name: string, icon: string, action: () => void): void
  getAll(): readonly SpotlightSearchItem[]
}

export const createSpotlightSearchRegistry = (): SpotlightSearchRegistry => {
  const items = new Map<string, SpotlightSearchItem>()

  const register = (
    id: string,
    name: string,
    category: string,
    icon: string,
    action: () => void,
  ): void => {
    items.set(id, { id, name, category, icon, action })
  }

  return {
    registerApp: (id, name, icon, action) => register(id, name, "Application", icon, action),
    registerTool: (id, name, icon, action) => register(id, name, "Workspace Tool", icon, action),
    registerSetting: (id, name, icon, action) => register(id, name, "Setting", icon, action),
    getAll: () => Array.from(items.values()),
  }
}
