<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from 'lucide-vue-next'
import { searchQuotes } from '@/api/quote'
import { errorMessage } from '@/utils/toast'
import { debounce } from '@/utils/debounce'
import type { QuoteSearchItemVO } from '@/types/quote'
import { marketLabel, secTypeLabel } from '@/utils/quote/format'

// 标的搜索联想（PRD 4.3 / 对接文档 §3.3）：
// - 300ms 防抖；空关键词不请求
// - 键盘 ↑↓ 在当前结果内移动高亮（不重发请求），Enter 进详情，Esc 收起
// - 无结果空态保留已输入关键词（E9）
// - 详情跳转使用接口原样返回的 symbol + secType（同号异实红线）
const SEARCH_DEBOUNCE_MS = 300

const router = useRouter()

const keyword = ref('')
const items = ref<QuoteSearchItemVO[]>([])
const searched = ref(false) // 区分"无结果"与"未搜索"
const searching = ref(false)
const open = ref(false)
const highlightIndex = ref(-1)
const boxRef = ref<HTMLElement | null>(null)

async function doSearch(kw: string) {
  const trimmed = kw.trim()
  searching.value = true
  try {
    const res = await searchQuotes(trimmed)
    // 过期响应丢弃：仅当仍是当前关键词时更新结果
    if (keyword.value.trim() !== trimmed) return
    items.value = res.items
    searched.value = true
    highlightIndex.value = res.items.length ? 0 : -1
    open.value = true
  } catch (e) {
    if (keyword.value.trim() !== trimmed) return
    items.value = []
    searched.value = true
    open.value = false
    errorMessage(e, '搜索失败，请重试')
  } finally {
    searching.value = false
  }
}

const debouncedSearch = debounce((kw: unknown) => void doSearch(String(kw)), SEARCH_DEBOUNCE_MS)

function onInput() {
  const kw = keyword.value
  if (!kw.trim()) {
    items.value = []
    searched.value = false
    highlightIndex.value = -1
    open.value = false
    return
  }
  void debouncedSearch(kw)
}

function moveHighlight(delta: number) {
  if (!items.value.length) return
  const next = highlightIndex.value + delta
  highlightIndex.value = Math.min(Math.max(next, 0), items.value.length - 1)
}

function goDetail(item: QuoteSearchItemVO) {
  open.value = false
  router.push({ name: 'quoteDetail', params: { secType: item.secType, symbol: item.symbol } })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveHighlight(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveHighlight(-1)
  } else if (e.key === 'Enter') {
    const item = items.value[highlightIndex.value]
    if (item) goDetail(item)
  } else if (e.key === 'Escape') {
    open.value = false
  }
}

// 点击组件外部收起下拉
function onDocClick(e: MouseEvent) {
  if (boxRef.value && !boxRef.value.contains(e.target as Node)) open.value = false
}
document.addEventListener('click', onDocClick)
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="boxRef" class="quote-search">
    <div class="quote-search__bar">
      <Search :size="15" class="quote-search__icon" />
      <input
        v-model="keyword"
        class="quote-search__input"
        type="text"
        placeholder="搜索代码 / 名称 / 拼音，如 600519、茅台、gzmt"
        @input="onInput"
        @focus="items.length && (open = true)"
        @keydown="onKeydown"
      />
      <span v-if="searching" class="quote-search__spinner" />
    </div>

    <div v-if="open" class="quote-search__dropdown">
      <template v-if="items.length">
        <button
          v-for="(item, i) in items"
          :key="`${item.symbol}-${item.secType}`"
          class="quote-search__item"
          :class="{ 'is-highlight': i === highlightIndex }"
          @mouseenter="highlightIndex = i"
          @click="goDetail(item)"
        >
          <span class="quote-search__name">{{ item.name }}</span>
          <span class="quote-search__tag">{{ marketLabel(item.market) }}</span>
          <span class="quote-search__tag quote-search__tag--type">
            {{ secTypeLabel(item.secType) }}
          </span>
          <span v-if="item.status === 'DELISTED'" class="quote-search__tag quote-search__tag--delisted">
            已退市
          </span>
          <span class="quote-search__symbol">{{ item.symbol }}</span>
        </button>
      </template>
      <div v-else-if="searched" class="quote-search__empty">未找到相关标的</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;
@use '../../styles/mixins' as *;

.quote-search {
  position: relative;
  padding: $sp-2 $sp-4 $sp-2;
}

.quote-search__bar {
  display: flex;
  align-items: center;
  gap: $sp-2;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--nb-surface-subtle);
  border: 1px solid var(--nb-border);

  &:focus-within {
    border-color: var(--nb-border-strong);
  }
}

.quote-search__icon {
  color: var(--nb-text-tertiary);
  flex-shrink: 0;
}

.quote-search__input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--nb-text);

  &::placeholder {
    color: var(--nb-text-tertiary);
  }
}

.quote-search__spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--nb-border-strong);
  border-top-color: var(--nb-info);
  animation: qs-spin 0.7s linear infinite;
}

.quote-search__dropdown {
  position: absolute;
  left: $sp-4;
  right: $sp-4;
  top: calc(100% - 4px);
  z-index: 10;
  background: var(--nb-surface);
  border: 1px solid var(--nb-border);
  border-radius: 10px;
  box-shadow: var(--nb-shadow-md);
  overflow: hidden;
}

.quote-search__item {
  display: flex;
  align-items: center;
  gap: $sp-2;
  width: 100%;
  padding: 10px 12px;
  border-bottom: 1px solid var(--nb-border);
  cursor: pointer;
  text-align: left;

  &:last-child {
    border-bottom: none;
  }

  &.is-highlight {
    background: var(--nb-hover);
  }
}

.quote-search__name {
  font-size: 13px;
  color: var(--nb-text);
  font-weight: 500;
  @include ellipsis;
  max-width: 130px;
}

.quote-search__tag {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  color: var(--nb-text-secondary);
  background: var(--nb-surface-subtle);
  border: 1px solid var(--nb-border);

  &--type {
    color: var(--nb-info);
    background: var(--nb-info-subtle);
    border-color: transparent;
  }

  &--delisted {
    color: var(--nb-text-tertiary);
    background: var(--nb-surface-subtle);
  }
}

.quote-search__symbol {
  margin-left: auto;
  font-size: 11px;
  color: var(--nb-text-tertiary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.quote-search__empty {
  padding: $sp-4;
  text-align: center;
  font-size: 13px;
  color: var(--nb-text-tertiary);
}

@keyframes qs-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
