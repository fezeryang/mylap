import type { WorkspaceDataService } from "../services/workspace-data-service"
import type { WorkspaceFilesService } from "../services/workspace-files-service"
import { element, listen, svgElement } from "./dom"
import { createCalculator } from "./productivity-calculator"

export type ProductivityAppId =
  | "notes"
  | "reminders"
  | "calendar"
  | "files"
  | "calculator"
  | "settings"

export interface ProductivityApp {
  readonly element: HTMLElement
  dispose(): void
}

type Snapshot = ReturnType<WorkspaceDataService["read"]>
type Note = Snapshot["notes"][number]
type Reminder = Snapshot["reminders"][number]
type CalendarEvent = Snapshot["events"][number]
type IconName =
  | "plus"
  | "search"
  | "trash"
  | "back"
  | "next"
  | "note"
  | "folder"
  | "download"
  | "upload"
  | "check"
  | "screen"
  | "phone"
  | "radio"
  | "shield"
  | "sun"
  | "moon"

const iconPaths: Readonly<Record<IconName, string>> = {
  plus: "M12 5v14M5 12h14",
  search: "m16 16 4 4M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7",
  back: "m15 5-7 7 7 7",
  next: "m9 5 7 7-7 7",
  note: "M5 3h14v18H5zM8 8h8M8 12h8M8 16h5",
  folder: "M3 6h7l2 3h9v11H3z",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  upload: "M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5",
  check: "m5 12 4 4L19 6",
  screen: "M3 4h18v13H3zM12 17v4M8 21h8",
  phone: "M7 2h10v20H7zM10 5h4M11 19h2",
  radio: "M4 8h16v12H4zM5 8l13-5M14 11h3M14 14h3M14 17h3M11 14a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  shield: "m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5zM8 11l3 3 5-6",
  sun: "M12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11",
}

const icon = (name: IconName): SVGSVGElement => {
  const svg = svgElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.7",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
    class: "productivity-icon",
  })
  svg.append(svgElement("path", { d: iconPaths[name] }))
  return svg
}

const button = (label: string, action: string, iconName?: IconName): HTMLButtonElement => {
  const node = element("button", "productivity-button")
  node.type = "button"
  node.dataset["action"] = action
  if (iconName) node.append(icon(iconName))
  node.append(element("span", "", label))
  return node
}

const iconButton = (label: string, action: string, iconName: IconName): HTMLButtonElement => {
  const node = button(label, action, iconName)
  node.classList.add("productivity-icon-button")
  node.setAttribute("aria-label", label)
  node.title = label
  return node
}

const field = (label: string, input: HTMLInputElement): HTMLLabelElement => {
  const node = element("label", "productivity-field")
  node.append(element("span", "productivity-label", label), input)
  return node
}

const input = (type: string, label: string, placeholder = ""): HTMLInputElement => {
  const node = element("input", "productivity-input")
  node.type = type
  node.setAttribute("aria-label", label)
  node.placeholder = placeholder
  return node
}

const actionTarget = (event: MouseEvent, root: HTMLElement): HTMLButtonElement | null => {
  if (!(event.target instanceof Element)) return null
  const target = event.target.closest<HTMLButtonElement>("button[data-action]")
  return target && root.contains(target) ? target : null
}

interface ViewScope extends ProductivityApp {
  readonly content: HTMLElement
  readonly toolbar: HTMLElement
  readonly subtitle: HTMLElement
  readonly cleanup: Array<() => void>
  status(message: string, error?: boolean): void
}

const createView = (
  id: ProductivityAppId,
  title: string,
  description: string,
  service: WorkspaceDataService,
): ViewScope => {
  const root = element("section", `productivity-app productivity-${id}`)
  root.dataset["appId"] = id
  root.setAttribute("aria-label", title)
  const header = element("header", "productivity-header")
  const heading = element("div", "productivity-heading")
  const subtitle = element("p", "productivity-subtitle", description)
  heading.append(element("h1", "productivity-title", title), subtitle)
  const toolbar = element("div", "productivity-toolbar")
  header.append(heading, toolbar)
  const content = element("div", "productivity-content")
  const status = element("p", "productivity-status")
  status.setAttribute("role", "status")
  status.hidden = true
  const storage = element("p", "productivity-storage-error")
  storage.setAttribute("role", "alert")
  const renderStorage = (snapshot: Snapshot): void => {
    storage.hidden = !snapshot.storageError
    storage.textContent = snapshot.storageError
      ? `${snapshot.storageError} Changes are available for this session.`
      : ""
  }
  const cleanup = [service.subscribe(renderStorage)]
  renderStorage(service.read())
  root.append(header, content, status, storage)
  return {
    element: root,
    content,
    toolbar,
    subtitle,
    cleanup,
    status(message, error = false) {
      status.textContent = message
      status.hidden = !message
      status.classList.toggle("productivity-is-error", error)
    },
    dispose() {
      for (const release of cleanup.splice(0)) release()
    },
  }
}

interface KeyedRow<T> {
  readonly element: HTMLElement
  update(value: T): void
}

const keyedList = <T extends { readonly id: string }>(
  host: HTMLElement,
  create: (value: T) => KeyedRow<T>,
): ((values: readonly T[]) => void) => {
  const rows = new Map<string, KeyedRow<T>>()
  return (values) => {
    const ids = new Set(values.map((value) => value.id))
    for (const [id, row] of rows) {
      if (!ids.has(id)) {
        row.element.remove()
        rows.delete(id)
      }
    }
    let previous: HTMLElement | null = null
    for (const value of values) {
      let row = rows.get(value.id)
      if (!row) {
        row = create(value)
        rows.set(value.id, row)
      }
      row.update(value)
      const next: ChildNode | null = previous ? previous.nextSibling : host.firstChild
      if (next !== row.element) host.insertBefore(row.element, next)
      previous = row.element
    }
  }
}

const noteTitle = (note: Note): string => note.title.trim() || "Untitled Note"
const notePreview = (note: Note): string =>
  note.text.trim().replace(/\s+/g, " ") || "No additional text"
const dateLabel = (value: string | number): string =>
  new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })

const createNotes = (service: WorkspaceDataService): ProductivityApp => {
  const view = createView("notes", "Notes", "A little space for your thoughts.", service)
  const { element: root } = view
  root.dataset["notesMode"] = "list"
  let selectedId: string | null = service.read().notes[0]?.id ?? null
  let editorId: string | null = null
  let composingTitle = false
  let composingBody = false
  const sidebar = element("aside", "productivity-notes-sidebar")
  const searchBox = element("div", "productivity-search")
  const search = input("search", "Search notes", "Search")
  searchBox.append(icon("search"), search)
  const listLabel = element("h2", "productivity-section-label", "All Notes")
  const count = element("span", "productivity-count")
  listLabel.append(count)
  const list = element("div", "productivity-note-list")
  list.setAttribute("aria-label", "Notes")
  const noResults = element("p", "productivity-empty", "No notes yet. Start with a new note.")
  sidebar.append(searchBox, listLabel, list, noResults)
  const editor = element("section", "productivity-note-editor")
  editor.setAttribute("aria-label", "Note editor")
  const editorToolbar = element("div", "productivity-editor-toolbar")
  const back = button("Notes", "back", "back")
  back.classList.add("productivity-note-back")
  const saved = element("span", "productivity-editor-date")
  const remove = iconButton("Delete note", "delete", "trash")
  editorToolbar.append(back, saved, remove)
  const title = input("text", "Note title", "Title")
  title.classList.add("productivity-note-title")
  title.maxLength = 200
  const body = element("textarea", "productivity-note-body")
  body.setAttribute("aria-label", "Note text")
  body.placeholder = "Start writing…"
  body.spellcheck = true
  const emptyEditor = element("div", "productivity-note-empty")
  emptyEditor.append(
    icon("note"),
    element("h2", "", "Your next idea starts here."),
    element("p", "", "Create a note to make a little room for it."),
  )
  const confirmation = element("div", "productivity-confirm")
  confirmation.hidden = true
  confirmation.setAttribute("role", "group")
  confirmation.setAttribute("aria-label", "Confirm note deletion")
  confirmation.append(
    element("p", "", "Delete this note? This cannot be undone."),
    button("Cancel", "cancel-delete"),
    button("Delete Note", "confirm-delete"),
  )
  editor.append(editorToolbar, title, body, emptyEditor, confirmation)
  view.content.append(sidebar, editor)
  view.toolbar.append(button("New Note", "new", "plus"))
  const renderList = keyedList<Note>(list, (note) => {
    const row = button("", "select")
    row.className = "productivity-note-row"
    row.dataset["noteId"] = note.id
    const name = element("strong", "productivity-note-row-title")
    const preview = element("span", "productivity-note-preview")
    const date = element("span", "productivity-note-date")
    row.replaceChildren(name, preview, date)
    return {
      element: row,
      update(value) {
        name.textContent = noteTitle(value)
        preview.textContent = notePreview(value)
        date.textContent = dateLabel(value.updatedAt)
        row.setAttribute("aria-pressed", String(value.id === selectedId))
      },
    }
  })
  const render = (snapshot: Snapshot): void => {
    if (!snapshot.notes.some((note) => note.id === selectedId)) {
      selectedId = snapshot.notes[0]?.id ?? null
    }
    const query = search.value.trim().toLocaleLowerCase()
    const filtered = snapshot.notes.filter((note) =>
      `${note.title} ${note.text}`.toLocaleLowerCase().includes(query),
    )
    renderList(filtered)
    count.textContent = String(snapshot.notes.length)
    noResults.hidden = filtered.length > 0
    noResults.textContent = query
      ? "No notes match your search."
      : "No notes yet. Start with a new note."
    const selected = snapshot.notes.find((note) => note.id === selectedId)
    title.hidden = !selected
    body.hidden = !selected
    remove.disabled = !selected
    emptyEditor.hidden = !!selected
    if (selected) {
      const changedNote = editorId !== selected.id
      if (changedNote || (document.activeElement !== title && !composingTitle))
        title.value = selected.title
      if (changedNote || (document.activeElement !== body && !composingBody))
        body.value = selected.text
      editorId = selected.id
      saved.textContent = `Edited ${dateLabel(selected.updatedAt)}`
    } else {
      editorId = null
      saved.textContent = ""
    }
  }
  const saveTitle = (): void => {
    if (selectedId && !composingTitle) service.updateNote(selectedId, { title: title.value })
  }
  const saveBody = (): void => {
    if (selectedId && !composingBody) service.updateNote(selectedId, { text: body.value })
  }
  view.cleanup.push(
    listen(search, "input", () => render(service.read())),
    listen(title, "input", saveTitle),
    listen(body, "input", saveBody),
    listen(title, "compositionstart", () => {
      composingTitle = true
    }),
    listen(title, "compositionend", () => {
      composingTitle = false
      saveTitle()
    }),
    listen(body, "compositionstart", () => {
      composingBody = true
    }),
    listen(body, "compositionend", () => {
      composingBody = false
      saveBody()
    }),
    listen(root, "click", (event) => {
      const target = actionTarget(event, root)
      if (!target) return
      switch (target.dataset["action"]) {
        case "new":
          selectedId = service.createNote()
          search.value = ""
          confirmation.hidden = true
          root.dataset["notesMode"] = "editor"
          render(service.read())
          title.focus()
          break
        case "select":
          selectedId = target.dataset["noteId"] ?? null
          confirmation.hidden = true
          root.dataset["notesMode"] = "editor"
          render(service.read())
          break
        case "back":
          root.dataset["notesMode"] = "list"
          break
        case "delete":
          confirmation.hidden = false
          confirmation.querySelector<HTMLButtonElement>("button")?.focus()
          break
        case "cancel-delete":
          confirmation.hidden = true
          remove.focus()
          break
        case "confirm-delete":
          if (selectedId) service.deleteNote(selectedId)
          confirmation.hidden = true
          root.dataset["notesMode"] = "list"
          view.status("Note deleted.")
          break
      }
    }),
    service.subscribe(render),
  )
  render(service.read())
  return view
}

const createReminders = (service: WorkspaceDataService): ProductivityApp => {
  const view = createView("reminders", "Reminders", "Make room for what matters.", service)
  const { element: root } = view
  const summary = element("div", "productivity-reminder-summary")
  const total = element("strong", "productivity-reminder-total")
  const completed = element("p", "productivity-subtitle")
  const summaryText = element("div", "")
  summaryText.append(element("h2", "", "My Reminders"), completed)
  summary.append(summaryText, total)
  const form = element("form", "productivity-add-form")
  const text = input("text", "New reminder", "Add a reminder")
  text.required = true
  text.maxLength = 500
  const add = button("Add", "add", "plus")
  add.type = "submit"
  form.append(text, add)
  const filters = element("div", "productivity-segmented")
  filters.setAttribute("aria-label", "Filter reminders")
  const filterButtons = [
    button("All", "all"),
    button("To Do", "pending"),
    button("Completed", "completed"),
  ]
  filters.append(...filterButtons)
  let filter: "all" | "pending" | "completed" = "all"
  const list = element("ul", "productivity-reminder-list")
  const empty = element("div", "productivity-empty")
  empty.append(
    icon("check"),
    element("h3", "", "All clear."),
    element("p", "", "Add something you’d like to remember."),
  )
  view.content.append(summary, form, filters, list, empty)
  const renderList = keyedList<Reminder>(list, (reminder) => {
    const row = element("li", "productivity-reminder-row")
    const label = element("label", "productivity-reminder-check")
    const checkbox = input("checkbox", reminder.text)
    checkbox.dataset["reminderId"] = reminder.id
    const title = element("span", "")
    label.append(checkbox, title)
    const remove = iconButton("Delete reminder", "delete", "trash")
    remove.dataset["reminderId"] = reminder.id
    row.append(label, remove)
    return {
      element: row,
      update(value) {
        title.textContent = value.text
        checkbox.checked = value.completed
        checkbox.setAttribute("aria-label", value.text)
        row.classList.toggle("productivity-is-completed", value.completed)
      },
    }
  })
  const render = (snapshot: Snapshot): void => {
    const completeCount = snapshot.reminders.filter((reminder) => reminder.completed).length
    const pendingCount = snapshot.reminders.length - completeCount
    total.textContent = String(pendingCount)
    total.setAttribute("aria-label", `${pendingCount} reminders remaining`)
    completed.textContent = `${completeCount} completed · ${pendingCount} remaining`
    for (const node of filterButtons)
      node.setAttribute("aria-pressed", String(node.dataset["action"] === filter))
    const filtered = snapshot.reminders.filter(
      (reminder) =>
        filter === "all" || (filter === "completed" ? reminder.completed : !reminder.completed),
    )
    renderList(filtered)
    empty.hidden = filtered.length > 0
  }
  view.cleanup.push(
    listen(form, "submit", (event) => {
      event.preventDefault()
      if (!text.value.trim()) return
      service.addReminder(text.value.trim())
      text.value = ""
      text.focus()
      view.status("Reminder added.")
    }),
    listen(root, "change", (event) => {
      if (!(event.target instanceof HTMLInputElement)) return
      const id = event.target.dataset["reminderId"]
      if (id) service.toggleReminder(id)
    }),
    listen(root, "click", (event) => {
      const target = actionTarget(event, root)
      const action = target?.dataset["action"]
      if (action === "all" || action === "pending" || action === "completed") {
        filter = action
        render(service.read())
      } else if (action === "delete") {
        const id = target?.dataset["reminderId"]
        if (id) service.deleteReminder(id)
      }
    }),
    service.subscribe(render),
  )
  render(service.read())
  return view
}

const localDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

const createCalendar = (service: WorkspaceDataService): ProductivityApp => {
  const view = createView("calendar", "Calendar", "Give your day a little intention.", service)
  const { element: root } = view
  const now = new Date()
  const today = localDate(now)
  let year = now.getFullYear()
  let month = now.getMonth()
  let selectedDate = today
  const calendar = element("section", "productivity-calendar-month")
  calendar.setAttribute("aria-label", "Month calendar")
  const navigation = element("div", "productivity-calendar-navigation")
  const monthTitle = element("h2", "")
  const navigationButtons = element("div", "productivity-toolbar")
  navigationButtons.append(
    iconButton("Previous month", "previous", "back"),
    button("Today", "today"),
    iconButton("Next month", "next", "next"),
  )
  navigation.append(monthTitle, navigationButtons)
  const weekdays = element("div", "productivity-calendar-weekdays")
  for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])
    weekdays.append(element("span", "", day))
  const grid = element("div", "productivity-calendar-grid")
  const days: HTMLButtonElement[] = []
  for (let index = 0; index < 42; index++) {
    const day = button("", "select-date")
    day.className = "productivity-calendar-day"
    day.replaceChildren(
      element("span", "productivity-day-number"),
      element("span", "productivity-day-indicator"),
    )
    days.push(day)
    grid.append(day)
  }
  calendar.append(navigation, weekdays, grid)
  const agenda = element("section", "productivity-agenda")
  const agendaTitle = element("h2", "")
  const agendaSubtitle = element("p", "productivity-subtitle")
  const events = element("ul", "productivity-event-list")
  const empty = element("p", "productivity-empty", "Nothing planned. A little breathing room.")
  const form = element("form", "productivity-event-form")
  const name = input("text", "Event title", "What’s happening?")
  name.required = true
  name.maxLength = 200
  const date = input("date", "Event date")
  date.required = true
  date.value = selectedDate
  const time = input("time", "Event time")
  time.required = true
  time.value = "09:00"
  const dateTime = element("div", "productivity-event-datetime")
  dateTime.append(field("Date", date), field("Time", time))
  const add = button("Add Event", "add-event", "plus")
  add.type = "submit"
  form.append(element("h3", "", "New Event"), field("Title", name), dateTime, add)
  agenda.append(agendaTitle, agendaSubtitle, events, empty, form)
  view.content.append(calendar, agenda)
  const renderEvents = keyedList<CalendarEvent>(events, (event) => {
    const row = element("li", "productivity-event-row")
    const details = element("div", "")
    const name = element("strong", "")
    const time = element("span", "productivity-subtitle")
    details.append(name, time)
    const remove = iconButton("Delete event", "delete-event", "trash")
    remove.dataset["eventId"] = event.id
    row.append(details, remove)
    return {
      element: row,
      update(value) {
        name.textContent = value.title
        time.textContent = value.time
        remove.setAttribute("aria-label", `Delete ${value.title}`)
      },
    }
  })
  const render = (snapshot: Snapshot): void => {
    monthTitle.textContent = new Date(year, month, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    })
    const start = new Date(year, month, 1)
    start.setDate(start.getDate() - start.getDay())
    days.forEach((day, index) => {
      const value = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
      const key = localDate(value)
      const eventCount = snapshot.events.filter((event) => event.date === key).length
      day.dataset["date"] = key
      const number = day.querySelector(".productivity-day-number")
      if (number) number.textContent = String(value.getDate())
      day.classList.toggle("productivity-other-month", value.getMonth() !== month)
      day.classList.toggle("productivity-has-events", eventCount > 0)
      day.setAttribute("aria-pressed", String(key === selectedDate))
      day.setAttribute(
        "aria-label",
        `${value.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${eventCount ? `, ${eventCount} event${eventCount === 1 ? "" : "s"}` : ""}`,
      )
      if (key === today) day.setAttribute("aria-current", "date")
      else day.removeAttribute("aria-current")
    })
    const selected = new Date(`${selectedDate}T12:00:00`)
    agendaTitle.textContent =
      selectedDate === today ? "Today" : selected.toLocaleDateString(undefined, { weekday: "long" })
    agendaSubtitle.textContent = selected.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    const filtered = snapshot.events
      .filter((event) => event.date === selectedDate)
      .sort((a, b) => a.time.localeCompare(b.time))
    renderEvents(filtered)
    empty.hidden = filtered.length > 0
  }
  const selectDate = (value: string): void => {
    selectedDate = value
    date.value = value
    const selected = new Date(`${value}T12:00:00`)
    year = selected.getFullYear()
    month = selected.getMonth()
    render(service.read())
  }
  view.cleanup.push(
    listen(root, "click", (event) => {
      const target = actionTarget(event, root)
      const action = target?.dataset["action"]
      if (action === "previous" || action === "next") {
        const next = new Date(year, month + (action === "next" ? 1 : -1), 1)
        year = next.getFullYear()
        month = next.getMonth()
        render(service.read())
      } else if (action === "today") selectDate(localDate(new Date()))
      else if (action === "select-date") {
        const value = target?.dataset["date"]
        if (value) selectDate(value)
      } else if (action === "delete-event") {
        const id = target?.dataset["eventId"]
        if (id) service.deleteEvent(id)
      }
    }),
    listen(form, "submit", (event) => {
      event.preventDefault()
      if (!name.value.trim() || !date.value || !time.value) return
      service.addEvent({ title: name.value.trim(), date: date.value, time: time.value })
      selectDate(date.value)
      name.value = ""
      view.status("Event added to your calendar.")
    }),
    service.subscribe(render),
  )
  render(service.read())
  return view
}

const createFiles = (
  service: WorkspaceDataService,
  files?: WorkspaceFilesService,
): ProductivityApp => {
  const view = createView("files", "Files", "Your notes, ready to take with you.", service)
  const { element: root } = view
  let disposed = false
  const importButton = button("Import", "import", "upload")
  view.toolbar.append(importButton)
  const upload = input("file", "Import text or Markdown files")
  upload.accept = ".txt,.md,.markdown,text/plain,text/markdown"
  upload.multiple = true
  upload.hidden = true
  const location = element("div", "productivity-files-location")
  location.append(
    icon("folder"),
    element("span", "", "On This Workspace"),
    element("span", "productivity-files-divider", "/"),
    element("strong", "", "Notes"),
  )
  const explanation = element(
    "p",
    "productivity-subtitle",
    "Import a text or Markdown file as a note. Export any note as a text file.",
  )
  const list = element("ul", "productivity-file-list")
  const empty = element("div", "productivity-empty")
  empty.append(
    icon("folder"),
    element("h2", "", "A home for your words."),
    element("p", "", "Create a note or import a text file to see it here."),
  )
  view.content.append(upload, location, explanation, list, empty)
  const renderList = keyedList<Note>(list, (note) => {
    const row = element("li", "productivity-file-row")
    const documentIcon = element("span", "productivity-file-icon")
    documentIcon.append(icon("note"))
    const details = element("div", "productivity-file-details")
    const title = element("strong", "")
    const metadata = element("span", "productivity-subtitle")
    details.append(title, metadata)
    const download = iconButton("Export note", "export", "download")
    download.dataset["noteId"] = note.id
    row.append(documentIcon, details, download)
    return {
      element: row,
      update(value) {
        title.textContent = `${noteTitle(value)}.txt`
        const bytes = new Blob([`${value.title}\n\n${value.text}`]).size
        metadata.textContent = `${dateLabel(value.updatedAt)} · ${bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`} · Text document`
        download.setAttribute("aria-label", `Export ${noteTitle(value)}`)
      },
    }
  })
  const render = (snapshot: Snapshot): void => {
    renderList(snapshot.notes)
    empty.hidden = snapshot.notes.length > 0
  }
  const importFiles = async (): Promise<void> => {
    const files = Array.from(upload.files ?? [])
    if (!files.length) return
    importButton.disabled = true
    let count = 0
    const failures: string[] = []
    for (const file of files) {
      if (disposed) return
      if (
        !/\.(txt|md|markdown)$/i.test(file.name) &&
        file.type !== "text/plain" &&
        file.type !== "text/markdown"
      ) {
        failures.push(`${file.name}: choose a text or Markdown file`)
        continue
      }
      if (file.size > 2 * 1024 * 1024) {
        failures.push(`${file.name}: the file is larger than 2 MB`)
        continue
      }
      try {
        const text = await file.text()
        if (disposed) return
        if (text.includes("\u0000")) {
          failures.push(`${file.name}: this does not appear to be a text file`)
          continue
        }
        service.createNote(file.name.replace(/\.(txt|md|markdown)$/i, ""), text)
        count++
      } catch {
        failures.push(`${file.name}: the file could not be read`)
      }
    }
    upload.value = ""
    importButton.disabled = false
    view.status(
      [count ? `Imported ${count} ${count === 1 ? "note" : "notes"}.` : "", ...failures]
        .filter(Boolean)
        .join(" "),
      failures.length > 0,
    )
  }
  view.cleanup.push(
    listen(upload, "change", () => {
      void importFiles()
    }),
    listen(root, "click", (event) => {
      const target = actionTarget(event, root)
      if (target?.dataset["action"] === "import") upload.click()
      else if (target?.dataset["action"] === "export") {
        const note = service.read().notes.find((note) => note.id === target.dataset["noteId"])
        if (!note) return
        const name = `${noteTitle(note)
          .replace(/[<>:"/\\|?*]/g, "-")
          .replace(/\p{Cc}/gu, "-")
          .slice(0, 80)}.txt`
        if (!files) {
          view.status("文件存储不可用", true)
          return
        }
        void files
          .save(
            new Blob([`${note.title}\n\n${note.text}`], { type: "text/plain;charset=utf-8" }),
            name,
            "备忘录",
          )
          .then(() => {
            if (!disposed) view.status("已保存到「下载」，可在所有设备中查看或导出。")
          })
          .catch((error: unknown) => {
            if (!disposed) view.status(error instanceof Error ? error.message : "保存失败", true)
          })
      }
    }),
    service.subscribe(render),
    () => {
      disposed = true
    },
  )
  render(service.read())
  return view
}

const createCalculatorApp = (service: WorkspaceDataService): ProductivityApp => {
  const view = createView("calculator", "Calculator", "A clear head for the numbers.", service)
  const { element: root } = view
  const calculator = createCalculator()
  const panel = element("div", "productivity-calculator-panel")
  panel.tabIndex = 0
  panel.setAttribute("aria-label", "Calculator. Use the buttons or your keyboard.")
  const expression = element("p", "productivity-calculator-expression")
  const display = element("output", "productivity-calculator-display", "0")
  display.setAttribute("aria-label", "Result")
  display.setAttribute("aria-live", "polite")
  const keys = element("div", "productivity-calculator-keys")
  const keyDefinitions = [
    ["AC", "clear", "utility", "All clear"],
    ["±", "sign", "utility", "Change sign"],
    ["%", "%", "utility", "Percent"],
    ["÷", "/", "operator", "Divide"],
    ["7", "7", "number", "7"],
    ["8", "8", "number", "8"],
    ["9", "9", "number", "9"],
    ["×", "*", "operator", "Multiply"],
    ["4", "4", "number", "4"],
    ["5", "5", "number", "5"],
    ["6", "6", "number", "6"],
    ["−", "-", "operator", "Subtract"],
    ["1", "1", "number", "1"],
    ["2", "2", "number", "2"],
    ["3", "3", "number", "3"],
    ["+", "+", "operator", "Add"],
    ["⌫", "backspace", "number", "Backspace"],
    ["0", "0", "number", "0"],
    [".", ".", "number", "Decimal point"],
    ["=", "=", "operator", "Equals"],
  ] as const
  for (const [label, key, kind, accessibleLabel] of keyDefinitions) {
    const node = button(label, "calculate")
    node.className = `productivity-calculator-key productivity-key-${kind}`
    node.dataset["key"] = key
    node.setAttribute("aria-label", accessibleLabel)
    keys.append(node)
  }
  const help = element(
    "p",
    "productivity-calculator-help",
    "Type to calculate · Enter for equals · Esc to clear",
  )
  panel.append(expression, display, keys, help)
  view.content.append(panel)
  const press = (key: string): void => {
    const state = calculator.press(key)
    expression.textContent = state.expression
    display.textContent = state.error ? "Error" : state.display
    display.classList.toggle("productivity-calculator-long", state.display.length > 10)
    view.status(state.error ?? "", !!state.error)
  }
  view.cleanup.push(
    listen(root, "click", (event) => {
      const key = actionTarget(event, root)?.dataset["key"]
      if (key) press(key)
    }),
    listen(root, "keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
      const key =
        event.key === "Enter"
          ? "="
          : event.key === "Escape" || event.key === "Delete"
            ? "clear"
            : event.key === "Backspace"
              ? "backspace"
              : event.key
      if (!/^[0-9.+\-*/%=]$/.test(key) && key !== "clear" && key !== "backspace") return
      event.preventDefault()
      event.stopPropagation()
      press(key)
    }),
  )
  return view
}

const createSettings = (service: WorkspaceDataService): ProductivityApp => {
  const view = createView("settings", "Settings", "Make this space your own.", service)
  const { element: root } = view
  const appearance = element("fieldset", "productivity-settings-group")
  appearance.append(element("legend", "", "Appearance"))
  const appearanceOptions = element("div", "productivity-appearance-options")
  const light = button("Light", "light", "sun")
  const dark = button("Dark", "dark", "moon")
  appearanceOptions.append(light, dark)
  appearance.append(appearanceOptions)
  const wallpaper = element("fieldset", "productivity-settings-group")
  wallpaper.append(element("legend", "", "Wallpaper"))
  const wallpaperOptions = element("div", "productivity-wallpaper-options")
  const wallpaperButtons = (["sunrise", "ocean", "lavender"] as const).map((name) => {
    const node = button(name[0]?.toUpperCase() + name.slice(1), name)
    node.classList.add("productivity-wallpaper-option")
    const swatch = element("span", `productivity-wallpaper-swatch productivity-wallpaper-${name}`)
    swatch.setAttribute("aria-hidden", "true")
    node.prepend(swatch)
    return node
  })
  wallpaperOptions.append(...wallpaperButtons)
  wallpaper.append(wallpaperOptions)
  const motion = element("div", "productivity-settings-row")
  const motionLabel = element("label", "productivity-settings-switch")
  const motionText = element("span", "")
  motionText.append(
    element("strong", "", "Reduce Motion"),
    element("span", "productivity-subtitle", "Use quieter transitions throughout your workspace."),
  )
  const reducedMotion = input("checkbox", "Reduce Motion")
  reducedMotion.setAttribute("role", "switch")
  motionLabel.append(motionText, reducedMotion)
  motion.append(motionLabel)
  const devices = element("fieldset", "productivity-settings-group")
  devices.append(element("legend", "", "Your Devices"))
  const deviceOptions = element("div", "productivity-device-options")
  for (const [label, id, iconName] of [
    ["Computer", "computer-main", "screen"],
    ["Phone", "phone-main", "phone"],
    ["Radio", "radio-main", "radio"],
  ] as const) {
    const node = button(label, "focus-device", iconName)
    node.dataset["focusDevice"] = id
    node.setAttribute("aria-label", `Focus ${label.toLowerCase()}`)
    deviceOptions.append(node)
  }
  devices.append(deviceOptions)
  const privacy = element("div", "productivity-local-storage")
  const privacyText = element("div", "")
  privacyText.append(
    element("strong", "", "At home in your browser"),
    element(
      "p",
      "",
      "Notes, reminders, events, and preferences are saved locally in this browser. Devices in this workspace share them. Export important notes from Files to keep a copy.",
    ),
  )
  privacy.append(icon("shield"), privacyText)
  view.content.append(appearance, wallpaper, motion, devices, privacy)
  const render = (snapshot: Snapshot): void => {
    light.setAttribute("aria-pressed", String(snapshot.preferences.appearance === "light"))
    dark.setAttribute("aria-pressed", String(snapshot.preferences.appearance === "dark"))
    for (const node of wallpaperButtons)
      node.setAttribute(
        "aria-pressed",
        String(node.dataset["action"] === snapshot.preferences.wallpaper),
      )
    reducedMotion.checked = snapshot.preferences.reducedMotion
  }
  view.cleanup.push(
    listen(root, "click", (event) => {
      const action = actionTarget(event, root)?.dataset["action"]
      if (action === "light" || action === "dark") service.setPreferences({ appearance: action })
      else if (action === "sunrise" || action === "ocean" || action === "lavender")
        service.setPreferences({ wallpaper: action })
    }),
    listen(reducedMotion, "change", () =>
      service.setPreferences({ reducedMotion: reducedMotion.checked }),
    ),
    service.subscribe(render),
  )
  render(service.read())
  return view
}

export const createProductivityApp = (
  id: ProductivityAppId,
  service: WorkspaceDataService,
  files?: WorkspaceFilesService,
): ProductivityApp => {
  switch (id) {
    case "notes":
      return createNotes(service)
    case "reminders":
      return createReminders(service)
    case "calendar":
      return createCalendar(service)
    case "files":
      return createFiles(service, files)
    case "calculator":
      return createCalculatorApp(service)
    case "settings":
      return createSettings(service)
  }
}
