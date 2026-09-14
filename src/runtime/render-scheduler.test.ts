import { expect, test } from "bun:test"
import { createRenderScheduler } from "./render-scheduler"

test("idle draws once, animation continues, and paused/disposed work cannot draw", () => {
  const queue = new Map<number, FrameRequestCallback>()
  let id = 0
  let frames = 0
  let animate = false
  const scheduler = createRenderScheduler(
    () => {
      frames++
      return animate
    },
    (callback) => {
      queue.set(++id, callback)
      return id
    },
    (token) => {
      queue.delete(token)
    },
  )
  const flush = (): void => {
    const callbacks = [...queue.values()]
    queue.clear()
    for (const callback of callbacks) callback(frames * 16)
  }
  scheduler.invalidate()
  scheduler.invalidate()
  flush()
  flush()
  expect(frames).toBe(1)
  animate = true
  scheduler.invalidate()
  flush()
  flush()
  expect(frames).toBe(3)
  scheduler.setPaused(true)
  scheduler.invalidate()
  flush()
  expect(frames).toBe(3)
  scheduler.setPaused(false)
  flush()
  expect(frames).toBe(4)
  scheduler.dispose()
  scheduler.invalidate()
  flush()
  expect(frames).toBe(4)
})
