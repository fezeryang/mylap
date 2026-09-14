import { PERSONAL_SITE_URL } from "../services/workspace-browser-service"

export type BrowserRejectCode =
  | "empty-url"
  | "invalid-url"
  | "unsupported-scheme"
  | "credentials-not-allowed"
  | "insecure-url"

export type BrowserDecision =
  | { readonly kind: "reject"; readonly code: BrowserRejectCode }
  | { readonly kind: "embed"; readonly url: string }
  | {
      readonly kind: "new-tab-only"
      readonly code: "embed-origin-not-allowlisted"
      readonly url: string
    }

export interface BrowserPolicy {
  readonly iframeSandbox: string
  readonly referrerPolicy: "no-referrer"
  sandboxFor(url: string): string
  isPersonalSite(url: string): boolean
  evaluate(rawInput: string): BrowserDecision
}

const schemePattern = /^[A-Za-z][A-Za-z0-9+.-]*:/

export const createBrowserPolicy = (options: {
  readonly currentOrigin: string
  readonly allowRelativeQa?: boolean
  readonly personalSiteUrl?: string
}): BrowserPolicy => {
  const currentOrigin = new URL(options.currentOrigin).origin
  const allowRelativeQa = options.allowRelativeQa ?? false
  const personalOrigin = new URL(options.personalSiteUrl ?? PERSONAL_SITE_URL).origin
  const isPersonalSite = (url: string): boolean => {
    try {
      return new URL(url).origin === personalOrigin && personalOrigin !== currentOrigin
    } catch {
      return false
    }
  }

  return {
    iframeSandbox: "allow-forms allow-scripts",
    isPersonalSite,
    sandboxFor: (url) =>
      isPersonalSite(url)
        ? "allow-forms allow-scripts allow-same-origin"
        : "allow-forms allow-scripts",
    referrerPolicy: "no-referrer",
    evaluate: (rawInput): BrowserDecision => {
      const input = rawInput.trim()
      if (input.length === 0) return { kind: "reject", code: "empty-url" }

      let url: URL
      try {
        if (input.startsWith("/qa/")) {
          if (!allowRelativeQa) return { kind: "reject", code: "invalid-url" }
          url = new URL(input, currentOrigin)
        } else {
          url = new URL(schemePattern.test(input) ? input : `https://${input}`)
        }
      } catch {
        return { kind: "reject", code: "invalid-url" }
      }

      if (url.username.length > 0 || url.password.length > 0) {
        return { kind: "reject", code: "credentials-not-allowed" }
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { kind: "reject", code: "unsupported-scheme" }
      }
      if (
        url.protocol === "http:" &&
        (!allowRelativeQa || (url.origin !== currentOrigin && !isPersonalSite(url.href)))
      ) {
        return { kind: "reject", code: "insecure-url" }
      }
      if (
        url.origin === currentOrigin ||
        url.origin === "https://example.com" ||
        isPersonalSite(url.href)
      ) {
        return { kind: "embed", url: url.href }
      }
      return {
        kind: "new-tab-only",
        code: "embed-origin-not-allowlisted",
        url: url.href,
      }
    },
  }
}
