import { describe, expect, test } from "bun:test"
import {
  PHONE_SHELL_APP_ID,
  RATIO_CASSETTE_DISPLAY_APP_ID,
  RATIO_TUNER_DISPLAY_APP_ID,
} from "./app-ids"
import { createBrowserPolicy } from "./browser-url-policy"
import type { DefaultAppDependencies } from "./register-default-apps"

describe("createBrowserPolicy", () => {
  const production = createBrowserPolicy({ currentOrigin: "http://127.0.0.1:4173" })

  test("rejects each unsafe input class with the locked code", () => {
    expect(production.evaluate("   ")).toEqual({ kind: "reject", code: "empty-url" })
    expect(production.evaluate("javascript:alert(1)")).toEqual({
      kind: "reject",
      code: "unsupported-scheme",
    })
    expect(production.evaluate("https://name:secret@example.com/")).toEqual({
      kind: "reject",
      code: "credentials-not-allowed",
    })
    expect(production.evaluate("http://example.com/")).toEqual({
      kind: "reject",
      code: "insecure-url",
    })
  })

  test("canonicalizes allowlisted and external HTTPS decisions", () => {
    expect(production.evaluate("example.com/a/../b?q=hello world")).toEqual({
      kind: "embed",
      url: "https://example.com/b?q=hello%20world",
    })
    expect(production.evaluate("https://openai.com/docs")).toEqual({
      kind: "new-tab-only",
      code: "embed-origin-not-allowlisted",
      url: "https://openai.com/docs",
    })
  })

  test("gates relative QA URLs and exact current-origin HTTP embedding", () => {
    expect(production.evaluate("/qa/iframe-fixture.html")).toEqual({
      kind: "reject",
      code: "invalid-url",
    })
    expect(production.evaluate("http://127.0.0.1:4173/qa/iframe-fixture.html")).toEqual({
      kind: "reject",
      code: "insecure-url",
    })
    const qa = createBrowserPolicy({
      currentOrigin: "http://127.0.0.1:4173",
      allowRelativeQa: true,
    })
    expect(qa.evaluate("/qa/iframe-fixture.html")).toEqual({
      kind: "embed",
      url: "http://127.0.0.1:4173/qa/iframe-fixture.html",
    })
    expect(qa.evaluate("http://127.0.0.1:4174/qa/iframe-fixture.html")).toEqual({
      kind: "reject",
      code: "insecure-url",
    })
  })

  test("rejects malformed and unsupported absolute inputs", () => {
    expect(production.evaluate("https://")).toEqual({ kind: "reject", code: "invalid-url" })
    expect(production.evaluate("mailto:user@example.com")).toEqual({
      kind: "reject",
      code: "unsupported-scheme",
    })
  })

  test("exposes exact iframe security attributes and stable application IDs", () => {
    expect(production.iframeSandbox).toBe("allow-forms allow-scripts")
    expect(production.referrerPolicy).toBe("no-referrer")
    expect([
      PHONE_SHELL_APP_ID.value,
      RATIO_TUNER_DISPLAY_APP_ID.value,
      RATIO_CASSETTE_DISPLAY_APP_ID.value,
    ]).toEqual(["phone-shell", "ratio-tuner-display", "ratio-cassette-display"])
    const dependencyKeys = {
      browserPolicy: production,
      radioService: null,
    } satisfies Pick<DefaultAppDependencies, "browserPolicy"> & { readonly radioService: null }
    expect(Object.keys(dependencyKeys).sort()).toEqual(["browserPolicy", "radioService"])
  })

  test("personal site retains its own origin, but never receives popup or top navigation permission", () => {
    expect(production.evaluate("https://home.fezern8n.com/blog")).toEqual({
      kind: "embed",
      url: "https://home.fezern8n.com/blog",
    })
    expect(production.sandboxFor("https://home.fezern8n.com/")).toBe(
      "allow-forms allow-scripts allow-same-origin",
    )
    expect(production.isPersonalSite("https://home.fezern8n.com.attacker.test/")).toBe(false)
    expect(production.sandboxFor("http://127.0.0.1:4173/qa/iframe-fixture.html")).not.toContain(
      "allow-same-origin",
    )
  })
})
