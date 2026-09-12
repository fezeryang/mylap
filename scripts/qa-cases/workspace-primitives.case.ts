import type { QaCaseModule } from "../qa-harness/qa-case-contract"

import "../../src/workspace-theme.css"

const stateNames = ["ready", "loading", "empty", "error"] as const
type SoftwareState = (typeof stateNames)[number]

const isSoftwareState = (value: string): value is SoftwareState =>
  stateNames.some((state) => state === value)

const setSoftwareState = (surface: HTMLElement, value: string): void => {
  if (!isSoftwareState(value)) return
  surface.dataset["state"] = value
  const status = surface.querySelector<HTMLElement>("[data-testid='software-status']")
  if (status === null) throw new Error("Software status is missing")
  status.textContent = value === "ready"
    ? "All systems are ready"
    : value === "loading"
      ? "Loading workspace"
      : value === "empty"
        ? "No recent work yet"
        : "A connection issue needs attention"
}

export const caseId = "workspace-primitives"

export const mount: QaCaseModule["mount"] = ({ root }) => {
  root.innerHTML = `
    <section class="workspace-showcase" data-testid="workspace-showcase" aria-labelledby="workspace-title">
      <header class="workspace-showcase__header">
        <div>
          <p class="workspace-showcase__eyebrow">TODŌU / COMPONENT QA</p>
          <h1 id="workspace-title">Light product-stage primitives</h1>
        </div>
        <button class="workspace-icon-button" type="button" data-testid="device-menu" aria-expanded="false" aria-controls="device-menu-panel">
          <span aria-hidden="true">Menu</span>
          <span class="workspace-tooltip" role="tooltip" lang="zh-CN">选择设备</span>
        </button>
      </header>
      <nav class="workspace-menu-panel" id="device-menu-panel" data-testid="device-menu-panel" hidden aria-label="Device menu">
        <button class="workspace-menu-item" type="button">Computer</button>
        <button class="workspace-menu-item" type="button">Phone</button>
        <button class="workspace-menu-item" type="button">Radio</button>
      </nav>
      <section class="workspace-stage" aria-label="Pale model-first stage" data-testid="workspace-stage">
        <div class="workspace-stage__light" aria-hidden="true"></div>
        <p class="workspace-stage__label">Hardware remains authored and unchanged</p>
        <button class="workspace-back-button" type="button" data-testid="back-button">Back</button>
      </section>
      <section class="workspace-primitive-grid" aria-label="Software primitives">
        <article class="workspace-software-card workspace-software-card--computer" data-testid="computer-primitive">
          <div class="workspace-software-card__bar">
            <span>Computer</span>
            <button class="workspace-expand-button" type="button" data-testid="expand-button" aria-haspopup="dialog">Expand</button>
          </div>
          <div class="workspace-software-card__content">
            <p class="workspace-software-card__kicker">WORKSPACE</p>
            <h2>Make space for the task at hand.</h2>
          <p lang="zh-CN">缩放时仍清晰、完整、可编辑。</p>
            <label class="workspace-field-label" for="workspace-note">Quick note</label>
            <textarea class="workspace-textarea" id="workspace-note" rows="2" placeholder="Type with your preferred IME"></textarea>
          </div>
        </article>
        <article class="workspace-software-card workspace-software-card--phone" data-testid="phone-primitive">
          <div class="workspace-software-card__bar"><span>Phone</span><span class="workspace-status-dot">Live</span></div>
          <div class="workspace-phone-home">
            <span class="workspace-phone-home__time">09:41</span>
            <strong>Today, gently organized.</strong>
            <button class="workspace-primary-button" type="button">Open radio</button>
          </div>
        </article>
        <article class="workspace-state-card" data-testid="software-state" data-state="ready" aria-live="polite">
          <p class="workspace-software-card__kicker">STATE SURFACE</p>
          <p data-testid="software-status">All systems are ready</p>
          <div class="workspace-state-card__actions" aria-label="State controls">
            <button type="button" data-state-choice="loading">Loading</button>
            <button type="button" data-state-choice="empty">Empty</button>
            <button type="button" data-state-choice="error">Error</button>
          </div>
        </article>
      </section>
      <aside class="workspace-expanded-surface" data-testid="expanded-surface" hidden role="dialog" aria-modal="true" aria-labelledby="expanded-title">
        <div class="workspace-expanded-surface__sheet">
          <div class="workspace-expanded-surface__header">
            <div><p class="workspace-showcase__eyebrow">COMPUTER</p><h2 id="expanded-title">Expanded workspace</h2></div>
            <button class="workspace-icon-button" type="button" data-testid="close-button">Close</button>
          </div>
          <p>One intentional surface preserves focus, readable content, and a clear return path.</p>
        </div>
      </aside>
    </section>
  `

  const menu = root.querySelector<HTMLElement>("[data-testid='device-menu-panel']")
  const menuButton = root.querySelector<HTMLButtonElement>("[data-testid='device-menu']")
  const expandButton = root.querySelector<HTMLButtonElement>("[data-testid='expand-button']")
  const expandedSurface = root.querySelector<HTMLElement>("[data-testid='expanded-surface']")
  const closeButton = root.querySelector<HTMLButtonElement>("[data-testid='close-button']")
  const softwareState = root.querySelector<HTMLElement>("[data-testid='software-state']")
  if (
    menu === null ||
    menuButton === null ||
    expandButton === null ||
    expandedSurface === null ||
    closeButton === null ||
    softwareState === null
  ) {
    throw new Error("Workspace showcase controls are missing")
  }

  menuButton.addEventListener("click", () => {
    const next = menu.hidden
    menu.hidden = !next
    menuButton.setAttribute("aria-expanded", String(next))
  })
  expandButton.addEventListener("click", () => {
    expandedSurface.hidden = false
    closeButton.focus()
  })
  closeButton.addEventListener("click", () => {
    expandedSurface.hidden = true
    expandButton.focus()
  })
  root.querySelectorAll<HTMLButtonElement>("[data-state-choice]").forEach((button) => {
    button.addEventListener("click", () => setSoftwareState(softwareState, button.dataset["stateChoice"] ?? ""))
  })
}
