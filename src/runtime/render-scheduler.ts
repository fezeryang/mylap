/** One host-owned animation loop. DOM apps run independently of scene rendering. */
export const createRenderScheduler = (
  draw: (timestamp: number, deltaSeconds: number) => boolean,
  request: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancel: (id: number) => void = cancelAnimationFrame,
) => {
  let pending: number | null = null
  let previous: number | null = null
  let paused = false
  let disposed = false
  const invalidate = (): void => {
    if (!disposed && !paused && pending === null) pending = request(tick)
  }
  const tick = (timestamp: number): void => {
    pending = null
    if (paused || disposed) return
    const delta = previous === null ? 1 / 60 : Math.min((timestamp - previous) / 1000, 0.1)
    previous = timestamp
    if (draw(timestamp, delta)) invalidate()
    else previous = null
  }
  return {
    invalidate,
    setPaused(value: boolean): void {
      if (paused === value) return
      paused = value
      previous = null
      if (paused && pending !== null) {
        cancel(pending)
        pending = null
      }
      if (!paused) invalidate()
    },
    dispose(): void {
      disposed = true
      if (pending !== null) cancel(pending)
      pending = null
    },
  }
}
