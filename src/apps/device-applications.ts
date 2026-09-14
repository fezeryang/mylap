import type { RadioMediaService } from "../services/radio-contracts"
import type { WorkspaceBrowserService } from "../services/workspace-browser-service"
import type { WorkspaceClockService } from "../services/workspace-clock-service"
import type { WorkspaceDataService } from "../services/workspace-data-service"
import type { WorkspaceFilesService } from "../services/workspace-files-service"
import type { WorkspaceLibraryService } from "../services/workspace-library-service"
import type { WorkspaceMusicService } from "../services/workspace-music-service"
import type { BrowserPolicy } from "./browser-url-policy"
import { createClockApp } from "./clock-app"
import { element, svgElement } from "./dom"
import { createFilesApp } from "./files-app"
import { createMusicApp } from "./music-app"
import { createPhotosApp } from "./photos-app"
import { createProductivityApp } from "./productivity-apps"
import { createSafariApp } from "./safari-app"
import { createVoiceMemosApp } from "./voice-memos-app"

export type DeviceAppId =
  | "notes"
  | "reminders"
  | "calendar"
  | "files"
  | "music"
  | "browser"
  | "calculator"
  | "settings"
  | "photos"
  | "clock"
  | "recorder"
export type DeviceSoftwareDependencies = {
  readonly dataService: WorkspaceDataService
  readonly musicService: WorkspaceMusicService
  readonly radioService: RadioMediaService
  readonly browserPolicy: BrowserPolicy
  readonly libraryService: WorkspaceLibraryService
  readonly clockService: WorkspaceClockService
  readonly browserService: WorkspaceBrowserService
  readonly filesService: WorkspaceFilesService
}
export type DeviceApplication = { readonly element: HTMLElement; dispose(): void }

export const DEVICE_APPS: readonly {
  readonly id: DeviceAppId
  readonly title: string
  readonly color: string
}[] = [
  { id: "files", title: "文件", color: "#218cf5" },
  { id: "browser", title: "浏览器", color: "#28a5f7" },
  { id: "notes", title: "备忘录", color: "#efbc29" },
  { id: "reminders", title: "提醒事项", color: "#6877eb" },
  { id: "calendar", title: "日历", color: "#fa565c" },
  { id: "music", title: "音乐", color: "#f2466a" },
  { id: "photos", title: "照片", color: "#c55bad" },
  { id: "clock", title: "时钟", color: "#303541" },
  { id: "recorder", title: "语音备忘录", color: "#e14b58" },
  { id: "calculator", title: "计算器", color: "#f7a02b" },
  { id: "settings", title: "设置", color: "#828895" },
]

const ICON_PATHS: Record<Exclude<DeviceAppId, "calendar">, readonly string[]> = {
  photos: ["M4 6h24v23H4z", "m4 24 8-9 5 5 4-4 7 8", "M22 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4"],
  clock: [
    "M16 3a13 13 0 1 0 0 26 13 13 0 0 0 0-26",
    "M16 8v9l6 4",
    "M16 4v2M28 16h-2M16 28v-2M4 16h2",
  ],
  recorder: ["M4 14v6M8 9v16M12 5v24M16 11v12M20 7v20M24 10v14M28 14v6"],
  files: ["M4 7h7l2 3h15v18H4z", "M4 12h24"],
  browser: ["M16 3a13 13 0 1 0 0 26 13 13 0 0 0 0-26", "m21 10-3 9-8 3 3-9z"],
  notes: ["M6 5h20v24H6z", "M6 11h20", "M10 16h12M10 21h12M10 26h7"],
  reminders: ["M11 8h15M11 16h15M11 24h15", "M5 7h1v2H5zM5 15h1v2H5zM5 23h1v2H5z"],
  music: [
    "M13 24V7l13-3v17",
    "M13 12l13-3",
    "M13 24c0 5-9 7-9 2s9-7 9-2M26 21c0 5-9 7-9 2s9-7 9-2",
  ],
  calculator: ["M7 3h18v26H7z", "M11 7h10v5H11z", "M11 17h1m8 0h1m-10 5h1m8 0h1"],
  settings: [
    "m13 3 6 0 1 4 3 2 4-1 3 5-3 3 0 3 3 3-3 5-4-1-3 2-1 4h-6l-1-4-3-2-4 1-3-5 3-3v-3l-3-3 3-5 4 1 3-2z",
    "M16 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14",
  ],
}

export const createAppIcon = (id: DeviceAppId): HTMLElement => {
  const icon = element("span", `os-app-icon os-app-icon--${id}`)
  icon.setAttribute("aria-hidden", "true")
  if (id === "calendar") {
    const now = new Date()
    icon.append(
      element("span", "os-calendar-month", now.toLocaleDateString("zh-CN", { month: "short" })),
      element("strong", "os-calendar-day", String(now.getDate())),
    )
    return icon
  }
  const svg = svgElement("svg", {
    viewBox: "0 0 32 34",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.8",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  })
  for (const d of ICON_PATHS[id]) svg.append(svgElement("path", { d }))
  icon.append(svg)
  return icon
}

export const createDeviceApplication = (
  id: DeviceAppId,
  dependencies: DeviceSoftwareDependencies,
  instance: string,
): DeviceApplication => {
  if (id === "music") return createMusicApp(dependencies)
  if (id === "browser")
    return createSafariApp(
      dependencies.browserPolicy,
      dependencies.browserService,
      dependencies.filesService,
      instance,
    )
  if (id === "files") return createFilesApp(dependencies.filesService, dependencies.dataService)
  if (id === "photos")
    return createPhotosApp(dependencies.libraryService, dependencies.filesService)
  if (id === "recorder")
    return createVoiceMemosApp(dependencies.libraryService, dependencies.filesService)
  if (id === "clock") return createClockApp(dependencies.clockService)
  return createProductivityApp(id, dependencies.dataService)
}
