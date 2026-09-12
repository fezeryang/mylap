import { describe, expect, test } from "bun:test"

import {
  connectScreenEscapeRelease,
  type ScreenEscapeEvent,
  type ScreenEscapeEventSource,
} from "./screen-runtime"

class EscapeSource implements ScreenEscapeEventSource {
  listener: ((event: ScreenEscapeEvent) => void) | null = null
  readonly flags: boolean[] = []

  addEventListener(
    _type: "keydown",
    listener: (event: ScreenEscapeEvent) => void,
    capture: boolean,
  ): void {
    this.listener = listener
    this.flags.push(capture)
  }

  removeEventListener(
    _type: "keydown",
    listener: (event: ScreenEscapeEvent) => void,
    capture: boolean,
  ): void {
    if (this.listener === listener) this.listener = null
    this.flags.push(capture)
  }

  emit(event: ScreenEscapeEvent): void {
    this.listener?.(event)
  }
}

class EscapeEvent implements ScreenEscapeEvent {
  defaultPrevented = false
  immediatePropagationStopped = false
  readonly key: string

  constructor(key: string) {
    this.key = key
  }

  preventDefault(): void {
    this.defaultPrevented = true
  }

  stopImmediatePropagation(): void {
    this.immediatePropagationStopped = true
  }
}

describe("ScreenRuntime baseline", () => {
  test("Given the current runtime listener, when disconnected, then the same capture flag removes it", () => {
    const source = new EscapeSource()
    const disconnect = connectScreenEscapeRelease(
      source,
      () => false,
      () => {},
    )

    disconnect()

    expect(source.flags[0]).toBe(source.flags[1])
    expect(source.listener).toBeNull()
  })

  test("Given a focused screen, when Escape reaches document capture, then only screen focus releases", () => {
    const source = new EscapeSource()
    let focused = true
    let releaseCount = 0
    connectScreenEscapeRelease(
      source,
      () => focused,
      () => {
        focused = false
        releaseCount += 1
      },
    )
    const event = new EscapeEvent("Escape")

    source.emit(event)

    expect(source.flags[0]).toBe(true)
    expect(releaseCount).toBe(1)
    expect(event.defaultPrevented).toBe(true)
    expect(event.immediatePropagationStopped).toBe(true)
  })

  test("Given no focused screen, when Escape reaches document capture, then shell propagation remains available", () => {
    const source = new EscapeSource()
    let releaseCount = 0
    connectScreenEscapeRelease(
      source,
      () => false,
      () => {
        releaseCount += 1
      },
    )
    const event = new EscapeEvent("Escape")

    source.emit(event)

    expect(releaseCount).toBe(0)
    expect(event.defaultPrevented).toBe(false)
    expect(event.immediatePropagationStopped).toBe(false)
  })
})
