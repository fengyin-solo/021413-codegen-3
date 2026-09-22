/**
 * Heading outline extraction for the TOC panel.
 * Pure functions over raw markdown text — no CodeMirror dependency,
 * so they can be driven directly from the store's content string.
 */

// Closing hash sequences require a preceding space (CommonMark), so `# C#` keeps its `#`
const ATX_RE = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/
const FENCE_RE = /^(`{3,}|~{3,})/

/** Titles longer than this are flagged as `long` (rendered truncated + tooltip). */
export const LONG_TITLE_THRESHOLD = 40

/**
 * Strip inline markdown markers so the TOC shows plain readable text.
 * @param {string} raw
 * @returns {string}
 */
export function displayText(raw) {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // image -> alt
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   // link -> text
    .replace(/(\*\*|__)(.+?)\1/g, '$2')        // bold
    .replace(/(\*|_)(.+?)\1/g, '$2')           // italic
    .replace(/~~(.+?)~~/g, '$1')               // strikethrough
    .replace(/`+([^`]*)`+/g, '$1')             // inline code
    .trim()
}

function normalize(text) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Extract ATX headings from a markdown document, skipping fenced code blocks.
 * Each heading is annotated with hierarchy/health metadata:
 * - key:      stable identity `slug#occurrence`, survives edits above it
 * - dupCount: >1 when the same normalized title appears multiple times
 * - jump:     { from, to } when the level skips (e.g. H1 -> H3)
 * - long:     true when the title exceeds LONG_TITLE_THRESHOLD
 *
 * @param {string} doc
 * @returns {Array<Object>}
 */
export function extractHeadings(doc) {
  const headings = []
  if (!doc) return headings

  const lines = doc.split('\n')
  let pos = 0
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(FENCE_RE)
    if (fence) {
      const marker = fence[1]
      if (!inFence) {
        inFence = true
        fenceChar = marker[0]
        fenceLen = marker.length
      } else if (marker[0] === fenceChar && marker.length >= fenceLen) {
        inFence = false
      }
      pos += line.length + 1
      continue
    }

    if (!inFence) {
      const m = line.match(ATX_RE)
      if (m) {
        const raw = m[2].trim()
        headings.push({
          id: `h${headings.length}`,
          level: m[1].length,
          raw,
          text: displayText(raw) || raw,
          line: i + 1, // 1-based, matches CodeMirror line numbers
          pos
        })
      }
    }
    pos += line.length + 1
  }

  return annotate(headings)
}

function annotate(headings) {
  const counts = new Map()
  for (const h of headings) {
    const slug = normalize(h.text) || 'untitled'
    const n = (counts.get(slug) || 0) + 1
    counts.set(slug, n)
    h.slug = slug
    h.key = `${slug}#${n}`
    h.long = h.text.length > LONG_TITLE_THRESHOLD
  }
  for (const h of headings) {
    const c = counts.get(h.slug)
    h.dupCount = c > 1 ? c : 0
  }
  let prev = 0
  for (const h of headings) {
    h.jump = h.level > prev + 1 ? { from: prev, to: h.level } : null
    prev = h.level
  }
  return headings
}

/**
 * Build the flat render list for the TOC from extracted headings.
 * Adds per-item view metadata:
 * - depth:       normalized indent (level jumps render one step deeper, not two)
 * - hidden:      true when any ancestor is collapsed
 * - hasChildren / childCount: whether the item can be collapsed
 *
 * @param {Array} headings - from extractHeadings
 * @param {Set<string>} collapsedKeys
 * @returns {Array}
 */
export function buildOutlineItems(headings, collapsedKeys) {
  const items = []
  const stack = [] // ancestors: { level, key, item }

  for (const h of headings) {
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop()

    let hidden = false
    for (const anc of stack) {
      if (collapsedKeys.has(anc.key)) { hidden = true; break }
    }

    const item = {
      ...h,
      depth: stack.length,
      hidden,
      hasChildren: false,
      childCount: 0,
      containsActive: false
    }
    for (const anc of stack) {
      anc.item.childCount++
    }
    if (stack.length) stack[stack.length - 1].item.hasChildren = true

    stack.push({ level: h.level, key: h.key, item })
    items.push(item)
  }

  return items
}

/**
 * Find the heading that currently owns the cursor:
 * the last heading at or above the cursor line.
 * @param {Array} headings
 * @param {number} cursorLine - 1-based
 * @returns {string|null} heading id
 */
export function activeHeadingId(headings, cursorLine) {
  let active = null
  for (const h of headings) {
    if (h.line <= cursorLine) active = h.id
    else break
  }
  return active
}

/**
 * When the active heading is hidden by a collapsed ancestor, mark the
 * nearest visible ancestor so the user still sees where the cursor lives.
 * Mutates and returns the items array.
 */
export function markContainsActive(items, activeId) {
  const idx = items.findIndex(it => it.id === activeId)
  if (idx === -1 || !items[idx].hidden) return items
  for (let i = idx - 1; i >= 0; i--) {
    if (!items[i].hidden && items[i].depth < items[idx].depth) {
      items[i].containsActive = true
      break
    }
  }
  return items
}
