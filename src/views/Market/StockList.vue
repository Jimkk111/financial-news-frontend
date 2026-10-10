<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw } from 'lucide-vue-next'
import type { QuoteSnapshotVO } from '@/types/quote'
import { formatPercent, formatPrice } from '@/utils/quote/format'

// 分页股票列表：按接口顺序展示，整行进入详情
const props = defineProps<{
  stocks: QuoteSnapshotVO[]
  loading?: boolean
  error?: string | null
  page: number
  pageSize: number
  total: number
}>()

const emit = defineEmits<{ retry: []; pageChange: [page: number] }>()
const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const jumpPage = ref<number | string>('')
const canJump = computed(() => {
  const target = Number(jumpPage.value)
  return !props.loading && Number.isInteger(target) && target >= 1 &&
    target <= totalPages.value && target !== props.page
})

watch(() => props.page, () => { jumpPage.value = '' })

function jumpToPage() {
  if (canJump.value) emit('pageChange', Number(jumpPage.value))
}

const router = useRouter()

const goToDetail = (item: QuoteSnapshotVO) => {
  router.push({ name: 'quoteDetail', params: { secType: item.secType, symbol: item.symbol } })
}

const percentClass = (pct: number | null) =>
  pct === null || pct === 0 ? 'quote-flat' : pct > 0 ? 'quote-up' : 'quote-down'
</script>

<template>
  <div class="stock-list">
    <div class="stock-list__head">
      <span>股票列表</span>
      <span class="stock-list__head-right">最新价 / 涨跌幅</span>
    </div>

    <template v-if="loading && !stocks.length">
      <div v-for="i in 6" :key="i" class="stock-list__skeleton" />
    </template>

    <div v-if="error" class="stock-list__error" role="alert">
      <span>{{ error }}</span>
      <button class="stock-list__retry" @click="emit('retry')">
        <RefreshCw :size="13" /> 重试
      </button>
    </div>

    <button
      v-for="item in stocks"
      :key="item.symbol"
      class="stock-list__row"
      @click="goToDetail(item)"
    >
      <div class="stock-list__left">
        <span class="stock-list__name">{{ item.name }}</span>
        <span class="stock-list__symbol">{{ item.symbol }}</span>
      </div>
      <div class="stock-list__right">
        <span class="stock-list__price" :class="percentClass(item.changePercent)">
          {{ formatPrice(item.latestPrice, item.market) }}
        </span>
        <span class="stock-list__badge" :class="percentClass(item.changePercent)">
          {{ formatPercent(item.changePercent) }}
        </span>
      </div>
    </button>

    <div v-if="!loading && !error && !stocks.length" class="stock-list__error">暂无股票数据</div>

    <nav v-if="total > 0" class="stock-list__pagination" aria-label="股票列表分页">
      <button :disabled="loading || page <= 1" @click="emit('pageChange', page - 1)">上一页</button>
      <span class="stock-list__page-info" aria-live="polite" :aria-label="`第 ${page} 页，共 ${totalPages} 页`">
        {{ page }} / {{ totalPages }}
      </span>
      <button :disabled="loading || page >= totalPages" @click="emit('pageChange', page + 1)">下一页</button>
      <form class="stock-list__jump" @submit.prevent="jumpToPage">
        <input
          v-model="jumpPage"
          type="number"
          min="1"
          :max="totalPages"
          step="1"
          :disabled="loading"
          placeholder="页码"
          aria-label="跳转页码"
        />
        <button type="submit" :disabled="!canJump">跳转</button>
      </form>
    </nav>
    <div v-if="loading && stocks.length" class="stock-list__error" role="status">正在加载股票列表…</div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;
@use '../../styles/mixins' as *;

.stock-list {
  padding: 0 $sp-4 $sp-6;
}

.stock-list__head {
  display: flex;
  justify-content: space-between;
  padding: $sp-2 0;
  font-size: 12px;
  color: var(--nb-text-tertiary);
  border-bottom: 1px solid var(--nb-border);
}

.stock-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: $sp-3 0;
  border-bottom: 1px solid var(--nb-border);
  cursor: pointer;
  transition: background 0.15s ease;
  text-align: left;

  &:hover {
    background: var(--nb-hover);
  }
}

.stock-list__left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stock-list__name {
  font-size: 14px;
  color: var(--nb-text);
  font-weight: 500;
  @include ellipsis;
}

.stock-list__symbol {
  font-size: 11px;
  color: var(--nb-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.stock-list__right {
  display: flex;
  align-items: center;
  gap: $sp-3;
  flex-shrink: 0;
}

.stock-list__price {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stock-list__badge {
  min-width: 64px;
  text-align: center;
  padding: 3px 6px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;

  &.quote-up {
    background: rgba(217, 46, 46, 0.08);
  }
  &.quote-down {
    background: rgba(15, 123, 82, 0.1);
  }
  &.quote-flat {
    background: var(--nb-surface-subtle);
  }
}

.dark .stock-list__badge.quote-up {
  background: rgba(255, 90, 95, 0.14);
}
.dark .stock-list__badge.quote-down {
  background: rgba(38, 180, 122, 0.16);
}

.stock-list__skeleton {
  height: 52px;
  border-radius: 8px;
  margin: $sp-2 0;
  background: var(--nb-surface-subtle);
  animation: stock-pulse 1.2s ease-in-out infinite;
}

.stock-list__error {
  display: flex;
  align-items: center;
  gap: $sp-2;
  padding: $sp-4 0;
  font-size: 13px;
  color: var(--nb-text-secondary);
}

.stock-list__retry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 6px;
  color: var(--nb-info);
  background: var(--nb-info-subtle);
  cursor: pointer;
}

.stock-list__pagination {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-top: $sp-4;
  overflow-x: auto;
  font-size: 12px;
  white-space: nowrap;
  color: var(--nb-text-secondary);

  button {
    flex-shrink: 0;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: inherit;
    line-height: 18px;
    white-space: nowrap;
    color: var(--nb-info);
    background: var(--nb-info-subtle);
    cursor: pointer;

    &:disabled {
      opacity: 0.45;
      cursor: default;
    }
  }
}

.stock-list__page-info {
  flex-shrink: 0;
  padding: 0 2px;
  font-variant-numeric: tabular-nums;
}

.stock-list__jump {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  margin-left: 2px;

  input {
    width: 52px;
    min-width: 0;
    padding: 5px 6px;
    border: 1px solid var(--nb-border);
    border-radius: 6px;
    background: var(--nb-surface-subtle);
    color: var(--nb-text);
    font-size: 12px;
    line-height: 18px;
    text-align: center;
    appearance: textfield;

    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
      margin: 0;
      -webkit-appearance: none;
    }

    &:focus-visible {
      outline: 2px solid var(--nb-info);
      outline-offset: 1px;
    }

    &:disabled {
      opacity: 0.45;
    }
  }
}

@keyframes stock-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
</style>
