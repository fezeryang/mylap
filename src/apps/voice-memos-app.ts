import type { WorkspaceFilesService } from "../services/workspace-files-service"
import type { WorkspaceLibraryService } from "../services/workspace-library-service"
import { element, listen } from "./dom"

const duration = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}
const button = (text: string, className = "library-button"): HTMLButtonElement => {
  const node = element("button", className, text)
  node.type = "button"
  return node
}

export const createVoiceMemosApp = (
  service: WorkspaceLibraryService,
  files: WorkspaceFilesService,
) => {
  const root = element("section", "library-app voice-memos-app")
  root.setAttribute("aria-label", "语音备忘录")
  root.dataset["testid"] = "voice-memos-app"
  const header = element("header", "library-header")
  header.append(
    element("h2", "library-heading", "语音备忘录"),
    element("span", "library-subtitle", "留住此刻的声音"),
  )
  const capture = element("section", "voice-capture")
  const label = element("p", "library-subtitle", "准备录音")
  const elapsed = element("output", "voice-elapsed", "00:00")
  elapsed.setAttribute("aria-label", "录音时长")
  const record = button("开始录音", "voice-record-button")
  const pause = button("暂停录音")
  const stop = button("停止并保存", "library-button library-primary")
  const cancel = button("取消录音", "library-button library-danger")
  const actions = element("div", "library-actions")
  actions.append(pause, stop, cancel)
  capture.append(element("span", "voice-symbol", "▂ ▅ ▃ █ ▅ ▂"), label, elapsed, record, actions)
  const status = element("p", "library-status")
  status.setAttribute("role", "status")
  const list = element("div", "voice-list")
  list.setAttribute("aria-label", "所有录音")
  const detail = element("section", "voice-detail")
  detail.hidden = true
  const name = element("input", "voice-name")
  name.type = "text"
  name.maxLength = 120
  name.setAttribute("aria-label", "录音名称")
  const rename = button("保存名称")
  const renameForm = element("form", "library-actions")
  rename.type = "submit"
  renameForm.append(name, rename)
  const play = button("播放录音", "library-button library-primary")
  const seek = element("input", "voice-seek")
  seek.type = "range"
  seek.min = "0"
  seek.max = "0"
  seek.step = ".1"
  seek.setAttribute("aria-label", "录音播放进度")
  const progress = element("span", "library-subtitle")
  const download = button("保存录音到文件")
  const remove = button("删除录音", "library-button library-danger")
  const playbackActions = element("div", "library-actions")
  playbackActions.append(play, download, remove)
  const confirmation = element("div", "library-confirm")
  confirmation.hidden = true
  const keep = button("保留录音")
  const confirm = button("确认删除", "library-button library-danger")
  confirmation.append(element("p", "", "从工作区删除这条录音？"), keep, confirm)
  detail.append(renameForm, seek, progress, playbackActions, confirmation)
  const content = element("div", "voice-content")
  content.append(list, detail)
  root.append(header, capture, status, content)
  let selectedId: string | null = null
  let recordsKey = ""
  let localMessage = ""
  let disposed = false
  const render = (): void => {
    const snapshot = service.read()
    const state = snapshot.recording.status
    record.hidden = state !== "idle"
    actions.hidden = state === "idle"
    pause.hidden = state === "requesting" || state === "saving"
    pause.textContent = state === "paused" ? "继续录音" : "暂停录音"
    stop.disabled = state === "requesting" || state === "saving"
    cancel.disabled = state === "saving"
    capture.dataset["recording"] = String(state === "recording")
    label.textContent = {
      idle: "准备录音",
      requesting: "请允许使用麦克风",
      recording: "正在录音",
      paused: "已暂停",
      saving: "正在保存…",
    }[state]
    elapsed.textContent = duration(snapshot.recording.durationMs)
    status.textContent =
      snapshot.recording.error ?? snapshot.playback.error ?? snapshot.storageError ?? localMessage
    status.hidden = !status.textContent
    const key = JSON.stringify(snapshot.recordings)
    if (recordsKey !== key) {
      recordsKey = key
      list.replaceChildren()
      for (const memo of [...snapshot.recordings].reverse()) {
        const row = button("", "voice-row")
        row.dataset["recordingId"] = memo.id
        row.append(
          element("strong", "", memo.title),
          element(
            "span",
            "library-subtitle",
            `${new Date(memo.addedAt).toLocaleDateString()} · ${duration(memo.durationMs)}`,
          ),
        )
        list.append(row)
      }
      if (!snapshot.recordings.length)
        list.append(element("p", "library-empty", "点击红色按钮，录下你的第一条语音备忘录。"))
    }
    const selected = snapshot.recordings.find((memo) => memo.id === selectedId)
    detail.hidden = selected === undefined
    for (const row of list.querySelectorAll<HTMLButtonElement>("[data-recording-id]"))
      row.setAttribute("aria-pressed", String(row.dataset["recordingId"] === selectedId))
    if (!selected) return
    if (document.activeElement !== name) name.value = selected.title
    const active = snapshot.playback.recordingId === selectedId
    const playing =
      active && (snapshot.playback.status === "playing" || snapshot.playback.status === "loading")
    play.textContent = playing ? "暂停播放" : "播放录音"
    play.disabled = state !== "idle"
    seek.disabled = !active || snapshot.playback.duration <= 0
    seek.max = String(active ? snapshot.playback.duration : selected.durationMs / 1000)
    seek.value = String(active ? snapshot.playback.currentTime : 0)
    progress.textContent = `${duration(active ? snapshot.playback.currentTime * 1000 : 0)} / ${duration(selected.durationMs)}`
  }
  const run = (task: Promise<void>): void => {
    void task.catch((error: unknown) => {
      if (disposed) return
      localMessage = error instanceof Error ? error.message : "操作未完成，请重试。"
      render()
    })
  }
  const cleanups = [
    listen(record, "click", () => run(service.startRecording())),
    listen(pause, "click", () =>
      service.read().recording.status === "paused"
        ? service.resumeRecording()
        : service.pauseRecording(),
    ),
    listen(stop, "click", () => service.stopRecording()),
    listen(cancel, "click", () => service.cancelRecording()),
    listen(list, "click", (event) => {
      if (!(event.target instanceof Element)) return
      const id = event.target.closest<HTMLElement>("[data-recording-id]")?.dataset["recordingId"]
      if (!id) return
      selectedId = id
      confirmation.hidden = true
      name.blur()
      render()
    }),
    listen(renameForm, "submit", (event) => {
      event.preventDefault()
      if (selectedId) {
        name.blur()
        run(service.renameRecording(selectedId, name.value))
      }
    }),
    listen(play, "click", () => {
      if (!selectedId) return
      const playback = service.read().playback
      if (playback.recordingId === selectedId && ["playing", "loading"].includes(playback.status))
        service.pausePlayback()
      else run(service.playRecording(selectedId))
    }),
    listen(seek, "input", () => service.seekPlayback(Number(seek.value))),
    listen(download, "click", () => {
      const memo = service.read().recordings.find((item) => item.id === selectedId)
      if (!memo) return
      const blob = service.recordingBlob(memo.id)
      if (!blob) return
      run(
        files.save(blob, memo.fileName, "语音备忘录").then(() => {
          localMessage = "录音已保存到「文件 / 下载」。"
          if (!disposed) render()
        }),
      )
    }),
    listen(remove, "click", () => {
      confirmation.hidden = false
      keep.focus()
    }),
    listen(keep, "click", () => {
      confirmation.hidden = true
      remove.focus()
    }),
    listen(confirm, "click", () => {
      if (selectedId) run(service.removeRecording(selectedId))
      confirmation.hidden = true
    }),
    service.subscribe(render),
  ]
  render()
  return {
    element: root,
    dispose: (): void => {
      if (disposed) return
      disposed = true
      for (const cleanup of cleanups) cleanup()
    },
  }
}
