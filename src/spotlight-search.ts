import { Z_INDEX } from "./constants"

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

  // Create DOM structure
  const backdrop = document.createElement("div")
  backdrop.className = "spotlight-backdrop"
  backdrop.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: var(--glass-blur);
    z-index: ${Z_INDEX.MODAL};
    display: none;
    opacity: 0;
    transition: opacity 300ms ease-out;
  `

  const modal = document.createElement("div")
  modal.className = "spotlight-modal enter-scale"
  modal.style.cssText = `
    position: fixed;
    top: 20vh;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    max-width: calc(100vw - var(--space-xl));
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-xl);
    backdrop-filter: var(--glass-blur);
    overflow: hidden;
    z-index: ${Z_INDEX.MODAL + 1};
    display: none;
  `

  const searchInput = document.createElement("input")
  searchInput.type = "text"
  searchInput.placeholder = "Search apps, tools, settings..."
  searchInput.className = "spotlight-input"
  searchInput.style.cssText = `
    width: 100%;
    height: 48px;
    padding: 0 var(--space-md);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--glass-border);
    color: var(--text-primary);
    font-size: clamp(14px, 1.5vw, 16px);
    outline: none;
    font-family: system-ui, -apple-system, sans-serif;
  `

  const resultsList = document.createElement("div")
  resultsList.className = "spotlight-results"
  resultsList.style.cssText = `
    max-height: 400px;
    overflow-y: auto;
    padding: var(--space-sm) 0;
  `

  modal.appendChild(searchInput)
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
      result += `<mark style="background: var(--accent-primary); color: var(--surface-0); padding: 2px 4px; border-radius: 4px;">${text[matchIndex]}</mark>`
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
      resultItem.style.cssText = `
        display: grid;
        grid-template-columns: 40px 1fr auto;
        align-items: center;
        gap: var(--space-md);
        padding: var(--space-md);
        cursor: pointer;
        background: ${index === state.selectedIndex ? "var(--overlay-hover)" : "transparent"};
        border-radius: var(--radius-md);
        margin: 0 var(--space-sm);
        transition: background 140ms ease-out;
      `

      const icon = document.createElement("div")
      icon.textContent = item.icon
      icon.style.cssText = `
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        background: var(--surface-3);
        border-radius: var(--radius-md);
      `

      const content = document.createElement("div")
      content.style.cssText = `
        min-width: 0;
      `

      const name = document.createElement("div")
      name.innerHTML = highlightMatches(item.name, state.query)
      name.style.cssText = `
        color: var(--text-primary);
        font-size: 14px;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `

      const category = document.createElement("div")
      category.innerHTML = highlightMatches(item.category, state.query)
      category.style.cssText = `
        color: var(--text-secondary);
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `

      content.appendChild(name)
      content.appendChild(category)

      const kbd = document.createElement("div")
      kbd.textContent = "⏎"
      kbd.style.cssText = `
        color: var(--text-tertiary);
        font-size: 16px;
        opacity: ${index === state.selectedIndex ? 1 : 0};
        transition: opacity 140ms ease-out;
      `

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
      emptyState.textContent = "No results found"
      emptyState.style.cssText = `
        padding: var(--space-xl);
        text-align: center;
        color: var(--text-secondary);
        font-size: 14px;
      `
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
      backdrop.style.display = "block"
      modal.style.display = "block"

      // Trigger animation
      requestAnimationFrame(() => {
        backdrop.style.opacity = "1"
        modal.classList.add("enter-scale")
      })

      // Focus input after animation
      setTimeout(() => searchInput.focus(), 100)
      render()
    },

    hide: () => {
      state = { ...state, visible: false }
      backdrop.style.opacity = "0"

      setTimeout(() => {
        backdrop.style.display = "none"
        modal.style.display = "none"
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
      // Scroll into view
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
      // Scroll into view
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
