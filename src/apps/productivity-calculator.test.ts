import { describe, expect, test } from "bun:test"
import { type Calculator, createCalculator } from "./productivity-calculator"

function enter(calculator: Calculator, ...keys: readonly string[]): string {
  for (const key of keys) calculator.press(key)
  return calculator.read().display
}

describe("productivity calculator", () => {
  test("evaluates chained operations sequentially and reuses the displayed result", () => {
    const calculator = createCalculator()
    expect(enter(calculator, "2", "+", "3", "*", "4", "=")).toBe("20")
    expect(calculator.read().expression).toBe("5 × 4 =")
    expect(enter(calculator, "-", "5", "=")).toBe("15")
    expect(enter(calculator, "=", "=")).toBe("5")
    expect(enter(calculator, "9")).toBe("9")
    expect(calculator.read().expression).toBe("")
  })

  test("keeps entered decimal places and removes floating point arithmetic artifacts", () => {
    const calculator = createCalculator()
    expect(enter(calculator, ".", "1", ".", "0")).toBe("0.10")
    expect(enter(calculator, "+", ".", "2", "=")).toBe("0.3")
    expect(enter(calculator, "/", "3", "=")).toBe("0.1")
    expect(enter(calculator, ".", "5")).toBe("0.5")
  })

  test("replaces a pending operator and uses the first operand when equals follows it", () => {
    const calculator = createCalculator()
    expect(enter(calculator, "8", "+", "-", "*", "/", "2", "=")).toBe("4")
    expect(enter(calculator, "+", "=")).toBe("8")
    expect(enter(calculator, "=")).toBe("12")
  })

  test("applies percentages relative to addition and subtraction and as a fraction otherwise", () => {
    const calculator = createCalculator()
    expect(enter(calculator, "2", "0", "0", "+", "1", "0", "%", "=")).toBe("220")
    expect(enter(calculator, "clear", "2", "0", "0", "-", "1", "0", "%", "=")).toBe("180")
    expect(enter(calculator, "clear", "2", "0", "0", "*", "1", "0", "%", "=")).toBe("20")
    expect(enter(calculator, "clear", "2", "0", "0", "/", "1", "0", "%", "=")).toBe("2000")
    expect(enter(calculator, "clear", "5", "0", "%")).toBe("0.5")
  })

  test("toggles entered signs and accepts a negative operand after an operator", () => {
    const calculator = createCalculator()
    expect(enter(calculator, "sign", ".", "5")).toBe("-0.5")
    expect(enter(calculator, "sign", "sign")).toBe("-0.5")
    expect(enter(calculator, "clear", "8", "+", "sign", "2", "=")).toBe("6")
    expect(enter(calculator, "sign", "*", "3", "=")).toBe("-18")
    expect(enter(calculator, "clear", "sign", "0", "*", "2", "=")).toBe("0")
  })

  test("shows divide by zero errors and recovers through number entry, decimal, and clear", () => {
    const calculator = createCalculator()
    expect(enter(calculator, "8", "/", "0", "=")).toBe("Error")
    expect(calculator.read()).toEqual({
      display: "Error",
      expression: "8 ÷ 0 =",
      error: "Cannot divide by zero",
    })
    expect(enter(calculator, "+", "=")).toBe("Error")
    expect(enter(calculator, "2", "+", "3", "=")).toBe("5")
    expect(calculator.read().error).toBeNull()
    expect(enter(calculator, "/", "0", "*", ".", "5")).toBe("0.5")
    expect(enter(calculator, "/", "0", "=", "clear")).toBe("0")
    expect(calculator.read()).toEqual({ display: "0", expression: "", error: null })
  })

  test("backspace edits decimals and results without deleting a pending operator", () => {
    const calculator = createCalculator()
    expect(enter(calculator, "1", "2", ".", "3", "backspace")).toBe("12.")
    expect(enter(calculator, "backspace", "backspace", "backspace")).toBe("0")
    expect(enter(calculator, "5", "+", "backspace", "3", "=")).toBe("8")
    expect(enter(calculator, "*", "2", "=", "backspace")).toBe("1")
    expect(enter(calculator, "=", "=")).toBe("1")
    expect(enter(calculator, "/", "0", "=", "backspace")).toBe("0")
    expect(calculator.read().error).toBeNull()
  })

  test("keeps snapshots and calculator instances independent and ignores unsupported keys", () => {
    const first = createCalculator()
    const second = createCalculator()
    const snapshot = first.press("7")
    expect(enter(first, "+", "4", "=")).toBe("11")
    expect(snapshot).toEqual({ display: "7", expression: "", error: null })
    expect(second.read()).toEqual({ display: "0", expression: "", error: null })
    expect(first.press("not-a-key")).toEqual(first.read())
  })

  test("allows fresh entry after scientific notation and reports arithmetic overflow", () => {
    const calculator = createCalculator()
    expect(enter(calculator, "1", "/", "1", "0", "0", "0", "0", "0", "0", "0", "0", "=")).toBe(
      "1e-8",
    )
    expect(enter(calculator, "sign", ".", "5")).toBe("0.5")
    enter(calculator, "clear", "9", "*", "9", "=")
    for (let repetition = 0; repetition < 330; repetition += 1) calculator.press("=")
    expect(calculator.read().display).toBe("Error")
    expect(calculator.read().error).toBe("Result is too large")
    expect(enter(calculator, "clear", "4", "/", "2", "=")).toBe("2")
  })
})
