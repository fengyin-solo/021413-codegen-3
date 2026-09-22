import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useEditorStore } from './editor'
import {
  extractHeadings,
  buildOutlineItems,
  activeHeadingId,
  markContainsActive
} from '@/editor/heading-outline'

const STORAGE_KEY = 'mira.toc.v1'

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function persist(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage unavailable (private mode etc.) — panel still works, just won't persist
  }
}

export const useTocStore = defineStore('toc', () => {
  const editor = useEditorStore()
  const saved = loadPersisted()

  // --- UI state (persisted; restored on revisit / document switch) ---
  const panelCollapsed = ref(saved?.panelCollapsed ?? false)
  const filter = ref(saved?.filter ?? '')
  // Collapsed node keys, grouped per document so switching files restores each file's own state
  const collapsedByFile = ref(saved?.collapsedByFile ?? {})

  const collapsedKeys = computed(() => new Set(collapsedByFile.value[editor.fileName] || []))

  // --- Derived outline ---
  const headings = computed(() => extractHeadings(editor.content))
  const activeId = computed(() => activeHeadingId(headings.value, editor.cursorLine))
  const isFiltering = computed(() => filter.value.trim().length > 0)

  const items = computed(() => {
    const all = buildOutlineItems(headings.value, collapsedKeys.value)
    if (!isFiltering.value) return markContainsActive(all, activeId.value)
    // Filter mode: flat list of matches, collapse state ignored
    const q = filter.value.trim().toLowerCase()
    return all
      .filter(it => it.text.toLowerCase().includes(q))
      .map(it => ({ ...it, hidden: false }))
  })

  const visibleItems = computed(() => items.value.filter(it => !it.hidden))
  const matchCount = computed(() => visibleItems.value.length)

  // --- Actions ---
  function togglePanel() {
    panelCollapsed.value = !panelCollapsed.value
  }

  function setFilter(value) {
    filter.value = value
  }

  function toggleNode(key) {
    const file = editor.fileName
    const next = new Set(collapsedByFile.value[file] || [])
    next.has(key) ? next.delete(key) : next.add(key)
    collapsedByFile.value = { ...collapsedByFile.value, [file]: [...next] }
  }

  // Persist panel / filter / node-collapse state across reloads and file switches
  watch([panelCollapsed, filter, collapsedByFile], () => {
    persist({
      panelCollapsed: panelCollapsed.value,
      filter: filter.value,
      collapsedByFile: collapsedByFile.value
    })
  }, { deep: true })

  return {
    panelCollapsed,
    filter,
    collapsedKeys,
    headings,
    activeId,
    isFiltering,
    items,
    visibleItems,
    matchCount,
    togglePanel,
    setFilter,
    toggleNode
  }
})
