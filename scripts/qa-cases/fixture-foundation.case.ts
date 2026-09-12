import { createBrowserPolicy } from "../../src/apps/browser-url-policy"
import type { QaCaseModule } from "../qa-harness/qa-case-contract"

const styles = `
  .fixture-shell { min-height: 100dvh; padding: 24px; display: grid; gap: 16px; align-content: start; }
  .fixture-heading { margin: 0; color: #f4f2ff; font-size: 1rem; letter-spacing: .08em; }
  .fixture-copy { margin: 0; color: #9799de; font-size: .75rem; line-height: 1.4; }
  .fixture-grid { display: grid; gap: 16px; grid-template-columns: minmax(0, 3fr) minmax(240px, 2fr); }
  .fixture-panel { border: 1px solid #34346a; background: #07102b; padding: 16px; }
  .fixture-panel h2 { margin: 0 0 12px; color: #ddd9ee; font-size: .75rem; letter-spacing: .12em; }
  iframe { display: block; width: 100%; min-height: 320px; border: 1px solid #7657ff; background: #f4f2ff; }
  audio { display: block; width: 100%; margin-block: 8px; }
  .fixture-status { color: #55f2bc; font-size: .75rem; }
  @media (max-width: 767px) { .fixture-shell { padding: 16px; } .fixture-grid { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
`

const createAudio = (testId: string, source: string): HTMLAudioElement => {
  const audio = document.createElement("audio")
  audio.controls = true
  audio.preload = "auto"
  audio.dataset["testid"] = testId
  audio.dataset["events"] = ""
  for (const eventName of ["playing", "timeupdate", "pause", "error"] as const) {
    audio.addEventListener(eventName, () => {
      const events = new Set(audio.dataset["events"]?.split(",").filter(Boolean) ?? [])
      events.add(eventName)
      audio.dataset["events"] = [...events].join(",")
    })
  }
  audio.src = source
  return audio
}

export const caseId = "fixture-foundation"

export const mount: QaCaseModule["mount"] = ({ root }) => {
  const policy = createBrowserPolicy({ currentOrigin: window.location.origin, allowRelativeQa: true })
  const decision = policy.evaluate("/qa/iframe-fixture.html")
  if (decision.kind !== "embed") throw new Error("QA iframe fixture was not embeddable")

  const style = document.createElement("style")
  style.textContent = styles
  const shell = document.createElement("section")
  shell.className = "fixture-shell"
  shell.setAttribute("aria-labelledby", "fixture-heading")
  shell.innerHTML = `
    <h1 id="fixture-heading" class="fixture-heading">FIXTURE FOUNDATION</h1>
    <p class="fixture-copy">Real iframe navigation, form submission, popup isolation, and media events.</p>
    <div class="fixture-grid">
      <section class="fixture-panel" aria-labelledby="iframe-heading">
        <h2 id="iframe-heading">SANDBOXED PAGE</h2>
      </section>
      <section class="fixture-panel" aria-labelledby="media-heading">
        <h2 id="media-heading">LOCAL MEDIA</h2>
        <p class="fixture-status" aria-live="polite">Fixtures ready</p>
      </section>
    </div>
  `
  const panels = shell.querySelectorAll<HTMLElement>(".fixture-panel")
  const iframePanel = panels.item(0)
  const mediaPanel = panels.item(1)
  const frame = document.createElement("iframe")
  frame.dataset["testid"] = "fixture-frame"
  frame.title = "Local browser policy fixture"
  frame.setAttribute("sandbox", policy.iframeSandbox)
  frame.referrerPolicy = policy.referrerPolicy
  frame.src = decision.url
  iframePanel.append(frame)
  const validAudio = createAudio("valid-audio", "/qa/valid.wav")
  const missingAudio = createAudio("missing-audio", "/qa/missing.wav")
  const corruptAudio = createAudio("corrupt-audio", "/qa/corrupt.wav")
  const playButton = document.createElement("button")
  playButton.type = "button"
  playButton.textContent = "Play valid WAV"
  playButton.dataset["testid"] = "play-valid-audio"
  playButton.addEventListener("click", () => void validAudio.play())
  const pauseButton = document.createElement("button")
  pauseButton.type = "button"
  pauseButton.textContent = "Pause valid WAV"
  pauseButton.dataset["testid"] = "pause-valid-audio"
  pauseButton.addEventListener("click", () => validAudio.pause())
  mediaPanel.append(playButton, pauseButton, validAudio, missingAudio, corruptAudio)
  root.replaceChildren(style, shell)
}
