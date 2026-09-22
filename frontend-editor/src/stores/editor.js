import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

// ===== 大纲目录持久化（localStorage）=====
const OUTLINE_LS = {
  open: 'mira.outline.open',
  filter: 'mira.outline.filter',
  collapsed: 'mira.outline.collapsed'
}

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

function saveLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 隐私模式 / 存储不可用时静默忽略
  }
}

export const useEditorStore = defineStore('editor', () => {
  const content = ref('')
  const fileName = ref('untitled.md')
  const isDirty = ref(false)
  const wordCount = ref(0)
  const charCount = ref(0)
  const lineCount = ref(0)
  const cursorLine = ref(1)
  const cursorCol = ref(1)

  const statusText = computed(() => {
    return `Ln ${cursorLine.value}, Col ${cursorCol.value} | ${wordCount.value} words | ${charCount.value} chars`
  })

  function updateContent(newContent) {
    content.value = newContent
    isDirty.value = true
    // Update stats
    charCount.value = newContent.length
    lineCount.value = newContent.split('\n').length
    wordCount.value = newContent.trim() ? newContent.trim().split(/\s+/).length : 0
  }

  function updateCursor(line, col) {
    cursorLine.value = line
    cursorCol.value = col
  }

  function setFileName(name) {
    fileName.value = name
  }

  function markSaved() {
    isDirty.value = false
  }

  // ===== 大纲目录状态（切换文档 / 返回页面后恢复）=====
  const outlineOpen = ref(loadLS(OUTLINE_LS.open, false))
  const outlineFilter = ref(loadLS(OUTLINE_LS.filter, ''))
  // 已折叠节点的 key 集合（key 由标题层级+文本生成，内容不变则稳定）
  const outlineCollapsed = ref(new Set(loadLS(OUTLINE_LS.collapsed, [])))

  watch(outlineOpen, v => saveLS(OUTLINE_LS.open, v))
  watch(outlineFilter, v => saveLS(OUTLINE_LS.filter, v))
  watch(outlineCollapsed, v => saveLS(OUTLINE_LS.collapsed, [...v]))

  function toggleOutline() {
    outlineOpen.value = !outlineOpen.value
  }

  function setOutlineFilter(q) {
    outlineFilter.value = q
  }

  function toggleHeadingCollapsed(key) {
    const next = new Set(outlineCollapsed.value)
    next.has(key) ? next.delete(key) : next.add(key)
    outlineCollapsed.value = next
  }

  function collapseAllHeadings(keys) {
    outlineCollapsed.value = new Set(keys)
  }

  function clearHeadingCollapsed() {
    outlineCollapsed.value = new Set()
  }

  return {
    content,
    fileName,
    isDirty,
    wordCount,
    charCount,
    lineCount,
    cursorLine,
    cursorCol,
    statusText,
    updateContent,
    updateCursor,
    setFileName,
    markSaved,
    outlineOpen,
    outlineFilter,
    outlineCollapsed,
    toggleOutline,
    setOutlineFilter,
    toggleHeadingCollapsed,
    collapseAllHeadings,
    clearHeadingCollapsed
  }
})
