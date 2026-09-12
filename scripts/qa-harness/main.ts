import { availableQaCases, loadQaCase } from "./case-router"

const root = document.querySelector<HTMLElement>("#qa-root")
if (root === null) throw new Error("Component QA root is missing")

const caseId = new URL(window.location.href).searchParams.get("qa-case") ?? ""

try {
  const qaCase = await loadQaCase(caseId)
  if (qaCase.caseId !== caseId) throw new Error(`QA case ID mismatch: ${qaCase.caseId}`)
  await qaCase.mount({ root })
  window.__todouComponentQa = { caseId, ready: true }
  document.documentElement.dataset["qaReady"] = "true"
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown component QA startup failure"
  root.textContent = message
  document.documentElement.dataset["qaError"] = message
  throw error
}

document.documentElement.dataset["qaCases"] = availableQaCases().join(",")
