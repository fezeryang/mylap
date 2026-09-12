import { describe, expect, test } from "bun:test"

import type { AssetKeyboard, KeyboardBinding } from "./asset-contracts"
import {
  type KeyboardEventSource,
  type KeyboardInputEvent,
  KeyboardRouter,
  type VisibilityEventSource,
} from "./keyboard-router"

class RecordingKeyboard implements AssetKeyboard {
  readonly bindings: readonly KeyboardBinding[] = []
  readonly pressedCodes: readonly never[] = []
  readonly events: string[] = []

  press(code: string): boolean {
    this.events.push(`down:${code}`)
    return true
  }

  release(code: string): boolean {
    this.events.push(`up:${code}`)
    return true
  }

  releaseAll(): void {
    this.events.push("release-all")
  }

  update(): void {}
}

class RoutedEvent implements KeyboardInputEvent {
  defaultPrevented = false
  readonly code: string
  readonly key: string
  readonly repeat: boolean
  readonly target: EventTarget | null

  constructor(options: {
    readonly code: string
    readonly key?: string
    readonly repeat?: boolean
    readonly target?: EventTarget | null
  }) {
    this.code = options.code
    this.key = options.key ?? options.code
    this.repeat = options.repeat ?? false
    this.target = options.target ?? null
  }

  preventDefault(): void {
    this.defaultPrevented = true
  }
}

class KeyboardSource implements KeyboardEventSource {
  readonly blurListeners = new Set<(event: KeyboardInputEvent) => void>()
  readonly keydownListeners = new Set<(event: KeyboardInputEvent) => void>()
  readonly keyupListeners = new Set<(event: KeyboardInputEvent) => void>()

  addEventListener(
    type: "blur" | "keydown" | "keyup",
    listener: (event: KeyboardInputEvent) => void,
  ): void
  addEventListener(
    type: "blur" | "keydown" | "keyup",
    listener: (event: KeyboardInputEvent) => void,
  ): void {
    if (type === "blur") {
      this.blurListeners.add(listener)
      return
    }
    const target = type === "keydown" ? this.keydownListeners : this.keyupListeners
    target.add(listener)
  }

  removeEventListener(
    type: "blur" | "keydown" | "keyup",
    listener: (event: KeyboardInputEvent) => void,
  ): void
  removeEventListener(
    type: "blur" | "keydown" | "keyup",
    listener: (event: KeyboardInputEvent) => void,
  ): void {
    if (type === "blur") {
      this.blurListeners.delete(listener)
      return
    }
    const target = type === "keydown" ? this.keydownListeners : this.keyupListeners
    target.delete(listener)
  }

  emit(type: "keydown" | "keyup", event: KeyboardInputEvent): void {
    const listeners = type === "keydown" ? this.keydownListeners : this.keyupListeners
    listeners.forEach((listener) => {
      listener(event)
    })
  }
}

class VisibilitySource implements VisibilityEventSource {
  readonly listeners = new Set<() => void>()
  visibilityState: DocumentVisibilityState = "visible"

  addEventListener(_type: "visibilitychange", listener: () => void): void {
    this.listeners.add(listener)
  }

  removeEventListener(_type: "visibilitychange", listener: () => void): void {
    this.listeners.delete(listener)
  }
}

describe("KeyboardRouter baseline", () => {
  test("Given an active keyboard, when direct key methods run, then down/up and repeat behavior is retained", () => {
    const keyboard = new RecordingKeyboard()
    const router = new KeyboardRouter()
    router.setActive(keyboard)

    router.handleKeyDown("KeyQ", false)
    router.handleKeyDown("KeyQ", true)
    router.handleKeyUp("KeyQ")

    expect(keyboard.events).toEqual(["down:KeyQ", "up:KeyQ"])
  })

  test("Given shell, screen, physical, and locked targets, when keys route, then each matrix branch is observable", () => {
    const keyboard = new RecordingKeyboard()
    const router = new KeyboardRouter()
    const source = new KeyboardSource()
    const page = new VisibilitySource()
    const shell = new EventTarget()
    const screen = new EventTarget()
    const physical = new EventTarget()
    const locked = new EventTarget()
    const diagnostics: ({
      readonly assetId: string
      readonly screenId: string | null
      readonly code: string
    } | null)[] = []
    router.setActive(keyboard)
    router.connect(source, page, {
      classifyTarget: (target) => {
        if (target === shell) return { kind: "shell" }
        if (target === screen) {
          return { assetId: "phone-main", kind: "screen", screenId: "phone-primary" }
        }
        if (target === physical) return { assetId: "phone-main", kind: "physical" }
        return { kind: "locked" }
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    })
    const shellEvent = new RoutedEvent({ code: "KeyS", target: shell })
    const screenEvent = new RoutedEvent({ code: "KeyD", target: screen })
    const physicalEvent = new RoutedEvent({ code: "KeyQ", target: physical })
    const lockedEvent = new RoutedEvent({ code: "KeyL", target: locked })

    source.emit("keydown", shellEvent)
    source.emit("keydown", screenEvent)
    source.emit("keydown", physicalEvent)
    source.emit("keydown", lockedEvent)

    expect(keyboard.events).toEqual(["down:KeyQ"])
    expect(shellEvent.defaultPrevented).toBe(false)
    expect(screenEvent.defaultPrevented).toBe(false)
    expect(physicalEvent.defaultPrevented).toBe(true)
    expect(lockedEvent.defaultPrevented).toBe(false)
    expect(diagnostics).toEqual([
      null,
      { assetId: "phone-main", code: "KeyD", screenId: "phone-primary" },
      { assetId: "phone-main", code: "KeyQ", screenId: null },
      null,
    ])
  })

  test("Given a physically forwarded key, when repeat and keyup arrive, then only matching keyup releases and prevents default", () => {
    const keyboard = new RecordingKeyboard()
    const router = new KeyboardRouter()
    const source = new KeyboardSource()
    const page = new VisibilitySource()
    const body = new EventTarget()
    const diagnostics: string[] = []
    router.setActive(keyboard)
    router.connect(source, page, {
      classifyTarget: () => ({ assetId: "computer-main", kind: "physical" }),
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic?.code ?? "none"),
    })
    const down = new RoutedEvent({ code: "KeyQ", target: body })
    const repeat = new RoutedEvent({ code: "KeyQ", repeat: true, target: body })
    const unrelatedUp = new RoutedEvent({ code: "KeyW", target: body })
    const matchingUp = new RoutedEvent({ code: "KeyQ", target: body })

    source.emit("keydown", down)
    source.emit("keydown", repeat)
    source.emit("keyup", unrelatedUp)
    source.emit("keyup", matchingUp)

    expect(keyboard.events).toEqual(["down:KeyQ", "up:KeyQ"])
    expect(down.defaultPrevented).toBe(true)
    expect(repeat.defaultPrevented).toBe(false)
    expect(unrelatedUp.defaultPrevented).toBe(false)
    expect(matchingUp.defaultPrevented).toBe(true)
    expect(diagnostics).toEqual(["KeyQ"])
  })

  test("Given a held physical key, when ownership changes before stale keyup, then release-all runs and stale keyup is ignored", () => {
    const phone = new RecordingKeyboard()
    const computer = new RecordingKeyboard()
    const router = new KeyboardRouter()
    const source = new KeyboardSource()
    const body = new EventTarget()
    router.setActive(phone)
    router.connect(source, new VisibilitySource(), {
      classifyTarget: () => ({ assetId: "phone-main", kind: "physical" }),
      onDiagnostic: () => {},
    })
    source.emit("keydown", new RoutedEvent({ code: "KeyQ", target: body }))

    router.setActive(computer)
    const staleUp = new RoutedEvent({ code: "KeyQ", target: body })
    source.emit("keyup", staleUp)

    expect(phone.events).toEqual(["down:KeyQ", "release-all"])
    expect(computer.events).toEqual([])
    expect(staleUp.defaultPrevented).toBe(false)
  })
})
