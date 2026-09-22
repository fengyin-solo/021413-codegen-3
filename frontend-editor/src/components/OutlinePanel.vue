<template>
  <aside class="outline">
    <header class="outline__header">
      <span class="outline__title">目录</span>
      <span v-if="headings.length" class="outline__count">{{ headings.length }}</span>
      <div class="outline__header-actions">
        <button
          v-if="headings.length"
          class="outline__icon-btn"
          :title="allCollapsed ? '全部展开' : '全部折叠'"
          @click="toggleAll"
          v-html="allCollapsed ? icons.expand : icons.collapse"
        />
        <button
          class="outline__icon-btn"
          title="关闭目录"
          @click="emit('close')"
          v-html="icons.close"
        />
      </div>
    </header>

    <div class="outline__search">
      <span class="outline__search-icon" v-html="icons.search" />
      <input
        class="outline__search-input"
        type="text"
        :value="store.outlineFilter"
        placeholder="筛选标题…"
        spellcheck="false"
        @input="store.setOutlineFilter($event.target.value)"
      />
      <button
        v-if="store.outlineFilter"
        class="outline__icon-btn outline__clear"
        title="清除筛选"
        @click="store.setOutlineFilter('')"
        v-html="icons.clear"
      />
    </div>

    <div class="outline__body" ref="bodyEl">
      <!-- 空状态：文档为空 / 无标题 -->
      <div v-if="!headings.length" class="outline__empty">
        <span class="outline__empty-icon" v-html="icons.empty" />
        <p class="outline__empty-title">{{ isEmptyDoc ? '文档为空' : '未检测到标题' }}</p>
        <p class="outline__empty-hint">
          {{ isEmptyDoc ? '开始输入以创建内容' : '使用 # ～ ###### 创建标题' }}
        </p>
      </div>

      <!-- 空状态：筛选无结果 -->
      <div v-else-if="filtering && !visibleItems.length" class="outline__empty">
        <span class="outline__empty-icon" v-html="icons.search" />
        <p class="outline__empty-title">无匹配标题</p>
        <p class="outline__empty-hint">尝试更换关键词</p>
      </div>

      <!-- 标题树 -->
      <div
        v-for="item in visibleItems"
        :key="item.node.key"
        class="outline__item"
        :class="{ 'outline__item--active': item.node.id === activeId }"
        :style="{ paddingLeft: `${8 + item.depth * 14}px` }"
        :title="item.node.text"
        @click="navigate(item.node)"
      >
        <button
          v-if="item.node.children.length && !filtering"
          class="outline__caret"
          :class="{ 'outline__caret--collapsed': store.outlineCollapsed.has(item.node.key) }"
          @click.stop="store.toggleHeadingCollapsed(item.node.key)"
          v-html="icons.caret"
        />
        <span v-else class="outline__caret outline__caret--leaf" />
        <span
          class="outline__text"
          :class="{ 'outline__text--long': item.node.tooLong }"
        >{{ item.node.text }}</span>
        <span
          v-if="item.node.dup"
          class="outline__badge outline__badge--dup"
          title="存在相同文本的标题"
        >重复</span>
        <span
          v-if="item.node.levelJump"
          class="outline__badge outline__badge--jump"
          :title="`层级跳跃：H${item.node.prevLevel} → H${item.node.level}`"
          v-html="icons.jump"
        />
      </div>
    </div>

    <footer v-if="dupCount || jumpCount" class="outline__footer">
      <span v-if="dupCount">{{ dupCount }} 个重复标题</span>
      <span v-if="dupCount && jumpCount" class="outline__footer-sep">·</span>
      <span v-if="jumpCount">{{ jumpCount }} 处层级跳跃</span>
    </footer>
  </aside>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useEditorStore } from '@/stores/editor'
import {
  extractHeadings,
  buildOutlineTree,
  filterOutlineTree,
  flattenVisible,
  findActiveHeadingId,
  collectCollapsibleKeys
} from '@/editor/outline'

const store = useEditorStore()
const emit = defineEmits(['navigate', 'close'])

const I = (d, size = 14) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`

const icons = {
  caret: I('<polyline points="6 9 12 15 18 9"/>', 12),
  search: I('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  clear: I('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 12),
  close: I('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  collapse: I('<polyline points="7 8 12 3 17 8"/><polyline points="7 16 12 21 17 16"/>'),
  expand: I('<polyline points="7 4 12 9 17 4"/><polyline points="7 20 12 15 17 20"/>'),
  jump: I('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 12),
  empty: I('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>', 28)
}

const bodyEl = ref(null)
const EMPTY_SET = new Set()

// 内容变化 → 重新提取标题；光标移动 → 重算当前项
const headings = computed(() => extractHeadings(store.content))
const tree = computed(() => buildOutlineTree(headings.value))
const filtering = computed(() => !!store.outlineFilter.trim())
const displayTree = computed(() =>
  filtering.value ? filterOutlineTree(tree.value, store.outlineFilter) : tree.value
)
// 筛选时忽略折叠状态，全部展开以展示匹配上下文
const visibleItems = computed(() =>
  flattenVisible(displayTree.value, filtering.value ? EMPTY_SET : store.outlineCollapsed)
)
const activeId = computed(() => findActiveHeadingId(headings.value, store.cursorLine))

const isEmptyDoc = computed(() => !store.content.trim())
const dupCount = computed(() => headings.value.filter(h => h.dup).length)
const jumpCount = computed(() => headings.value.filter(h => h.levelJump).length)

const collapsibleKeys = computed(() => collectCollapsibleKeys(tree.value))
const allCollapsed = computed(() =>
  collapsibleKeys.value.length > 0 &&
  collapsibleKeys.value.every(k => store.outlineCollapsed.has(k))
)

function toggleAll() {
  if (allCollapsed.value) store.clearHeadingCollapsed()
  else store.collapseAllHeadings(collapsibleKeys.value)
}

function navigate(node) {
  emit('navigate', node.pos)
}

// 当前项变化时（含面板首次打开），滚动目录使其保持可见
watch(activeId, async () => {
  await nextTick()
  bodyEl.value
    ?.querySelector('.outline__item--active')
    ?.scrollIntoView({ block: 'nearest' })
}, { immediate: true })
</script>

<style lang="scss" scoped>
.outline {
  width: 248px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: $bg-elevated;
  border-right: 1px solid $border-light;
  user-select: none;
  animation: outline-in $t-normal $ease;

  &__header {
    display: flex;
    align-items: center;
    gap: $sp-2;
    height: 40px;
    padding: 0 $sp-3;
    border-bottom: 1px solid $border-light;
    flex-shrink: 0;
  }

  &__title {
    font-size: $fs-sm;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  &__count {
    font-size: $fs-xs;
    font-family: $font-mono;
    color: $text-3;
    background: $bg-code;
    border-radius: $r-full;
    padding: 0 7px;
    line-height: 16px;
  }

  &__header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
  }

  &__icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: $r-sm;
    cursor: pointer;
    color: $text-3;
    transition: all $t-fast $ease;

    &:hover {
      background: $accent-soft;
      color: $accent;
    }
    &:active {
      transform: scale(0.9);
    }
  }

  &__search {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: $sp-2 $sp-3;
    padding: 0 $sp-2;
    height: 28px;
    background: $bg;
    border: 1px solid $border-light;
    border-radius: $r-md;
    flex-shrink: 0;
    transition: border-color $t-fast $ease;

    &:focus-within {
      border-color: $accent;
    }
  }

  &__search-icon {
    display: flex;
    color: $text-3;
    flex-shrink: 0;
  }

  &__search-input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-family: $font-ui;
    font-size: $fs-xs;
    color: $text;

    &::placeholder {
      color: $text-3;
    }
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 0 $sp-2 $sp-2;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 28px;
    padding-right: $sp-2;
    border-radius: $r-md;
    cursor: pointer;
    color: $text-2;
    position: relative;
    transition: background $t-fast $ease, color $t-fast $ease;

    &:hover {
      background: $bg;
      color: $text;
    }

    &--active {
      background: $accent-soft;
      color: $accent;
      font-weight: 500;

      &::before {
        content: '';
        position: absolute;
        left: 0;
        top: 6px;
        bottom: 6px;
        width: 2px;
        border-radius: $r-full;
        background: $accent;
      }
    }
  }

  &__caret {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    border-radius: $r-sm;
    cursor: pointer;
    color: $text-3;
    transition: transform $t-fast $ease, color $t-fast $ease;

    &:hover {
      color: $accent;
    }

    &--collapsed {
      transform: rotate(-90deg);
    }

    &--leaf {
      cursor: default;
    }
  }

  &__text {
    flex: 1;
    min-width: 0;
    font-size: $fs-sm;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &--long {
      color: $text-3;
    }
  }

  &__badge {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    font-size: 10px;
    line-height: 14px;
    border-radius: $r-sm;

    &--dup {
      padding: 0 4px;
      color: $warning;
      background: rgba(217, 119, 6, 0.1);
    }

    &--jump {
      color: $warning;
    }
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: $sp-1;
    height: 100%;
    min-height: 160px;
    color: $text-3;
    text-align: center;
    padding: 0 $sp-4;
  }

  &__empty-icon {
    color: $border;
    margin-bottom: $sp-1;
  }

  &__empty-title {
    font-size: $fs-sm;
    font-weight: 500;
    color: $text-2;
  }

  &__empty-hint {
    font-size: $fs-xs;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: $sp-1;
    padding: $sp-1 $sp-3;
    border-top: 1px solid $border-light;
    font-size: $fs-xs;
    color: $warning;
    flex-shrink: 0;
  }
}

@keyframes outline-in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
