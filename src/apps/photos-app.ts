import type { WorkspaceFilesService } from "../services/workspace-files-service"
import type { WorkspaceLibraryService } from "../services/workspace-library-service"
import { element, listen } from "./dom"

const photoButton = (label: string, variant = ""): HTMLButtonElement => {
  const button = element("button", `library-button ${variant}`.trim(), label)
  button.type = "button"
  return button
}

const formatSize = (size: number): string =>
  size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`

export const createPhotosApp = (
  service: WorkspaceLibraryService,
  files: WorkspaceFilesService,
): { readonly element: HTMLElement; dispose(): void } => {
  const root = element("section", "library-app photos-app")
  root.setAttribute("aria-label", "Photos")
  root.dataset["testid"] = "photos-app"
  const header = element("header", "library-header")
  const heading = element("div", "photos-heading")
  heading.append(
    element("h2", "library-heading", "Photos"),
    element("p", "library-subtitle", "Your moments, close at hand."),
  )
  const importButton = photoButton("Import photos", "library-primary")
  const fileInput = element("input", "photos-file-input")
  fileInput.type = "file"
  fileInput.multiple = true
  fileInput.accept = "image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp"
  fileInput.hidden = true
  fileInput.setAttribute("aria-label", "Import photos")
  fileInput.dataset["testid"] = "photos-import-files"
  header.append(heading, importButton, fileInput)
  const status = element("p", "library-status")
  status.setAttribute("role", "status")
  const content = element("div", "photos-content")
  const empty = element("div", "library-empty")
  const emptyIcon = element("span", "library-empty-icon", "▧")
  emptyIcon.setAttribute("aria-hidden", "true")
  const emptyImport = photoButton("Add your first photos", "library-primary")
  empty.append(
    emptyIcon,
    element("h3", "photos-empty-heading", "A home for your favorite moments"),
    element("p", "library-subtitle", "Import images to browse them across your devices here."),
    emptyImport,
    element(
      "p",
      "library-subtitle photos-import-hint",
      "JPEG, PNG, WebP, GIF, AVIF or BMP · Up to 25 MB per image.",
    ),
  )
  const grid = element("ul", "photos-grid")
  grid.setAttribute("aria-label", "Photo library")
  grid.dataset["testid"] = "photos-grid"
  const preview = element("section", "photos-preview")
  preview.setAttribute("aria-label", "Photo preview")
  preview.dataset["testid"] = "photos-preview"
  preview.hidden = true
  const toolbar = element("header", "photos-toolbar")
  const backButton = photoButton("All photos")
  const position = element("span", "photos-position")
  position.setAttribute("aria-live", "polite")
  const navigation = element("div", "library-actions")
  const previousButton = photoButton("Previous")
  previousButton.setAttribute("aria-label", "Previous photo")
  const nextButton = photoButton("Next")
  nextButton.setAttribute("aria-label", "Next photo")
  const zoomButton = photoButton("Zoom 1×")
  zoomButton.dataset["testid"] = "photos-zoom"
  navigation.append(previousButton, nextButton, zoomButton)
  toolbar.append(backButton, position, navigation)
  const viewport = element("div", "photos-preview-viewport")
  viewport.tabIndex = 0
  viewport.setAttribute("role", "region")
  viewport.setAttribute("aria-label", "Photo image; scroll to explore when zoomed")
  const previewImage = element("img", "photos-preview-image")
  previewImage.draggable = false
  viewport.append(previewImage)
  const details = element("div", "photos-details")
  const fileName = element("h3", "photos-filename")
  const metadata = element("dl", "photos-metadata")
  const metadataValue = (label: string): HTMLElement => {
    const row = element("div", "photos-metadata-item")
    const value = element("dd", "photos-metadata-value")
    row.append(element("dt", "photos-metadata-label", label), value)
    metadata.append(row)
    return value
  }
  const dimensions = metadataValue("Dimensions")
  const size = metadataValue("File size")
  const added = metadataValue("Added")
  const actions = element("div", "library-actions")
  const downloadButton = photoButton("保存原图到文件")
  const deleteButton = photoButton("Delete photo", "library-danger")
  actions.append(downloadButton, deleteButton)
  const confirmation = element("div", "library-confirm")
  confirmation.hidden = true
  const confirmText = element("p", "photos-confirm-text")
  const confirmActions = element("div", "library-actions")
  const cancelButton = photoButton("Keep photo")
  const confirmButton = photoButton("Delete photo", "library-danger")
  confirmButton.dataset["testid"] = "photos-delete-confirm"
  confirmActions.append(cancelButton, confirmButton)
  confirmation.append(confirmText, confirmActions)
  details.append(fileName, metadata, actions, confirmation)
  preview.append(toolbar, viewport, details)
  content.append(empty, grid, preview)
  root.append(header, status, content)

  const cleanups: (() => void)[] = []
  let snapshot = service.read()
  let photosKey = ""
  let selectedId: string | null = null
  let zoom = 1
  let deleting = false
  let localError: string | null = null
  let disposed = false

  const updateStatus = (): void => {
    const count = `${snapshot.photos.length} ${snapshot.photos.length === 1 ? "photo" : "photos"}`
    const message = [
      snapshot.storageStatus === "loading"
        ? "Loading your photos…"
        : snapshot.importing
          ? "Importing photos…"
          : `${count} · ${snapshot.storageStatus === "unavailable" ? "Available for this session" : "Saved in this browser"}`,
      snapshot.photoError,
      snapshot.storageError,
      localError,
    ]
      .filter(Boolean)
      .join(" · ")
    if (status.textContent !== message) status.textContent = message
    importButton.disabled = snapshot.importing || snapshot.storageStatus === "loading"
    emptyImport.disabled = importButton.disabled
    importButton.textContent = snapshot.importing ? "Importing…" : "Import photos"
  }

  const updateZoom = (): void => {
    zoomButton.textContent = `Zoom ${zoom}×`
    zoomButton.setAttribute(
      "aria-label",
      `Zoom ${zoom} times; change to ${zoom === 3 ? 1 : zoom + 1} times`,
    )
    previewImage.style.width = `${zoom * 100}%`
    previewImage.style.height = `${zoom * 100}%`
    viewport.dataset["zoom"] = String(zoom)
    viewport.scrollLeft = 0
    viewport.scrollTop = 0
  }

  const renderPreview = (): void => {
    const index = snapshot.photos.findIndex((photo) => photo.id === selectedId)
    const photo = snapshot.photos[index]
    preview.hidden = photo === undefined
    grid.hidden = photo !== undefined || snapshot.photos.length === 0
    empty.hidden = photo !== undefined || snapshot.photos.length !== 0
    if (photo === undefined) {
      selectedId = null
      previewImage.removeAttribute("src")
      return
    }
    const url = service.photoUrl(photo.id)
    if (url !== null && previewImage.getAttribute("src") !== url) previewImage.src = url
    if (url === null) previewImage.removeAttribute("src")
    previewImage.alt = photo.fileName
    fileName.textContent = photo.fileName
    dimensions.textContent = `${photo.width} × ${photo.height} pixels`
    size.textContent = formatSize(photo.size)
    added.textContent = new Date(photo.addedAt).toLocaleString()
    position.textContent = `${index + 1} of ${snapshot.photos.length}`
    previousButton.disabled = index <= 0 || deleting
    nextButton.disabled = index >= snapshot.photos.length - 1 || deleting
    deleteButton.disabled = deleting
    confirmButton.disabled = deleting
    cancelButton.disabled = deleting
    backButton.disabled = deleting
    confirmButton.textContent = deleting ? "Deleting…" : "Delete photo"
    downloadButton.disabled = service.photoBlob(photo.id) === null
    confirmText.textContent = `Delete “${photo.fileName}” from this library? Your original file will stay on your computer.`
  }

  const openPhoto = (id: string): void => {
    if (deleting) return
    selectedId = id
    zoom = 1
    confirmation.hidden = true
    updateZoom()
    renderPreview()
  }

  const renderGrid = (): void => {
    const nodes = snapshot.photos.map((photo) => {
      const item = element("li", "photos-grid-item")
      const tile = photoButton("", "photos-tile")
      tile.dataset["photoId"] = photo.id
      tile.setAttribute("aria-label", `Open ${photo.fileName}`)
      const url = service.photoUrl(photo.id)
      if (url !== null) {
        const image = element("img", "photos-thumbnail")
        image.src = url
        image.alt = ""
        image.loading = "lazy"
        image.draggable = false
        tile.append(image)
      } else {
        tile.append(
          element("span", "photos-thumbnail photos-thumbnail-missing", "Preview unavailable"),
        )
      }
      tile.append(
        element("span", "photos-name", photo.fileName),
        element("span", "photos-dimensions", `${photo.width} × ${photo.height}`),
      )
      item.append(tile)
      return item
    })
    grid.replaceChildren(...nodes)
  }

  const runImport = async (): Promise<void> => {
    const files = Array.from(fileInput.files ?? [])
    fileInput.value = ""
    if (files.length === 0) return
    localError = null
    updateStatus()
    try {
      await service.importPhotos(files)
    } catch (error) {
      if (!disposed) {
        localError = error instanceof Error ? error.message : "The photos could not be imported."
        updateStatus()
      }
    }
  }

  const deletePhoto = async (): Promise<void> => {
    if (selectedId === null || deleting) return
    deleting = true
    localError = null
    updateStatus()
    renderPreview()
    try {
      await service.removePhoto(selectedId)
      if (!disposed) confirmation.hidden = true
    } catch (error) {
      if (!disposed) {
        localError = error instanceof Error ? error.message : "The photo could not be deleted."
      }
    } finally {
      if (!disposed) {
        deleting = false
        renderPreview()
        updateStatus()
        if (preview.hidden) importButton.focus()
      }
    }
  }

  cleanups.push(
    listen(importButton, "click", () => fileInput.click()),
    listen(emptyImport, "click", () => fileInput.click()),
    listen(fileInput, "change", () => void runImport()),
    listen(grid, "click", (event) => {
      const target = event.target
      const tile =
        target instanceof Element ? target.closest<HTMLButtonElement>("[data-photo-id]") : null
      const id = tile?.dataset["photoId"]
      if (id !== undefined) {
        openPhoto(id)
        backButton.focus()
      }
    }),
    listen(backButton, "click", () => {
      const previousId = selectedId
      selectedId = null
      confirmation.hidden = true
      renderPreview()
      const tile = Array.from(grid.querySelectorAll<HTMLButtonElement>("[data-photo-id]")).find(
        (button) => button.dataset["photoId"] === previousId,
      )
      const focusTarget = tile ?? importButton
      focusTarget.focus()
    }),
    listen(previousButton, "click", () => {
      const index = snapshot.photos.findIndex((photo) => photo.id === selectedId)
      const photo = snapshot.photos[index - 1]
      if (photo !== undefined) openPhoto(photo.id)
    }),
    listen(nextButton, "click", () => {
      const index = snapshot.photos.findIndex((photo) => photo.id === selectedId)
      const photo = snapshot.photos[index + 1]
      if (photo !== undefined) openPhoto(photo.id)
    }),
    listen(zoomButton, "click", () => {
      zoom = zoom === 3 ? 1 : zoom + 1
      updateZoom()
    }),
    listen(downloadButton, "click", () => {
      const photo = snapshot.photos.find((item) => item.id === selectedId)
      if (photo === undefined) return
      const blob = service.photoBlob(photo.id)
      if (blob === null) return
      downloadButton.disabled = true
      void files
        .save(blob, photo.fileName, "照片")
        .then(() => {
          if (!disposed) {
            status.textContent = "原图已保存到「文件 / 下载」，电脑与手机均可查看。"
            status.hidden = false
          }
        })
        .catch((error: unknown) => {
          if (!disposed) {
            status.textContent = error instanceof Error ? error.message : "保存失败"
            status.hidden = false
          }
        })
        .finally(() => {
          downloadButton.disabled = false
        })
    }),
    listen(deleteButton, "click", () => {
      confirmation.hidden = false
      cancelButton.focus()
    }),
    listen(cancelButton, "click", () => {
      confirmation.hidden = true
      deleteButton.focus()
    }),
    listen(confirmButton, "click", () => void deletePhoto()),
    service.subscribe((next) => {
      if (disposed) return
      snapshot = next
      updateStatus()
      const nextKey = JSON.stringify(next.photos)
      if (photosKey === nextKey) return
      photosKey = nextKey
      const previewHadFocus = preview.contains(document.activeElement)
      renderGrid()
      renderPreview()
      if (previewHadFocus && preview.hidden) importButton.focus()
    }),
  )
  updateZoom()

  return {
    element: root,
    dispose: () => {
      if (disposed) return
      disposed = true
      for (const cleanup of cleanups) cleanup()
      previewImage.removeAttribute("src")
      grid.replaceChildren()
    },
  }
}
