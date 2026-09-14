export const PERSONAL_SITE_URL = "https://home.fezern8n.com/"
export const MAX_BROWSER_TABS = 8
export type BrowserTab = {
  readonly id: string
  readonly history: readonly string[]
  readonly index: number
  readonly title: string
  readonly scrollY: number
  readonly revision: number
}
export type BrowserSession = { readonly activeId: string; readonly tabs: readonly BrowserTab[] }
export type BrowserFavorite = { readonly url: string; readonly title: string }
export interface WorkspaceBrowserService {
  readonly personalSiteUrl: string
  read(instance: string): BrowserSession
  favorites(): readonly BrowserFavorite[]
  subscribe(listener: () => void): () => void
  newTab(instance: string, url?: string): string
  activate(instance: string, id: string): void
  close(instance: string, id: string): void
  navigate(instance: string, url: string): void
  travel(instance: string, offset: number): void
  reload(instance: string): void
  recordPage(
    instance: string,
    id: string,
    page: { url?: string; title?: string; scrollY?: number },
  ): void
  openPersonalSite(instance: string): void
  toggleFavorite(url: string, title: string): void
  dispose(): void
}
const safeAddress = (input: string): boolean => {
  if (input === "") return true
  if (input.length > 4096) return false
  try {
    const url = new URL(input)
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
  } catch {
    return false
  }
}
const freshTab = (url = ""): BrowserTab => ({
  id: crypto.randomUUID(),
  history: [url],
  index: 0,
  title: "新标签页",
  scrollY: 0,
  revision: 0,
})
const validTab = (value: unknown): value is BrowserTab => {
  if (!value || typeof value !== "object") return false
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "history" in value &&
    Array.isArray(value.history) &&
    value.history.length > 0 &&
    value.history.length <= 100 &&
    value.history.every((url: unknown) => typeof url === "string" && safeAddress(url)) &&
    "index" in value &&
    typeof value.index === "number" &&
    Number.isInteger(value.index) &&
    value.index >= 0 &&
    value.index < value.history.length &&
    "title" in value &&
    typeof value.title === "string" &&
    "scrollY" in value &&
    typeof value.scrollY === "number" &&
    Number.isFinite(value.scrollY) &&
    "revision" in value &&
    typeof value.revision === "number" &&
    Number.isFinite(value.revision)
  )
}
export const createWorkspaceBrowserService = (
  storage: Pick<Storage, "getItem" | "setItem"> | undefined = typeof localStorage === "undefined"
    ? undefined
    : localStorage,
  personalSiteUrl = PERSONAL_SITE_URL,
): WorkspaceBrowserService => {
  const sessions = new Map<string, BrowserSession>()
  const listeners = new Set<() => void>()
  let favorites: readonly BrowserFavorite[] = [{ title: "我的网站", url: personalSiteUrl }]
  const key = "todou.workspace.browser.v1"
  try {
    const stored: unknown = JSON.parse(storage?.getItem(key) ?? "null")
    if (stored && typeof stored === "object") {
      if ("sessions" in stored && Array.isArray(stored.sessions))
        for (const entry of stored.sessions.slice(0, 20)) {
          if (!Array.isArray(entry) || typeof entry[0] !== "string") continue
          const session: unknown = entry[1]
          if (
            !session ||
            typeof session !== "object" ||
            !("tabs" in session) ||
            !Array.isArray(session.tabs) ||
            session.tabs.length < 1 ||
            session.tabs.length > MAX_BROWSER_TABS ||
            !session.tabs.every(validTab) ||
            !("activeId" in session) ||
            typeof session.activeId !== "string" ||
            !session.tabs.some((tab: BrowserTab) => tab.id === session.activeId)
          )
            continue
          sessions.set(entry[0], { activeId: session.activeId, tabs: session.tabs })
        }
      if ("favorites" in stored && Array.isArray(stored.favorites)) {
        const valid = stored.favorites.filter(
          (item: unknown): item is BrowserFavorite =>
            !!item &&
            typeof item === "object" &&
            "url" in item &&
            typeof item.url === "string" &&
            safeAddress(item.url) &&
            !!item.url &&
            "title" in item &&
            typeof item.title === "string",
        )
        favorites = valid.slice(0, 30)
      }
    }
  } catch {
    /* Corrupt browser state never affects existing notes or media. */
  }
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const persist = (): void => {
    try {
      storage?.setItem(key, JSON.stringify({ sessions: [...sessions], favorites }))
    } catch {
      /* Private/quota mode retains this session in memory. */
    }
  }
  const emit = (): void => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(persist, 250)
    for (const listener of listeners) listener()
  }
  const read = (instance: string): BrowserSession => {
    let session = sessions.get(instance)
    if (!session) {
      const tab = freshTab()
      session = { activeId: tab.id, tabs: [tab] }
      sessions.set(instance, session)
    }
    return session
  }
  const update = (
    instance: string,
    transform: (tab: BrowserTab) => BrowserTab,
    id = read(instance).activeId,
  ): void => {
    const session = read(instance)
    sessions.set(instance, {
      ...session,
      tabs: session.tabs.map((tab) => (tab.id === id ? transform(tab) : tab)),
    })
    emit()
  }
  const newTab = (instance: string, url = ""): string => {
    const session = read(instance)
    if (!safeAddress(url)) throw new Error("无效网站地址")
    if (session.tabs.length >= MAX_BROWSER_TABS)
      throw new Error("最多保留 8 个标签，请先关闭一个标签。")
    const tab = freshTab(url)
    sessions.set(instance, { activeId: tab.id, tabs: [...session.tabs, tab] })
    emit()
    return tab.id
  }
  const navigate = (instance: string, url: string): void => {
    if (!safeAddress(url)) return
    update(instance, (tab) => {
      const history = [...tab.history.slice(0, tab.index + 1), url].slice(-100)
      return {
        ...tab,
        history,
        index: history.length - 1,
        title: url ? new URL(url).hostname : "新标签页",
        scrollY: 0,
        revision: tab.revision + 1,
      }
    })
  }
  const activate = (instance: string, id: string): void => {
    const session = read(instance)
    if (!session.tabs.some((tab) => tab.id === id) || session.activeId === id) return
    sessions.set(instance, { ...session, activeId: id })
    emit()
  }
  return {
    personalSiteUrl,
    read,
    newTab,
    navigate,
    activate,
    favorites: () => favorites,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    close: (instance, id) => {
      const session = read(instance)
      const index = session.tabs.findIndex((tab) => tab.id === id)
      if (index < 0) return
      const tabs = session.tabs.filter((tab) => tab.id !== id)
      if (!tabs.length) tabs.push(freshTab())
      sessions.set(instance, {
        tabs,
        activeId:
          session.activeId === id
            ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? tabs[0]?.id ?? "")
            : session.activeId,
      })
      emit()
    },
    travel: (instance, offset) =>
      update(instance, (tab) => ({
        ...tab,
        index: Math.max(0, Math.min(tab.history.length - 1, tab.index + Math.trunc(offset))),
        scrollY: 0,
        revision: tab.revision + 1,
      })),
    reload: (instance) => update(instance, (tab) => ({ ...tab, revision: tab.revision + 1 })),
    recordPage: (instance, id, page) => {
      const tab = read(instance).tabs.find((candidate) => candidate.id === id)
      if (!tab) return
      const url = page.url && safeAddress(page.url) ? page.url : undefined
      const history =
        url && url !== tab.history[tab.index]
          ? [...tab.history.slice(0, tab.index + 1), url].slice(-100)
          : tab.history
      const title = page.title?.slice(0, 120) || tab.title
      const scrollY =
        typeof page.scrollY === "number" && Number.isFinite(page.scrollY)
          ? Math.max(0, page.scrollY)
          : tab.scrollY
      if (history === tab.history && title === tab.title && scrollY === tab.scrollY) return
      update(
        instance,
        (current) => ({
          ...current,
          title,
          scrollY,
          history,
          index: history === tab.history ? tab.index : history.length - 1,
        }),
        id,
      )
    },
    openPersonalSite: (instance) => {
      const existing = read(instance).tabs.find((tab) => {
        try {
          return new URL(tab.history[tab.index] ?? "").origin === new URL(personalSiteUrl).origin
        } catch {
          return false
        }
      })
      if (existing) activate(instance, existing.id)
      else if (read(instance).tabs.length === 1 && read(instance).tabs[0]?.history[0] === "")
        navigate(instance, personalSiteUrl)
      else newTab(instance, personalSiteUrl)
    },
    toggleFavorite: (url, title) => {
      if (!url || !safeAddress(url)) return
      favorites = favorites.some((item) => item.url === url)
        ? favorites.filter((item) => item.url !== url)
        : [...favorites, { url, title: title.slice(0, 120) }].slice(-30)
      emit()
    },
    dispose: () => {
      clearTimeout(saveTimer)
      persist()
      listeners.clear()
    },
  }
}
