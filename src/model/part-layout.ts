import type { Vector3 } from "three"

export type KeyTone = "pearl" | "lavender" | "violet" | "pink" | "cyan"

type Letter =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z"

export type KeyboardCode =
  | `Key${Letter}`
  | `Digit${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | `F${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
  | "AltLeft"
  | "AltRight"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "Backslash"
  | "BracketLeft"
  | "BracketRight"
  | "CapsLock"
  | "Comma"
  | "ControlLeft"
  | "Delete"
  | "End"
  | "Enter"
  | "Equal"
  | "Escape"
  | "MetaLeft"
  | "Minus"
  | "PageDown"
  | "Period"
  | "Quote"
  | "Semicolon"
  | "ShiftLeft"
  | "ShiftRight"
  | "Slash"
  | "Space"
  | "Tab"

export type KeySpec = {
  readonly code?: KeyboardCode
  readonly width: number
  readonly tone: KeyTone
  readonly label: string
}

type KeyOptions = {
  readonly code?: KeyboardCode
  readonly tone?: KeyTone
  readonly width?: number
}

const key = (label: string, options: KeyOptions = {}): KeySpec => {
  const base = {
    label,
    tone: options.tone ?? "pearl",
    width: options.width ?? 1,
  }
  return options.code === undefined ? base : { ...base, code: options.code }
}

export const keyboardRows = (): readonly (readonly KeySpec[])[] => [
  [
    key("AUX", { code: "F1", tone: "violet", width: 1.4 }),
    key("MACRO", { code: "F2", tone: "lavender", width: 1.6 }),
    key("COMMS", { code: "F3", width: 1.5 }),
    key("LINK", { code: "F4", tone: "pink", width: 1.5 }),
    key("SCAN", { code: "F5", tone: "cyan", width: 1.45 }),
    key("MODE", { code: "F6", tone: "violet", width: 1.45 }),
    key("LOCK", { code: "F7", width: 1.4 }),
    key("PWR", { code: "F8", tone: "pink", width: 1.35 }),
  ],
  [
    key("ESC", { code: "Escape", tone: "pink" }),
    key("1", { code: "Digit1" }),
    key("2", { code: "Digit2" }),
    key("3", { code: "Digit3", tone: "lavender" }),
    key("4", { code: "Digit4" }),
    key("5", { code: "Digit5" }),
    key("6", { code: "Digit6" }),
    key("7", { code: "Digit7", tone: "violet" }),
    key("8", { code: "Digit8" }),
    key("9", { code: "Digit9" }),
    key("0", { code: "Digit0", tone: "lavender" }),
    key("-", { code: "Minus" }),
    key("+", { code: "Equal", tone: "pink" }),
    key("DEL", { code: "Delete", tone: "violet" }),
  ],
  [
    key("TAB", { code: "Tab", tone: "violet", width: 1.35 }),
    key("Q", { code: "KeyQ" }),
    key("W", { code: "KeyW" }),
    key("E", { code: "KeyE" }),
    key("R", { code: "KeyR", tone: "lavender" }),
    key("T", { code: "KeyT" }),
    key("Y", { code: "KeyY" }),
    key("U", { code: "KeyU", tone: "violet" }),
    key("I", { code: "KeyI" }),
    key("O", { code: "KeyO" }),
    key("P", { code: "KeyP", tone: "lavender" }),
    key("[", { code: "BracketLeft" }),
    key("]", { code: "BracketRight" }),
    key("\\", { code: "Backslash", tone: "cyan", width: 1.25 }),
  ],
  [
    key("CAPS", { code: "CapsLock", tone: "violet", width: 1.55 }),
    key("A", { code: "KeyA" }),
    key("S", { code: "KeyS" }),
    key("D", { code: "KeyD" }),
    key("F", { code: "KeyF" }),
    key("G", { code: "KeyG" }),
    key("H", { code: "KeyH", tone: "lavender" }),
    key("J", { code: "KeyJ" }),
    key("K", { code: "KeyK" }),
    key("L", { code: "KeyL", tone: "violet" }),
    key(";", { code: "Semicolon" }),
    key("'", { code: "Quote" }),
    key("ENTER", { code: "Enter", tone: "violet", width: 1.8 }),
  ],
  [
    key("SHIFT", { code: "ShiftLeft", tone: "violet", width: 1.9 }),
    key("Z", { code: "KeyZ" }),
    key("X", { code: "KeyX" }),
    key("C", { code: "KeyC" }),
    key("V", { code: "KeyV" }),
    key("B", { code: "KeyB" }),
    key("N", { code: "KeyN", tone: "lavender" }),
    key("M", { code: "KeyM" }),
    key(",", { code: "Comma" }),
    key(".", { code: "Period" }),
    key("/", { code: "Slash" }),
    key("SHIFT", { code: "ShiftRight", tone: "violet", width: 1.9 }),
    key("FN", { tone: "lavender" }),
  ],
  [
    key("CTRL", { code: "ControlLeft", tone: "violet", width: 1.3 }),
    key("ALT", { code: "AltLeft", tone: "violet", width: 1.2 }),
    key("SYS", { code: "MetaLeft", tone: "lavender", width: 1.2 }),
    key("SPACE", { code: "Space", tone: "pink", width: 4.4 }),
    key("ALT", { code: "AltRight", tone: "violet", width: 1.2 }),
    key("FN", { tone: "lavender", width: 1.1 }),
    key("←", { code: "ArrowLeft", tone: "violet" }),
    key("↓", { code: "ArrowDown", tone: "violet" }),
    key("↑", { code: "ArrowUp", tone: "lavender" }),
    key("→", { code: "ArrowRight", tone: "violet" }),
    key("PG", { code: "PageDown" }),
    key("END", { code: "End", tone: "violet" }),
  ],
]

export const explodedPosition = (
  authored: Vector3,
  factor: number,
  centralClearance: number,
): Vector3 => {
  const result = authored.clone().multiplyScalar(1 + factor)
  if (authored.lengthSq() < 0.01) result.z += centralClearance * factor
  return result
}
