import { expect, test } from "bun:test"
import { createWorkspaceBrowserService, MAX_BROWSER_TABS } from "./workspace-browser-service"

test("tabs, back/forward and scroll belong to each instance; favorites and persistence are shared", () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
  const service = createWorkspaceBrowserService(storage)
  service.openPersonalSite("phone")
  service.navigate("phone", "https://home.fezern8n.com/blog")
  const phone = service.read("phone")
  service.recordPage("phone", phone.activeId, { title: "我的博客", scrollY: 314 })
  const next = service.newTab("phone", "https://example.com/")
  service.openPersonalSite("phone")
  expect(service.read("phone").activeId).toBe(phone.activeId)
  expect(service.read("phone").tabs.length).toBe(2)
  expect(service.read("phone").tabs[0]?.scrollY).toBe(314)
  expect(service.read("computer").tabs[0]?.history).toEqual([""])
  service.travel("phone", -1)
  expect(service.read("phone").tabs[0]?.index).toBe(1)
  service.travel("phone", 1)
  expect(service.read("phone").tabs[0]?.history[2]).toBe("https://home.fezern8n.com/blog")
  service.toggleFavorite("https://example.com/", "Example")
  service.close("phone", next)
  service.dispose()
  const restored = createWorkspaceBrowserService(storage)
  expect(restored.read("phone").tabs[0]?.title).toBe("我的博客")
  expect(restored.favorites().some((item) => item.title === "Example")).toBe(true)
  restored.close("phone", phone.activeId)
  expect(restored.read("phone").tabs[0]?.history).toEqual([""])
  restored.dispose()
})

test("bounded tabs and invalid persisted URLs cannot activate executable content", () => {
  const service = createWorkspaceBrowserService({
    getItem: () => "{broken",
    setItem: () => undefined,
  })
  for (let i = 1; i < MAX_BROWSER_TABS; i++) service.newTab("phone")
  expect(() => service.newTab("phone")).toThrow("8")
  service.navigate("phone", "javascript:alert(1)")
  expect(service.read("phone").tabs.every((tab) => tab.history.every((url) => url === ""))).toBe(
    true,
  )
  service.dispose()
})
