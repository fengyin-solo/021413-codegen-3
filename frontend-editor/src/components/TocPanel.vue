<template>
  <aside v-if="!toc.panelCollapsed" class="toc" aria-label="文档目录">
    <header class="toc__head">
      <span class="toc__title">目录</span>
      <span v-if="toc.headings.length" class="toc__count">{{ toc.headings.length }}</span>
      <button class="toc__head-btn" title="收起目录" @click="toc.togglePanel()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
    </header>

    <div class="toc__filter">
      <svg class="toc__filter-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input
        class="toc__filter-input"
        type="text"
        placeholder="筛选标题…"
        :value="toc.filter"
        @input="toc.setFilter($event.target.value)"
      />
      <button v-if="toc.filter" class="toc__filter-clear" title="清除筛选" @click="toc.setFilter('')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- Empty states -->
    <div v-if="isEmptyDoc" class="toc__state">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <p class="toc__state-title">文档为空</p>
      <p class="toc__state-hint">开始输入后，这里会显示标题目录</p>
    </div>
    <div v-else-if="!toc.headings.length" class="toc__state">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="17" y2="18"/></svg>
      <p class="toc__state-title">暂无标题</p>
      <p class="toc__state-hint">使用 # 至 ###### 创建标题</p>
    </div>
    <div v-else-if="!toc.visibleItems.length" class="toc__state">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
      <p class="toc__state-title">无匹配结果</p>
      <p class="toc__state-hint">没有匹配「{{ toc.filter }}」的标题</p>
    </div>

    <!-- Outline list -->
    <ul v-else ref="listEl" class="toc__list">
      <li v-for="it in toc.visibleItems" :key="it.id">
        <div
          class="toc__row"
          :class="{
            'toc__row--active': it.id === toc.activeId,
            'toc__row--contains-active': it.containsActive
          }"
          :style="{ paddingLeft: `${8 + it.depth * 14}px` }"
          :data-id="it.id"
        >
          <button
            v-if="it.hasChildren && !toc.isFiltering"
            class="toc__caret"
            :title="isCollapsed(it) ? '展开' : '折叠'"
            @click.stop="toc.toggleNode(it.key)"
          >
            <svg
              width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
              :style="{ transform: isCollapsed(it) ? 'none' : 'rotate(90deg)' }"
            ><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <span v-else class="toc__caret toc__caret--leaf" />

          <button class="toc__entry" :title="tooltipFor(it)" @click="emit('navigate', it)">
            <span class="toc__level" :class="`toc__level--${it.level}`">H{{ it.level }}</span>
            <span class="toc__text" :class="{ 'toc__text--long': it.long }">{{ it.text }}</span>
            <span
              v-if="it.dupCount"
              class="toc__badge toc__badge--dup"
            >×{{ it.dupCount }}</span>
            <span
              v-if="it.jump"
              class="toc__badge toc__badge--jump"
            >!</span>
          </button>
        </div>
      </li>
    </ul>

    <footer v-if="toc.isFiltering && toc.headings.length" class="toc__foot">
      匹配 {{ toc.matchCount }} / {{ toc.headings.length }} 个标题
    </footer>
  </aside>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useTocStore } from '@/stores/toc'
import { useEditorStore } from '@/stores/editor'

const toc = useTocStore()
const editor = useEditorStore()
const emit = defineEmits(['navigate'])

const listEl = ref(null)

const isEmptyDoc = computed(() => !editor.content.trim())

const isCollapsed = (item) => toc.collapsedKeys.has(item.key)

function tooltipFor(it) {
  const parts = []
  if (it.long) parts.push(it.text)
  if (it.dupCount) parts.push(`重复标题：全文共出现 ${it.dupCount} 次`)
  if (it.jump) {
    parts.push(it.jump.from === 0
      ? `层级跳跃：文档以 H${it.jump.to} 开头`
      : `层级跳跃：H${it.jump.from} → H${it.jump.to}`)
  }
  return parts.length ? parts.join('\n') : it.text
}

// Keep the active item visible while the cursor moves / content changes
watch(
  () => [toc.activeId, toc.panelCollapsed],
  async ([, collapsed]) => {
    if (collapsed) return
    await nextTick()
    const el = listEl.value?.querySelector(`[data-id="${toc.activeId}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  },
  { immediate: true }
)
</script>

<style lang="scss" scoped>
.toc {
  display: flex;
  flex-direction: column;
  width: 264px;
  flex-shrink: 0;
  background: $bg;
  border-right: 1px solid $border-light;
  user-select: none;
  min-height: 0;

  &__head {
    display: flex;
    align-items: center;
    gap: $sp-2;
    padding: $sp-3 $sp-3 $sp-2;
  }

  &__title {
    font-size: $fs-xs;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: $text-3;
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

  &__head-btn {
    margin-left: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    background: transparent;
    border-radius: $r-md;
    color: $text-3;
    cursor: pointer;
    transition: all $t-fast $ease;

    &:hover { background: $accent-soft; color: $accent; }
  }

  &__filter {
    position: relative;
    display: flex;
    align-items: center;
    margin: 0 $sp-3 $sp-2;
  }

  &__filter-icon {
    position: absolute;
    left: 8px;
    color: $text-3;
    pointer-events: none;
  }

  &__filter-input {
    width: 100%;
    height: 26px;
    padding: 0 24px 0 26px;
    font-size: $fs-xs;
    font-family: $font-ui;
    color: $text;
    background: $bg-code;
    border: 1px solid transparent;
    border-radius: $r-md;
    outline: none;
    transition: all $t-fast $ease;

    &::placeholder { color: $text-3; }
    &:focus { background: $bg-elevated; border-color: $accent-mid; }
  }

  &__filter-clear {
    position: absolute;
    right: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: none;
    background: transparent;
    border-radius: 50%;
    color: $text-3;
    cursor: pointer;

    &:hover { color: $text-2; background: $border-light; }
  }

  &__list {
    flex: 1;
    overflow-y: auto;
    padding: 0 $sp-2 $sp-3;
    list-style: none;
    min-height: 0;
  }

  &__row {
    display: flex;
    align-items: center;
    border-radius: $r-md;
    transition: background $t-fast $ease;

    &:hover { background: $accent-soft; }

    &--active {
      background: $accent-soft;
      box-shadow: inset 2px 0 0 $accent;

      .toc__text { color: $accent; font-weight: 600; }
      .toc__level { color: $accent; }
    }

    &--contains-active {
      box-shadow: inset 2px 0 0 $accent-mid;
      .toc__text { color: $accent; }
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
    color: $text-3;
    cursor: pointer;
    padding: 0;

    svg { transition: transform $t-fast $ease; }
    &:hover { color: $accent; background: $accent-mid; }

    &--leaf { cursor: default; }
  }

  &__entry {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding: 4px 6px 4px 2px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
  }

  &__level {
    flex-shrink: 0;
    font-size: 9px;
    font-family: $font-mono;
    font-weight: 500;
    color: $text-3;
    width: 18px;

    &--1 { color: $text; font-weight: 700; }
    &--2 { color: $text-2; font-weight: 600; }
  }

  &__text {
    flex: 1;
    min-width: 0;
    font-size: $fs-xs;
    color: $text-2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__badge {
    flex-shrink: 0;
    font-size: 9px;
    font-family: $font-mono;
    line-height: 14px;
    padding: 0 4px;
    border-radius: $r-sm;

    &--dup {
      color: $warning;
      background: rgba(217, 119, 6, 0.1);
    }

    &--jump {
      color: $error;
      background: rgba(220, 38, 38, 0.08);
      font-weight: 700;
    }
  }

  &__state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: $sp-1;
    padding: $sp-5 $sp-4;
    color: $text-3;
    text-align: center;
  }

  &__state-title {
    font-size: $fs-sm;
    font-weight: 600;
    color: $text-2;
    margin-top: $sp-2;
  }

  &__state-hint {
    font-size: $fs-xs;
    line-height: 1.6;
    word-break: break-all;
  }

  &__foot {
    padding: $sp-1 $sp-3;
    border-top: 1px solid $border-light;
    font-size: $fs-xs;
    font-family: $font-mono;
    color: $text-3;
    text-align: center;
  }
}
</style>
