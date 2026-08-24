import type { ScreenAppId } from "./ids"
import type { ScreenAppContext, ScreenAppHandle, ScreenAppHost, StageSnapshot } from "./screen-app"
import type { ScreenAppRegistry } from "./screen-app-registry"

export type ScreenSessionOptions = {
  readonly context: ScreenAppContext
  readonly host: ScreenAppHost
  readonly registry: ScreenAppRegistry
}

export class ScreenSession {
  private active = false
  private handle: ScreenAppHandle | null = null
  private powered = true

  constructor(private readonly options: ScreenSessionOptions) {}

  install(appId: ScreenAppId): void {
    this.handle?.dispose()
    this.options.host.clear()
    this.handle = this.options.registry
      .resolve(appId)
      .mount(this.options.host, this.options.context)
    this.handle.setActive(this.active)
  }

  setActive(active: boolean): void {
    this.active = active
    this.handle?.setActive(active)
  }

  setPower(powered: boolean): void {
    this.powered = powered
  }

  get isPowered(): boolean {
    return this.powered
  }

  update(snapshot: StageSnapshot): void {
    if (this.powered) this.handle?.update(snapshot)
  }

  dispose(): void {
    this.handle?.dispose()
    this.handle = null
    this.options.host.clear()
  }
}
