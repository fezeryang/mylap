import { spawn } from "node:child_process"

export class ProcessExitedBeforeReadyError extends Error {
  constructor(exitCode) {
    super(`Server exited before readiness with code ${exitCode ?? "unknown"}`)
    this.name = "ProcessExitedBeforeReadyError"
    this.exitCode = exitCode
  }
}

const waitForExit = (child) =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode })
      return
    }
    child.once("exit", (code, signal) => resolve({ code, signal }))
  })

export const terminateAndAwait = async (child) => {
  if (child.exitCode !== null || child.signalCode !== null) return waitForExit(child)
  child.kill("SIGTERM")
  const forced = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
  }, 5000)
  const result = await waitForExit(child)
  clearTimeout(forced)
  return result
}

export const spawnLogged = (command, args, options) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.stdout.pipe(options.stdout)
  child.stderr.pipe(options.stderr)
  return child
}

export const waitForViteUrl = (child, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    let output = ""
    const cleanup = () => {
      clearTimeout(timeout)
      child.stdout.off("data", inspect)
      child.stderr.off("data", inspect)
      child.off("exit", onExit)
      child.off("error", onError)
    }
    const settle = (callback, value) => {
      cleanup()
      callback(value)
    }
    const inspect = (chunk) => {
      output += chunk.toString()
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\/?/)
      if (match?.[0] !== undefined) {
        settle(resolve, match[0].replace(/\/$/, ""))
      }
    }
    const onExit = (code) => settle(reject, new ProcessExitedBeforeReadyError(code))
    const onError = (error) => settle(reject, error)
    const timeout = setTimeout(() => settle(reject, new Error("Timed out waiting for Vite URL")), timeoutMs)
    child.stdout.on("data", inspect)
    child.stderr.on("data", inspect)
    child.once("exit", onExit)
    child.once("error", onError)
  })

export const waitForHttpReady = async (url, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const remaining = Math.max(1, deadline - Date.now())
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(remaining),
      })
      if (response.ok) return
    } catch (error) {
      if (
        !(error instanceof TypeError) &&
        !(error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name))
      ) {
        throw error
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for HTTP readiness: ${url}`)
}
