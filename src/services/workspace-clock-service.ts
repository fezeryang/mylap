export interface WorkspaceClockLap {
  readonly number: number
  readonly elapsedMs: number
  readonly durationMs: number
}

export interface WorkspaceClockSnapshot {
  readonly now: number
  readonly stopwatch: {
    readonly status: "idle" | "running" | "paused"
    readonly elapsedMs: number
    readonly laps: readonly WorkspaceClockLap[]
  }
  readonly timer: {
    readonly status: "idle" | "running" | "paused" | "finished"
    readonly durationMs: number
    readonly remainingMs: number
    readonly deadline: number | null
    readonly finishedAt: number | null
  }
  readonly storageError: string | null
}

export interface WorkspaceClockEnvironment {
  readonly now: () => number
  readonly startTicker: (callback: () => void) => () => void
}

export interface WorkspaceClockService {
  read(): WorkspaceClockSnapshot
  subscribe(listener: (snapshot: WorkspaceClockSnapshot) => void): () => void
  startStopwatch(): void
  pauseStopwatch(): void
  resetStopwatch(): void
  lapStopwatch(): void
  /** Starts a new timer. Returns false for a noninteger or out-of-range duration. */
  startTimer(durationMs: number): boolean
  pauseTimer(): void
  resumeTimer(): void
  /** Cancels the timer, retaining the chosen duration for the next start. */
  resetTimer(): void
  dispose(): void
}

export const MAX_TIMER_DURATION_MS = (99 * 3600 + 59 * 60 + 59) * 1000
export const MAX_STOPWATCH_DURATION_MS = 100 * 3600 * 1000 - 10
export const MAX_STOPWATCH_LAPS = 100

const STORAGE_KEY = "todou.workspace.clock.v1"
const DEFAULT_DURATION_MS = 5 * 60 * 1000

interface StopwatchState {
  status: WorkspaceClockSnapshot["stopwatch"]["status"]
  elapsedMs: number
  startedAt: number | null
  laps: readonly number[]
}

interface TimerState {
  status: WorkspaceClockSnapshot["timer"]["status"]
  durationMs: number
  remainingMs: number
  deadline: number | null
  finishedAt: number | null
}

const idleStopwatch = (): StopwatchState => ({
  status: "idle",
  elapsedMs: 0,
  startedAt: null,
  laps: [],
})

const idleTimer = (durationMs = DEFAULT_DURATION_MS): TimerState => ({
  status: "idle",
  durationMs,
  remainingMs: durationMs,
  deadline: null,
  finishedAt: null,
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const boundedNumber = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max

const isTimestamp = (value: unknown): value is number => boundedNumber(value, 8.64e15)

const validDuration = (value: unknown): value is number =>
  boundedNumber(value, MAX_TIMER_DURATION_MS) && Number.isInteger(value) && value >= 1000

const parseStopwatch = (value: unknown): StopwatchState | null => {
  if (!isRecord(value)) return null
  const { status, elapsedMs, startedAt, laps } = value
  if (
    (status !== "idle" && status !== "running" && status !== "paused") ||
    !boundedNumber(elapsedMs, MAX_STOPWATCH_DURATION_MS) ||
    (status === "running" ? !isTimestamp(startedAt) : startedAt !== null) ||
    !Array.isArray(laps) ||
    laps.length > MAX_STOPWATCH_LAPS
  ) {
    return null
  }
  let previous = 0
  const parsedLaps: number[] = []
  for (const lap of laps) {
    if (!boundedNumber(lap, elapsedMs) || lap <= previous) return null
    parsedLaps.push(lap)
    previous = lap
  }
  if (status === "idle" && (elapsedMs !== 0 || parsedLaps.length > 0)) return null
  return { status, elapsedMs, startedAt: startedAt as number | null, laps: parsedLaps }
}

const parseTimer = (value: unknown): TimerState | null => {
  if (!isRecord(value)) return null
  const { status, durationMs, remainingMs, deadline, finishedAt } = value
  if (
    (status !== "idle" && status !== "running" && status !== "paused" && status !== "finished") ||
    !validDuration(durationMs) ||
    !boundedNumber(remainingMs, durationMs) ||
    (status === "running" ? !isTimestamp(deadline) : deadline !== null) ||
    (status === "finished" ? !isTimestamp(finishedAt) : finishedAt !== null) ||
    (status === "finished" && remainingMs !== 0) ||
    ((status === "running" || status === "paused") && remainingMs <= 0) ||
    (status === "idle" && remainingMs !== durationMs)
  ) {
    return null
  }
  return {
    status,
    durationMs,
    remainingMs,
    deadline: deadline as number | null,
    finishedAt: finishedAt as number | null,
  }
}

const defaultEnvironment: WorkspaceClockEnvironment = {
  now: () => Date.now(),
  startTicker: (callback) => {
    const interval = setInterval(callback, 100)
    return () => clearInterval(interval)
  },
}

/** Host-owned: all mounted clock UIs share this service, never their own elapsed counters. */
export const createWorkspaceClockService = (
  storage?: Storage,
  environment: WorkspaceClockEnvironment = defaultEnvironment,
): WorkspaceClockService => {
  let stopwatch = idleStopwatch()
  let timer = idleTimer()
  let storageError: string | null = null
  let disposed = false
  const listeners = new Set<(snapshot: WorkspaceClockSnapshot) => void>()

  try {
    const saved = storage?.getItem(STORAGE_KEY)
    if (saved) {
      const value: unknown = JSON.parse(saved)
      const savedStopwatch = isRecord(value) ? parseStopwatch(value["stopwatch"]) : null
      const savedTimer = isRecord(value) ? parseTimer(value["timer"]) : null
      if (!isRecord(value) || value["version"] !== 1 || !savedStopwatch || !savedTimer) {
        throw new Error("Invalid saved clock")
      }
      stopwatch = savedStopwatch
      timer = savedTimer
    }
  } catch {
    storageError = "无法读取已保存的计时，当前页面仍可使用时钟。"
  }

  const persist = (): void => {
    if (!storage) return
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, stopwatch, timer }))
      storageError = null
    } catch {
      storageError = "计时暂时无法保存，刷新页面可能丢失进度。"
    }
  }

  const elapsedAt = (now: number): number =>
    Math.min(
      MAX_STOPWATCH_DURATION_MS,
      stopwatch.elapsedMs +
        (stopwatch.startedAt === null ? 0 : Math.max(0, now - stopwatch.startedAt)),
    )

  const remainingAt = (now: number): number =>
    timer.deadline === null
      ? timer.remainingMs
      : Math.max(0, Math.min(timer.durationMs, timer.deadline - now))

  const settle = (now: number): boolean => {
    let changed = false
    if (timer.status === "running" && timer.deadline !== null && now >= timer.deadline) {
      timer = {
        ...timer,
        status: "finished",
        remainingMs: 0,
        finishedAt: timer.deadline,
        deadline: null,
      }
      changed = true
    }
    if (stopwatch.status === "running" && elapsedAt(now) >= MAX_STOPWATCH_DURATION_MS) {
      stopwatch = {
        ...stopwatch,
        status: "paused",
        elapsedMs: MAX_STOPWATCH_DURATION_MS,
        startedAt: null,
      }
      changed = true
    }
    return changed
  }

  const snapshotAt = (now: number): WorkspaceClockSnapshot =>
    Object.freeze({
      now,
      stopwatch: Object.freeze({
        status: stopwatch.status,
        elapsedMs: elapsedAt(now),
        laps: Object.freeze(
          stopwatch.laps.map((elapsedMs, index) =>
            Object.freeze({
              number: index + 1,
              elapsedMs,
              durationMs: elapsedMs - (stopwatch.laps[index - 1] ?? 0),
            }),
          ),
        ),
      }),
      timer: Object.freeze({ ...timer, remainingMs: remainingAt(now) }),
      storageError,
    })

  const initialNow = environment.now()
  if (settle(initialNow)) persist()
  let snapshot = snapshotAt(initialNow)
  const notify = (): void => {
    for (const listener of listeners) listener(snapshot)
  }

  const refresh = (notifyTick = false): WorkspaceClockSnapshot => {
    if (disposed) return snapshot
    const now = environment.now()
    const transitioned = settle(now)
    if (transitioned) persist()
    if (now !== snapshot.now || transitioned) snapshot = snapshotAt(now)
    if (notifyTick || transitioned) notify()
    return snapshot
  }

  const commit = (now: number): void => {
    persist()
    snapshot = snapshotAt(now)
    notify()
  }

  const stopTicker = environment.startTicker(() => refresh(true))

  return {
    read: () => refresh(),
    subscribe(listener) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    startStopwatch() {
      if (disposed) return
      const current = refresh()
      if (stopwatch.status === "running" || stopwatch.elapsedMs >= MAX_STOPWATCH_DURATION_MS) return
      stopwatch = { ...stopwatch, status: "running", startedAt: current.now }
      commit(current.now)
    },
    pauseStopwatch() {
      if (disposed) return
      const current = refresh()
      if (stopwatch.status !== "running") return
      stopwatch = {
        ...stopwatch,
        status: "paused",
        elapsedMs: current.stopwatch.elapsedMs,
        startedAt: null,
      }
      commit(current.now)
    },
    resetStopwatch() {
      if (disposed || stopwatch.status === "idle") return
      const now = environment.now()
      stopwatch = idleStopwatch()
      if (settle(now)) persist()
      commit(now)
    },
    lapStopwatch() {
      if (disposed) return
      const current = refresh()
      if (stopwatch.status !== "running" || stopwatch.laps.length >= MAX_STOPWATCH_LAPS) return
      const elapsedMs = current.stopwatch.elapsedMs
      if (elapsedMs <= (stopwatch.laps.at(-1) ?? 0)) return
      // Rebase the running checkpoint so every persisted lap is bounded by saved elapsed time.
      stopwatch = {
        ...stopwatch,
        elapsedMs,
        startedAt: current.now,
        laps: [...stopwatch.laps, elapsedMs],
      }
      commit(current.now)
    },
    startTimer(durationMs) {
      if (disposed || !validDuration(durationMs)) return false
      const current = refresh()
      timer = {
        status: "running",
        durationMs,
        remainingMs: durationMs,
        deadline: current.now + durationMs,
        finishedAt: null,
      }
      commit(current.now)
      return true
    },
    pauseTimer() {
      if (disposed) return
      const current = refresh()
      if (timer.status !== "running") return
      timer = { ...timer, status: "paused", remainingMs: current.timer.remainingMs, deadline: null }
      commit(current.now)
    },
    resumeTimer() {
      if (disposed) return
      const current = refresh()
      if (timer.status !== "paused") return
      timer = { ...timer, status: "running", deadline: current.now + timer.remainingMs }
      commit(current.now)
    },
    resetTimer() {
      if (disposed || timer.status === "idle") return
      const now = environment.now()
      timer = idleTimer(timer.durationMs)
      if (settle(now)) persist()
      commit(now)
    },
    dispose() {
      if (disposed) return
      refresh()
      disposed = true
      stopTicker()
      listeners.clear()
    },
  }
}
