import type { RadioDirectory, RadioStation } from "./radio-contracts"
import { RadioDirectoryError } from "./radio-directory"

type DiscoveryCallbacks = {
  readonly commitStations: (stations: readonly RadioStation[]) => void
  readonly commitError: (error: RadioDirectoryError) => void
}

type Caller = {
  readonly resolve: () => void
  readonly reject: (error: DOMException) => void
  readonly signal?: AbortSignal
  readonly onAbort?: () => void
}

type SharedRequest = {
  readonly controller: AbortController
  readonly callers: Set<Caller>
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError")
}

export class RadioDiscovery {
  private request: SharedRequest | null = null
  private cachedSuccess = false
  private disposed = false

  constructor(
    private readonly directory: RadioDirectory,
    private readonly callbacks: DiscoveryCallbacks,
  ) {}

  load(options?: { readonly signal?: AbortSignal; readonly force?: boolean }): Promise<void> {
    if (this.disposed || options?.signal?.aborted) return Promise.reject(abortError())
    if (options?.force === true && this.request !== null) this.abortShared(this.request)
    if (options?.force !== true && this.cachedSuccess) return Promise.resolve()
    if (this.request === null) this.startRequest()
    const request = this.request
    if (request === null) return Promise.reject(abortError())
    return this.attach(request, options?.signal)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.request !== null) this.abortShared(this.request)
  }

  private startRequest(): void {
    const request: SharedRequest = { controller: new AbortController(), callers: new Set() }
    this.request = request
    let listing: Promise<readonly RadioStation[]>
    try {
      listing = this.directory.list(request.controller.signal)
    } catch (error) {
      listing = Promise.reject(error)
    }
    listing.then(
      (stations) => this.onSuccess(request, stations),
      (error: unknown) => this.onFailure(request, error),
    )
  }

  private attach(request: SharedRequest, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        this.detach(request, caller)
        reject(abortError())
        if (request.callers.size === 0 && this.request === request) {
          this.request = null
          request.controller.abort()
        }
      }
      const caller: Caller =
        signal === undefined ? { resolve, reject } : { resolve, reject, signal, onAbort }
      request.callers.add(caller)
      signal?.addEventListener("abort", onAbort, { once: true })
    })
  }

  private onSuccess(request: SharedRequest, stations: readonly RadioStation[]): void {
    if (this.request !== request) return
    this.request = null
    if (stations.length === 0) {
      this.callbacks.commitError(
        new RadioDirectoryError("directory-empty", "No playable radio stations were found"),
      )
    } else {
      this.cachedSuccess = true
      this.callbacks.commitStations(stations)
    }
    this.resolveAll(request)
  }

  private onFailure(request: SharedRequest, error: unknown): void {
    if (this.request !== request) return
    this.request = null
    const terminal =
      error instanceof RadioDirectoryError
        ? error
        : new RadioDirectoryError("directory-unavailable", "Radio directory is unavailable")
    this.callbacks.commitError(terminal)
    this.resolveAll(request)
  }

  private resolveAll(request: SharedRequest): void {
    for (const caller of request.callers) {
      this.detach(request, caller)
      caller.resolve()
    }
  }

  private abortShared(request: SharedRequest): void {
    if (this.request === request) this.request = null
    request.controller.abort()
    for (const caller of request.callers) {
      this.detach(request, caller)
      caller.reject(abortError())
    }
  }

  private detach(request: SharedRequest, caller: Caller): void {
    request.callers.delete(caller)
    if (caller.signal !== undefined && caller.onAbort !== undefined) {
      caller.signal.removeEventListener("abort", caller.onAbort)
    }
  }
}
