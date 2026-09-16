export type SpotlightSearchItem = {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly icon: string
  readonly action: () => void
}

export type SpotlightSearchState = {
  readonly visible: boolean
  readonly query: string
  readonly results: readonly SpotlightSearchItem[]
  readonly selectedIndex: number
}

export type SpotlightSearchController = {
  show(): void
  hide(): void
  setQuery(query: string): void
  selectNext(): void
  selectPrevious(): void
  executeSelected(): void
  dispose(): void
  read(): SpotlightSearchState
}

type SpotlightSearchOptions = {
  readonly items: readonly SpotlightSearchItem[]
  readonly container: HTMLElement
  readonly maxResults?: number
}

const SPOTLIGHT_ICON_PATHS: Record<string, string> = {
  workspace: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 19h20"/>',
  phone: '<rect x="8" y="3" width="8" height="18" rx="2.5"/><path d="M11 18h2"/>',
  radio:
    '<rect x="3" y="9" width="18" height="11" rx="2"/><circle cx="8.5" cy="14.5" r="2.5"/><path d="M14 13h4M14 17h4M6 9l9-5"/>',
  "reset-view": '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  "auto-rotate": '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  "screen-power": '<path d="M12 3v8"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
  "explode-view": '<path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z"/>',
}

const spotlightGlyph = (paths: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

const SPOTLIGHT_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(SPOTLIGHT_ICON_PATHS).map(([id, paths]) => [id, spotlightGlyph(paths)]),
)

const FALLBACK_SOFTWARE_ICON = spotlightGlyph(
  '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
)

const SEARCH_GLYPH = spotlightGlyph('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>')

const iconMarkup = (item: SpotlightSearchItem): string => {
  const known = SPOTLIGHT_ICONS[item.id]
  if (known !== undefined) return known
  if (item.id.startsWith("software-")) return FALLBACK_SOFTWARE_ICON
  return ""
}

export const createSpotlightSearch = (
  options: SpotlightSearchOptions,
): SpotlightSearchController => {
  const maxResults = options.maxResults ?? 8
  let state: SpotlightSearchState = {
    visible: false,
    query: "",
    results: [],
    selectedIndex: 0,
  }

  const backdrop = document.createElement("div")
  backdrop.className = "spotlight-backdrop"
  backdrop.hidden = true

  const modal = document.createElement("div")
  modal.className = "spotlight-modal os-theme enter-scale"
  modal.dataset["appearance"] = "dark"
  modal.setAttribute("role", "dialog")
  modal.setAttribute("aria-label", "聚焦搜索")
  modal.hidden = true

  const inputWrap = document.createElement("div")
  inputWrap.className = "spotlight-input-wrap"
  inputWrap.innerHTML = SEARCH_GLYPH
  const searchInput = document.createElement("input")
  searchInput.type = "text"
  searchInput.placeholder = "搜索应用、工具与设置…"
  searchInput.className = "spotlight-input"
  searchInput.setAttribute("aria-label", "搜索应用、工具与设置")
  inputWrap.appendChild(searchInput)

  const resultsList = document.createElement("div")
  resultsList.className = "spotlight-results"

  modal.appendChild(inputWrap)
  modal.appendChild(resultsList)
  backdrop.appendChild(modal)
  options.container.appendChild(backdrop)

  // Fuzzy search implementation
  const fuzzyMatch = (text: string, query: string): { score: number; matches: number[] } => {
    const lowerText = text.toLowerCase()
    const lowerQuery = query.toLowerCase()
    const matches: number[] = []
    let score = 0
    let queryIndex = 0
    let lastMatchIndex = -1

    for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
      if (lowerText[i] === lowerQuery[queryIndex]) {
        matches.push(i)
        score += lastMatchIndex === i - 1 ? 5 : 1
        lastMatchIndex = i
        queryIndex++
      }
    }

    return queryIndex === lowerQuery.length ? { score, matches } : { score: 0, matches: [] }
  }

  const search = (query: string): readonly SpotlightSearchItem[] => {
    if (query.trim() === "") return options.items.slice(0, maxResults)

    const results = options.items
      .map((item) => {
        const nameMatch = fuzzyMatch(item.name, query)
        const categoryMatch = fuzzyMatch(item.category, query)
        const bestMatch = nameMatch.score > categoryMatch.score ? nameMatch : categoryMatch
        return { item, score: bestMatch.score, matches: bestMatch.matches }
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(({ item }) => item)

    return results
  }

  const highlightMatches = (text: string, query: string): string => {
    if (!query) return text

    const match = fuzzyMatch(text, query)
    if (match.score === 0) return text

    let result = ""
    let lastIndex = 0

    for (const matchIndex of match.matches) {
      result += text.slice(lastIndex, matchIndex)
      result += `<mark class="spotlight-mark">${text[matchIndex]}</mark>`
      lastIndex = matchIndex + 1
    }

    result += text.slice(lastIndex)
    return result
  }

  const render = (): void => {
    resultsList.innerHTML = ""

    state.results.forEach((item, index) => {
      const resultItem = document.createElement("div")
      resultItem.className = "spotlight-result-item"
      resultItem.dataset["selected"] = String(index === state.selectedIndex)

      const icon = document.createElement("div")
      icon.className = "spotlight-result-icon"
      const markup = iconMarkup(item)
      if (markup !== "") icon.innerHTML = markup
      else icon.textContent = item.icon

      const content = document.createElement("div")
      content.className = "spotlight-result-content"

      const name = document.createElement("div")
      name.className = "spotlight-result-name"
      name.innerHTML = highlightMatches(item.name, state.query)

      const category = document.createElement("div")
      category.className = "spotlight-result-category"
      category.innerHTML = highlightMatches(item.category, state.query)

      content.appendChild(name)
      content.appendChild(category)

      const kbd = document.createElement("div")
      kbd.className = "spotlight-result-kbd"
      kbd.textContent = "⏎"

      resultItem.appendChild(icon)
      resultItem.appendChild(content)
      resultItem.appendChild(kbd)

      resultItem.addEventListener("mouseenter", () => {
        state = { ...state, selectedIndex: index }
        render()
      })

      resultItem.addEventListener("click", () => {
        item.action()
        controller.hide()
      })

      resultsList.appendChild(resultItem)
    })

    if (state.results.length === 0 && state.query.trim() !== "") {
      const emptyState = document.createElement("div")
      emptyState.className = "spotlight-empty"
      emptyState.textContent = "未找到结果"
      resultsList.appendChild(emptyState)
    }
  }

  // Event handlers
  const handleKeydown = (event: KeyboardEvent): void => {
    if (!state.visible) return

    switch (event.key) {
      case "Escape":
        event.preventDefault()
        controller.hide()
        break
      case "ArrowDown":
        event.preventDefault()
        controller.selectNext()
        break
      case "ArrowUp":
        event.preventDefault()
        controller.selectPrevious()
        break
      case "Enter":
        event.preventDefault()
        controller.executeSelected()
        break
    }
  }

  const handleInput = (): void => {
    state = {
      ...state,
      query: searchInput.value,
      results: search(searchInput.value),
      selectedIndex: 0,
    }
    render()
  }

  const handleBackdropClick = (event: MouseEvent): void => {
    if (event.target === backdrop) {
      controller.hide()
    }
  }

  searchInput.addEventListener("input", handleInput)
  backdrop.addEventListener("click", handleBackdropClick)
  document.addEventListener("keydown", handleKeydown)

  const controller: SpotlightSearchController = {
    show: () => {
      state = {
        ...state,
        visible: true,
        query: "",
        results: search(""),
        selectedIndex: 0,
      }

      searchInput.value = ""
      backdrop.hidden = false
      modal.hidden = false

      requestAnimationFrame(() => {
        backdrop.dataset["visible"] = "true"
        modal.classList.add("enter-scale")
      })

      setTimeout(() => searchInput.focus(), 100)
      render()
    },

    hide: () => {
      state = { ...state, visible: false }
      backdrop.dataset["visible"] = "false"

      setTimeout(() => {
        backdrop.hidden = true
        modal.hidden = true
      }, 300)
    },

    setQuery: (query: string) => {
      searchInput.value = query
      state = {
        ...state,
        query,
        results: search(query),
        selectedIndex: 0,
      }
      render()
    },

    selectNext: () => {
      if (state.results.length === 0) return
      state = {
        ...state,
        selectedIndex: (state.selectedIndex + 1) % state.results.length,
      }
      render()
      const selected = resultsList.children[state.selectedIndex] as HTMLElement
      selected?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    },

    selectPrevious: () => {
      if (state.results.length === 0) return
      state = {
        ...state,
        selectedIndex:
          state.selectedIndex === 0 ? state.results.length - 1 : state.selectedIndex - 1,
      }
      render()
      const selected = resultsList.children[state.selectedIndex] as HTMLElement
      selected?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    },

    executeSelected: () => {
      const selected = state.results[state.selectedIndex]
      if (selected) {
        selected.action()
        controller.hide()
      }
    },

    dispose: () => {
      document.removeEventListener("keydown", handleKeydown)
      backdrop.remove()
    },

    read: () => state,
  }

  return controller
}
