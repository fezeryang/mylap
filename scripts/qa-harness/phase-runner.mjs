const appendUnique = (target, incoming, keyOf, label) => {
  const known = new Set(target.map(keyOf))
  for (const value of incoming ?? []) {
    const key = keyOf(value)
    if (known.has(key)) throw new Error(`Duplicate ${label} across QA phases: ${key}`)
    known.add(key)
    target.push(value)
  }
}

export const runQaPhases = async ({
  browser = undefined,
  createBrowser = undefined,
  phases,
  pageOptions,
  phaseInput = {},
  aggregate = undefined,
  observePage = () => undefined,
  onLifecycle = () => undefined,
}) => {
  const checks = aggregate?.checks ?? []
  const captures = aggregate?.captures ?? []
  const errors = aggregate?.errors ?? []
  const lifecycles = []

  for (const [phaseIndex, phase] of phases.entries()) {
    const lifecycle = {
      id: phase.id,
      browserOrdinal: createBrowser === undefined ? null : phaseIndex + 1,
      startedAt: new Date().toISOString(),
      endedAt: null,
      contextClosed: false,
      browserClosed: createBrowser === undefined,
    }
    lifecycles.push(lifecycle)
    onLifecycle(lifecycle)
    const phaseBrowser = createBrowser === undefined ? browser : await createBrowser()
    try {
      const context = await phaseBrowser.newContext(pageOptions)
      try {
        const page = await context.newPage()
        observePage(page, phase.id)
        const result = await phase.run({
          ...phaseInput,
          page,
          priorChecks: checks,
          aggregateChecks: checks,
          aggregateCaptures: captures,
        })
        if (result.checks !== checks) appendUnique(checks, result.checks, ({ id }) => id, "check")
        if (result.captures !== captures) {
          appendUnique(captures, result.captures, (capture) => capture, "capture")
        }
        appendUnique(errors, result.errors, (error) => JSON.stringify(error), "error")
      } finally {
        await context.close()
        lifecycle.contextClosed = true
      }
    } finally {
      try {
        if (createBrowser !== undefined) {
          await phaseBrowser.close()
          lifecycle.browserClosed = true
        }
      } finally {
        lifecycle.endedAt = new Date().toISOString()
        onLifecycle(lifecycle)
      }
    }
  }

  return { checks, captures, errors, lifecycles }
}
