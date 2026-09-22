/**
 * 大纲（标题目录）工具。
 * 从 Markdown 文本提取 ATX 标题、构建层级树、计算当前标题，
 * 并标注异常状态：重复标题 / 层级跳跃 / 超长标题。
 *
 * 提取规则与编辑器渲染器（markdown-parser.js）保持一致：
 * 行首 1-6 个 # + 空格 + 内容，跳过围栏代码块。
 */

/** 标题字符数超过该值视为「超长标题」 */
export const MAX_TITLE_LENGTH = 60

/**
 * @typedef {Object} OutlineHeading
 * @property {number} id        - 按文档顺序的序号
 * @property {string} key       - 稳定标识（level:text + 同名序号），用于折叠状态持久化
 * @property {number} level     - 1-6
 * @property {string} text      - 标题文本
 * @property {number} line      - 1 起始行号
 * @property {number} pos       - 标题行在文档中的字符偏移
 * @property {boolean} dup      - 存在相同文本的其他标题
 * @property {boolean} levelJump- 相对上一标题层级下跳超过 1 级（如 H2 → H4）
 * @property {number} prevLevel - 上一标题层级（无则为 0）
 * @property {boolean} tooLong  - 标题文本超过 MAX_TITLE_LENGTH
 */

/**
 * 提取文档中的全部标题。
 * @param {string} doc Markdown 全文
 * @returns {OutlineHeading[]}
 */
export function extractHeadings(doc) {
  if (!doc) return []
  const lines = doc.split('\n')
  const headings = []
  const keyCount = new Map()  // `${level}:${text}` -> 已出现次数（生成稳定 key）
  const textCount = new Map() // text -> 出现次数（重复检测）
  let pos = 0
  let inCode = false
  let fenceChar = ''
  let fenceLen = 0
  let prevLevel = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineStart = pos
    pos += line.length + 1

    // 围栏代码块：块内的 # 不是标题
    const fence = line.match(/^(`{3,}|~{3,})/)
    if (fence) {
      if (!inCode) {
        inCode = true
        fenceChar = fence[1][0]
        fenceLen = fence[1].length
      } else if (fence[1][0] === fenceChar && fence[1].length >= fenceLen) {
        inCode = false
      }
      continue
    }
    if (inCode) continue

    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!m) continue

    const level = m[1].length
    const text = m[2]
    const baseKey = `${level}:${text}`
    const nth = keyCount.get(baseKey) || 0
    keyCount.set(baseKey, nth + 1)
    textCount.set(text, (textCount.get(text) || 0) + 1)

    headings.push({
      id: headings.length,
      key: nth === 0 ? baseKey : `${baseKey}#${nth}`,
      level,
      text,
      line: i + 1,
      pos: lineStart,
      dup: false, // 下方统一回填
      levelJump: prevLevel > 0 && level > prevLevel + 1,
      prevLevel,
      tooLong: text.length > MAX_TITLE_LENGTH
    })
    prevLevel = level
  }

  for (const h of headings) h.dup = (textCount.get(h.text) || 0) > 1
  return headings
}

/**
 * 将扁平标题列表构建为层级树。
 * 层级跳跃的节点（如 H1 后直接 H3）挂到最近的上级，保证树结构始终合法。
 * @param {OutlineHeading[]} headings
 * @returns {Array<OutlineHeading & {children: Array}>}
 */
export function buildOutlineTree(headings) {
  const root = { level: 0, children: [] }
  const stack = [root]
  for (const h of headings) {
    const node = { ...h, children: [] }
    while (stack.length > 1 && stack[stack.length - 1].level >= h.level) stack.pop()
    stack[stack.length - 1].children.push(node)
    stack.push(node)
  }
  return root.children
}

/**
 * 根据光标行号计算当前标题：最后一个 line <= cursorLine 的标题。
 * @param {OutlineHeading[]} headings
 * @param {number} cursorLine 1 起始行号
 * @returns {number|null} 当前标题 id，无则 null
 */
export function findActiveHeadingId(headings, cursorLine) {
  let active = null
  for (const h of headings) {
    if (h.line <= cursorLine) active = h.id
    else break
  }
  return active
}

/**
 * 按关键词筛选标题树：保留匹配的节点及其全部祖先（保持层级上下文）。
 * @param {Array} nodes 标题树
 * @param {string} query 筛选关键词
 * @returns {Array} 筛选后的新树
 */
export function filterOutlineTree(nodes, query) {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  const walk = (list) => {
    const out = []
    for (const n of list) {
      const children = walk(n.children)
      if (n.text.toLowerCase().includes(q) || children.length) {
        out.push({ ...n, children })
      }
    }
    return out
  }
  return walk(nodes)
}

/**
 * 将标题树按折叠状态扁平化为可见列表（含缩进深度），供一次性渲染。
 * @param {Array} nodes 标题树
 * @param {Set<string>} collapsed 已折叠节点的 key 集合
 * @param {number} [depth]
 * @param {Array} [out]
 * @returns {Array<{node: Object, depth: number}>}
 */
export function flattenVisible(nodes, collapsed, depth = 0, out = []) {
  for (const n of nodes) {
    out.push({ node: n, depth })
    if (n.children.length && !collapsed.has(n.key)) {
      flattenVisible(n.children, collapsed, depth + 1, out)
    }
  }
  return out
}

/**
 * 收集树中所有可折叠（有子节点）的 key，用于「全部折叠」。
 * @param {Array} nodes
 * @returns {string[]}
 */
export function collectCollapsibleKeys(nodes) {
  const keys = []
  const walk = (list) => {
    for (const n of list) {
      if (n.children.length) {
        keys.push(n.key)
        walk(n.children)
      }
    }
  }
  walk(nodes)
  return keys
}
