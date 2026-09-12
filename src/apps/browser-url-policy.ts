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
  readonly iframeSandbox: "allow-forms allow-scripts allow-popups allow-popups-to-escape-sandbox"
  readonly referrerPolicy: "no-referrer"
  evaluate(rawInput: string): BrowserDecision
}

const schemePattern = /^[A-Za-z][A-Za-z0-9+.-]*:/

export const createBrowserPolicy = (options: {
  readonly currentOrigin: string
  readonly allowRelativeQa?: boolean
}): BrowserPolicy => {
  const currentOrigin = new URL(options.currentOrigin).origin
  const allowRelativeQa = options.allowRelativeQa ?? false

  return {
    iframeSandbox: "allow-forms allow-scripts allow-popups allow-popups-to-escape-sandbox",
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
      if (url.protocol === "http:" && (!allowRelativeQa || url.origin !== currentOrigin)) {
        return { kind: "reject", code: "insecure-url" }
      }
      if (url.origin === currentOrigin || url.origin === "https://example.com") {
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
