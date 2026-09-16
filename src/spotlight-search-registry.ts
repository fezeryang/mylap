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
    registerApp: (id, name, icon, action) => register(id, name, "应用程序", icon, action),
    registerTool: (id, name, icon, action) => register(id, name, "工具", icon, action),
    registerSetting: (id, name, icon, action) => register(id, name, "设置", icon, action),
    getAll: () => Array.from(items.values()),
  }
}
