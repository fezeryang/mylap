import { describe, expect, test } from "bun:test"

import { createWorkspaceClockService } from "./workspace-clock-service"

type ClockService = ReturnType<typeof createWorkspaceClockService>
type ClockSnapshot = ReturnType<ClockService["read"]>

const STORAGE_KEY = "todou.workspace.clock.v1"

class MemoryStorage implements Storage {
  readonly items = new Map<string, string>()
  readsDenied = false
  writesDenied = false

  get length(): number {
    return this.items.size
  }

  clear(): void {
    this.items.clear()
  }

  getItem(key: string): string | null {
    if (this.readsDenied) throw new DOMException("Denied", "SecurityError")
    return this.items.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.items.delete(key)
  }

  setItem(key: string, value: string): void {
    if (this.writesDenied) throw new DOMException("Full", "QuotaExceededError")
    this.items.set(key, value)
  }
}

class FakeClock {
  now = 100_000
  ticker: (() => void) | null = null
  starts = 0
  stops = 0

  readonly environment = {
    now: (): number => this.now,
    startTicker: (callback: () => void): (() => void) => {
      this.starts += 1
      this.ticker = callback
      return () => {
        this.stops += 1
        this.ticker = null
      }
    },
  }

  advance(milliseconds: number): void {
    this.now += milliseconds
    this.ticker?.()
  }
}

describe("workspace clock service", () => {
  test("two screens receive the same snapshot and unsubscribe stops delivery", () => {
    const clock = new FakeClock()
    const service = createWorkspaceClockService(new MemoryStorage(), clock.environment)
    const phoneSnapshots: ClockSnapshot[] = []
    const computerSnapshots: ClockSnapshot[] = []
    const unsubscribe = service.subscribe((snapshot) => phoneSnapshots.push(snapshot))
    service.subscribe((snapshot) => computerSnapshots.push(snapshot))

    expect(clock.starts).toBe(1)
    expect(service.read().now).toBe(clock.now)
    expect(phoneSnapshots).toHaveLength(0)
    expect(computerSnapshots).toHaveLength(0)

    service.startStopwatch()
    clock.advance(1_250)
    expect(phoneSnapshots).toHaveLength(2)
    expect(computerSnapshots).toHaveLength(2)
    expect(phoneSnapshots[0]).toBe(computerSnapshots[0])
    expect(phoneSnapshots[1]).toBe(computerSnapshots[1])
    expect(phoneSnapshots[1]).toBe(service.read())
    expect(service.read().stopwatch.elapsedMs).toBe(1_250)

    unsubscribe()
    unsubscribe()
    clock.advance(750)
    expect(phoneSnapshots).toHaveLength(2)
    expect(computerSnapshots).toHaveLength(3)
    expect(service.read().stopwatch.elapsedMs).toBe(2_000)
    expect(clock.starts).toBe(1)
    service.dispose()
  })

  test("a delayed tick uses the timer deadline and completes only once", () => {
    const clock = new FakeClock()
    const service = createWorkspaceClockService(new MemoryStorage(), clock.environment)
    let previousStatus = service.read().timer.status
    let completions = 0
    service.subscribe(({ timer }) => {
      if (previousStatus !== "finished" && timer.status === "finished") completions += 1
      previousStatus = timer.status
    })

    expect(service.startTimer(10_000)).toBe(true)
    expect(service.read().timer.deadline).toBe(110_000)
    clock.advance(9_500)
    expect(service.read().timer.remainingMs).toBe(500)
    clock.advance(4_500)
    expect(service.read().timer).toMatchObject({
      status: "finished",
      durationMs: 10_000,
      remainingMs: 0,
      finishedAt: 110_000,
    })
    expect(completions).toBe(1)

    clock.advance(60_000)
    clock.advance(60_000)
    expect(service.read().timer.remainingMs).toBe(0)
    expect(service.read().timer.finishedAt).toBe(110_000)
    expect(completions).toBe(1)
    service.resetTimer()
    expect(service.read().timer).toEqual({
      status: "idle",
      durationMs: 10_000,
      remainingMs: 10_000,
      deadline: null,
      finishedAt: null,
    })
    service.dispose()
  })

  test("pause and resume preserve exact remaining time across a long pause", () => {
    const clock = new FakeClock()
    const service = createWorkspaceClockService(new MemoryStorage(), clock.environment)
    service.startTimer(12_000)
    clock.now += 3_250
    service.pauseTimer()
    expect(service.read().timer).toMatchObject({
      status: "paused",
      remainingMs: 8_750,
      deadline: null,
    })

    clock.advance(50_000)
    service.pauseTimer()
    expect(service.read().timer.remainingMs).toBe(8_750)
    service.resumeTimer()
    const deadline = clock.now + 8_750
    expect(service.read().timer.deadline).toBe(deadline)
    service.resumeTimer()
    expect(service.read().timer.deadline).toBe(deadline)
    clock.advance(8_749)
    expect(service.read().timer.status).toBe("running")
    expect(service.read().timer.remainingMs).toBe(1)
    clock.advance(1)
    expect(service.read().timer.status).toBe("finished")
    service.resumeTimer()
    expect(service.read().timer.status).toBe("finished")
    service.dispose()
  })

  test("running stopwatch and timer resume from their persisted time anchors", () => {
    const storage = new MemoryStorage()
    const clock = new FakeClock()
    const service = createWorkspaceClockService(storage, clock.environment)
    service.startStopwatch()
    service.startTimer(10_000)
    clock.advance(2_500)
    service.dispose()

    const reloadedClock = new FakeClock()
    reloadedClock.now = 105_000
    const reloaded = createWorkspaceClockService(storage, reloadedClock.environment)
    expect(reloaded.read().stopwatch).toMatchObject({ status: "running", elapsedMs: 5_000 })
    expect(reloaded.read().timer).toMatchObject({
      status: "running",
      durationMs: 10_000,
      remainingMs: 5_000,
      deadline: 110_000,
      finishedAt: null,
    })
    reloadedClock.advance(1_000)
    expect(reloaded.read().stopwatch.elapsedMs).toBe(6_000)
    expect(reloaded.read().timer.remainingMs).toBe(4_000)
    reloaded.dispose()
  })

  test("paused state survives a reload without counting time away", () => {
    const storage = new MemoryStorage()
    const clock = new FakeClock()
    const service = createWorkspaceClockService(storage, clock.environment)
    service.startStopwatch()
    service.startTimer(10_000)
    clock.now += 2_000
    service.pauseStopwatch()
    service.pauseTimer()
    service.dispose()

    const reloadedClock = new FakeClock()
    reloadedClock.now = 1_000_000
    const reloaded = createWorkspaceClockService(storage, reloadedClock.environment)
    reloadedClock.advance(60_000)
    expect(reloaded.read().stopwatch).toMatchObject({ status: "paused", elapsedMs: 2_000 })
    expect(reloaded.read().timer).toMatchObject({
      status: "paused",
      remainingMs: 8_000,
      deadline: null,
    })
    reloaded.startStopwatch()
    reloaded.resumeTimer()
    reloadedClock.advance(1_500)
    expect(reloaded.read().stopwatch.elapsedMs).toBe(3_500)
    expect(reloaded.read().timer.remainingMs).toBe(6_500)
    reloaded.dispose()
  })

  test("a timer that expires while closed restores as finished", () => {
    const storage = new MemoryStorage()
    const clock = new FakeClock()
    const service = createWorkspaceClockService(storage, clock.environment)
    service.startTimer(3_000)
    service.dispose()

    const reloadedClock = new FakeClock()
    reloadedClock.now = 900_000
    const reloaded = createWorkspaceClockService(storage, reloadedClock.environment)
    expect(reloaded.read().timer).toMatchObject({
      status: "finished",
      durationMs: 3_000,
      remainingMs: 0,
      finishedAt: 103_000,
    })
    reloadedClock.advance(1_000)
    expect(reloaded.read().timer.finishedAt).toBe(103_000)
    reloaded.dispose()

    const reopened = createWorkspaceClockService(storage, reloadedClock.environment)
    expect(reopened.read().timer.status).toBe("finished")
    expect(reopened.read().timer.finishedAt).toBe(103_000)
    reopened.dispose()
  })

  test("stopwatch laps retain elapsed and split times across pause and reload", () => {
    const storage = new MemoryStorage()
    const clock = new FakeClock()
    const service = createWorkspaceClockService(storage, clock.environment)
    service.lapStopwatch()
    expect(service.read().stopwatch.laps).toEqual([])
    service.startStopwatch()
    clock.now += 1_250
    service.lapStopwatch()
    clock.now += 750
    service.pauseStopwatch()
    service.lapStopwatch()
    expect(service.read().stopwatch.laps).toEqual([
      { number: 1, elapsedMs: 1_250, durationMs: 1_250 },
    ])
    clock.advance(30_000)
    service.startStopwatch()
    clock.now += 500
    service.lapStopwatch()
    expect(service.read().stopwatch.laps).toEqual([
      { number: 1, elapsedMs: 1_250, durationMs: 1_250 },
      { number: 2, elapsedMs: 2_500, durationMs: 1_250 },
    ])
    service.dispose()

    const reloadedClock = new FakeClock()
    reloadedClock.now = clock.now + 1_000
    const reloaded = createWorkspaceClockService(storage, reloadedClock.environment)
    reloaded.lapStopwatch()
    expect(reloaded.read().stopwatch.laps).toEqual([
      { number: 1, elapsedMs: 1_250, durationMs: 1_250 },
      { number: 2, elapsedMs: 2_500, durationMs: 1_250 },
      { number: 3, elapsedMs: 3_500, durationMs: 1_000 },
    ])
    reloaded.resetStopwatch()
    expect(reloaded.read().stopwatch).toEqual({ status: "idle", elapsedMs: 0, laps: [] })
    reloadedClock.advance(1_000)
    expect(reloaded.read().stopwatch.elapsedMs).toBe(0)
    reloaded.dispose()
  })

  test("repeated start keeps elapsed time and lap history stops at 100 entries", () => {
    const clock = new FakeClock()
    const service = createWorkspaceClockService(new MemoryStorage(), clock.environment)
    service.startStopwatch()
    clock.advance(1_000)
    service.startStopwatch()
    clock.advance(1_000)
    expect(service.read().stopwatch.elapsedMs).toBe(2_000)
    for (let index = 0; index < 105; index += 1) {
      clock.now += 10
      service.lapStopwatch()
    }
    expect(service.read().stopwatch.laps).toHaveLength(100)
    expect(service.read().stopwatch.laps[0]?.number).toBe(1)
    expect(service.read().stopwatch.laps[99]).toEqual({
      number: 100,
      elapsedMs: 3_000,
      durationMs: 10,
    })
    service.dispose()
  })

  test("invalid durations preserve an existing timer and valid boundaries work", () => {
    const storage = new MemoryStorage()
    const clock = new FakeClock()
    const service = createWorkspaceClockService(storage, clock.environment)
    expect(service.startTimer(1_000)).toBe(true)
    const beforeInvalid = service.read()
    const saved = storage.getItem(STORAGE_KEY)
    const snapshots: ClockSnapshot[] = []
    service.subscribe((snapshot) => snapshots.push(snapshot))
    for (const duration of [Number.NaN, Infinity, -Infinity, -1, 0, 999, 1_000.5, 359_999_001]) {
      expect(service.startTimer(duration)).toBe(false)
      expect(service.read()).toBe(beforeInvalid)
      expect(storage.getItem(STORAGE_KEY)).toBe(saved)
    }
    expect(snapshots).toHaveLength(0)
    expect(service.startTimer(359_999_000)).toBe(true)
    expect(service.read().timer.durationMs).toBe(359_999_000)
    expect(service.read().timer.remainingMs).toBe(359_999_000)
    service.dispose()
  })

  test.each(["{broken json", "null", "[]", "{}"])(
    "malformed saved state leaves a useful in-memory clock: %s",
    (saved) => {
      const storage = new MemoryStorage()
      storage.setItem(STORAGE_KEY, saved)
      const clock = new FakeClock()
      const service = createWorkspaceClockService(storage, clock.environment)
      expect(service.read().storageError).not.toBeNull()
      expect(service.read().stopwatch.status).toBe("idle")
      expect(service.read().timer.status).toBe("idle")
      service.startStopwatch()
      expect(service.startTimer(5_000)).toBe(true)
      clock.advance(1_500)
      expect(service.read().stopwatch.elapsedMs).toBe(1_500)
      expect(service.read().timer.remainingMs).toBe(3_500)
      expect(service.read().storageError).toBeNull()
      service.dispose()
    },
  )

  test("unavailable storage preserves state and recovery saves current progress", () => {
    const storage = new MemoryStorage()
    storage.readsDenied = true
    storage.writesDenied = true
    const clock = new FakeClock()
    const service = createWorkspaceClockService(storage, clock.environment)
    expect(service.read().storageError).not.toBeNull()
    service.startStopwatch()
    service.startTimer(10_000)
    clock.advance(2_000)
    service.lapStopwatch()
    service.pauseTimer()
    expect(service.read().stopwatch.elapsedMs).toBe(2_000)
    expect(service.read().timer.remainingMs).toBe(8_000)
    expect(service.read().storageError).not.toBeNull()

    storage.readsDenied = false
    storage.writesDenied = false
    service.pauseStopwatch()
    expect(service.read().storageError).toBeNull()
    service.dispose()
    const reloaded = createWorkspaceClockService(storage, clock.environment)
    expect(reloaded.read().stopwatch).toEqual({
      status: "paused",
      elapsedMs: 2_000,
      laps: [{ number: 1, elapsedMs: 2_000, durationMs: 2_000 }],
    })
    expect(reloaded.read().timer).toMatchObject({ status: "paused", remainingMs: 8_000 })
    reloaded.dispose()
  })

  test("snapshots and nested laps remain immutable after later changes", () => {
    const clock = new FakeClock()
    const service = createWorkspaceClockService(new MemoryStorage(), clock.environment)
    service.startStopwatch()
    clock.now += 1_000
    service.lapStopwatch()
    service.startTimer(5_000)
    const snapshot = service.read()
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.stopwatch)).toBe(true)
    expect(Object.isFrozen(snapshot.stopwatch.laps)).toBe(true)
    expect(Object.isFrozen(snapshot.stopwatch.laps[0])).toBe(true)
    expect(Object.isFrozen(snapshot.timer)).toBe(true)

    clock.advance(2_000)
    service.lapStopwatch()
    service.resetTimer()
    expect(snapshot.stopwatch.elapsedMs).toBe(1_000)
    expect(snapshot.stopwatch.laps).toEqual([{ number: 1, elapsedMs: 1_000, durationMs: 1_000 }])
    expect(snapshot.timer.status).toBe("running")
    expect(snapshot.timer.remainingMs).toBe(5_000)
    expect(service.read().stopwatch.laps).toHaveLength(2)
    service.dispose()
  })

  test("disposal clears one ticker and prevents late ticks or calls changing state", () => {
    const storage = new MemoryStorage()
    const clock = new FakeClock()
    const service = createWorkspaceClockService(storage, clock.environment)
    service.startStopwatch()
    service.startTimer(5_000)
    clock.advance(1_000)
    const snapshot = service.read()
    const saved = storage.getItem(STORAGE_KEY)
    const lateTick = clock.ticker
    const snapshots: ClockSnapshot[] = []
    service.subscribe((value) => snapshots.push(value))

    service.dispose()
    service.dispose()
    expect(clock.starts).toBe(1)
    expect(clock.stops).toBe(1)
    expect(clock.ticker).toBeNull()
    const unsubscribe = service.subscribe((value) => snapshots.push(value))
    clock.advance(60_000)
    lateTick?.()
    service.startStopwatch()
    service.pauseStopwatch()
    service.resetStopwatch()
    service.lapStopwatch()
    expect(service.startTimer(1_000)).toBe(false)
    service.pauseTimer()
    service.resumeTimer()
    service.resetTimer()
    unsubscribe()

    expect(service.read()).toBe(snapshot)
    expect(storage.getItem(STORAGE_KEY)).toBe(saved)
    expect(snapshots).toHaveLength(0)
    expect(clock.stops).toBe(1)
  })
})
