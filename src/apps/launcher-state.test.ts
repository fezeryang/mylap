import { describe, expect, test } from "bun:test"

import { createBrowserPolicy } from "./browser-url-policy"
import {
  createLauncherState,
  navigateLauncher,
  submitLauncherBrowser,
  updateLauncherBrowserInput,
} from "./launcher-state"

describe("launcher state", () => {
  const policy = createBrowserPolicy({
    allowRelativeQa: true,
    currentOrigin: "http://127.0.0.1:4173",
  })

  test("Given a browser fixture decision, when Home and Browser are revisited, then URL state persists", () => {
    const initial = createLauncherState()
    const entered = updateLauncherBrowserInput(initial, "/qa/iframe-fixture.html")
    const submitted = submitLauncherBrowser(entered, policy)

    const revisited = navigateLauncher(navigateLauncher(submitted, "home"), "browser")

    expect(revisited).toEqual({
      browserDecision: {
        kind: "embed",
        url: "http://127.0.0.1:4173/qa/iframe-fixture.html",
      },
      browserInput: "/qa/iframe-fixture.html",
      route: "browser",
    })
  })

  test("Given an unsafe browser submission, when it is evaluated, then it is retained as a rejection", () => {
    const entered = updateLauncherBrowserInput(createLauncherState(), "javascript:alert(1)")

    const submitted = submitLauncherBrowser(entered, policy)

    expect(submitted.browserDecision).toEqual({ kind: "reject", code: "unsupported-scheme" })
    expect(submitted.browserInput).toBe("javascript:alert(1)")
  })
})
