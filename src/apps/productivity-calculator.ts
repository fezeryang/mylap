export interface CalculatorState {
  readonly display: string
  readonly expression: string
  readonly error: string | null
}

export interface Calculator {
  read(): CalculatorState
  press(key: string): CalculatorState
}

type Operator = "+" | "-" | "*" | "/"
type EntryMode = "entry" | "operator" | "result"

const operatorLabels: Readonly<Record<Operator, string>> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
}

function isOperator(key: string): key is Operator {
  return key === "+" || key === "-" || key === "*" || key === "/"
}

function formatNumber(value: number): string {
  return String(Number(value.toPrecision(12)))
}

export function createCalculator(): Calculator {
  let display = "0"
  let expression = ""
  let error: string | null = null
  let accumulator: number | null = null
  let pendingOperator: Operator | null = null
  let repeatedOperation: { readonly operator: Operator; readonly operand: number } | null = null
  let mode: EntryMode = "entry"

  function read(): CalculatorState {
    return { display, expression, error }
  }

  function clear(): void {
    display = "0"
    expression = ""
    error = null
    accumulator = null
    pendingOperator = null
    repeatedOperation = null
    mode = "entry"
  }

  function fail(message: string): void {
    display = "Error"
    error = message
    accumulator = null
    pendingOperator = null
    repeatedOperation = null
    mode = "result"
  }

  function calculate(left: number, operator: Operator, right: number): number | null {
    if (operator === "/" && right === 0) {
      fail("Cannot divide by zero")
      return null
    }
    let result: number
    switch (operator) {
      case "+":
        result = left + right
        break
      case "-":
        result = left - right
        break
      case "*":
        result = left * right
        break
      case "/":
        result = left / right
        break
    }
    if (!Number.isFinite(result)) {
      fail("Result is too large")
      return null
    }
    return Number(formatNumber(result))
  }

  function describeEntry(): void {
    expression =
      accumulator !== null && pendingOperator !== null
        ? `${formatNumber(accumulator)} ${operatorLabels[pendingOperator]}${mode === "entry" ? ` ${display}` : ""}`
        : ""
  }

  function enterCharacter(key: string): void {
    if (mode !== "entry" || display.includes("e")) {
      display = "0"
      mode = "entry"
      repeatedOperation = null
    }
    if (key === ".") {
      if (!display.includes(".")) display += "."
    } else if (display === "0" || display === "-0") {
      display = `${display.startsWith("-") ? "-" : ""}${key}`
    } else if (display.replace(/[^0-9]/g, "").length < 15) {
      display += key
    }
    describeEntry()
  }

  function chooseOperator(operator: Operator): void {
    if (pendingOperator !== null && accumulator !== null && mode === "entry") {
      const result = calculate(accumulator, pendingOperator, Number(display))
      if (result === null) return
      display = formatNumber(result)
    }
    accumulator = Number(display)
    pendingOperator = operator
    repeatedOperation = null
    mode = "operator"
    describeEntry()
  }

  function equals(): void {
    const operator = pendingOperator ?? repeatedOperation?.operator
    const left = pendingOperator !== null ? accumulator : Number(display)
    const right = pendingOperator !== null ? Number(display) : repeatedOperation?.operand
    if (operator === undefined || left === null || right === undefined) {
      mode = "result"
      return
    }
    expression = `${formatNumber(left)} ${operatorLabels[operator]} ${formatNumber(right)} =`
    const result = calculate(left, operator, right)
    if (result === null) return
    display = formatNumber(result)
    accumulator = null
    pendingOperator = null
    repeatedOperation = { operator, operand: right }
    mode = "result"
  }

  function changeSignOrPercent(key: "sign" | "%"): void {
    if (mode === "operator") display = "0"
    mode = "entry"
    repeatedOperation = null
    if (key === "sign") {
      display = display.startsWith("-") ? display.slice(1) : `-${display}`
    } else {
      const base =
        accumulator !== null && (pendingOperator === "+" || pendingOperator === "-")
          ? accumulator
          : 1
      const result = calculate(base, "*", Number(display) / 100)
      if (result === null) return
      display = formatNumber(result)
    }
    describeEntry()
  }

  function backspace(): void {
    if (mode === "operator") return
    mode = "entry"
    repeatedOperation = null
    display = display.includes("e") ? "0" : display.slice(0, -1)
    if (display === "" || display === "-") display = "0"
    describeEntry()
  }

  function press(key: string): CalculatorState {
    const isCharacter = /^[0-9.]$/.test(key)
    if (key === "clear") {
      clear()
      return read()
    }
    if (error !== null) {
      if (isCharacter || key === "backspace") clear()
      else return read()
    }
    if (isCharacter) enterCharacter(key)
    else if (isOperator(key)) chooseOperator(key)
    else if (key === "=") equals()
    else if (key === "sign" || key === "%") changeSignOrPercent(key)
    else if (key === "backspace") backspace()
    return read()
  }

  return { read, press }
}
