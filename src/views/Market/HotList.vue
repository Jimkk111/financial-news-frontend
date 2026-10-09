<script setup lang="ts">
import { useRouter } from 'vue-router'
import { RefreshCw } from 'lucide-vue-next'
import type { QuoteSnapshotVO } from '@/types/quote'
import { formatPercent, formatPrice } from '@/utils/quote/format'

// 热门标的列表（PRD 4.1）：按后端配置顺序渲染；整行进详情
const props = defineProps<{
  stocks: QuoteSnapshotVO[]
  loading?: boolean
  error?: string | null
}>()

const emit = defineEmits<{ retry: [] }>()

const router = useRouter()

const goToDetail = (item: QuoteSnapshotVO) => {
  router.push({ name: 'quoteDetail', params: { secType: item.secType, symbol: item.symbol } })
}

const percentClass = (pct: number | null) =>
  pct === null || pct === 0 ? 'quote-flat' : pct > 0 ? 'quote-up' : 'quote-down'
</script>

<template>
  <div class="hot-list">
    <div class="hot-list__head">
      <span>热门标的</span>
      <span class="hot-list__head-right">最新价 / 涨跌幅</span>
    </div>

    <template v-if="loading && !stocks.length">
      <div v-for="i in 6" :key="i" class="hot-list__skeleton" />
    </template>

    <div v-else-if="error && !stocks.length" class="hot-list__error">
      <span>{{ error }}</span>
      <button class="hot-list__retry" @click="emit('retry')">
        <RefreshCw :size="13" /> 重试
      </button>
    </div>

    <button
      v-for="item in stocks"
      v-else
      :key="item.symbol"
      class="hot-list__row"
      @click="goToDetail(item)"
    >
      <div class="hot-list__left">
        <span class="hot-list__name">{{ item.name }}</span>
        <span class="hot-list__symbol">{{ item.symbol }}</span>
      </div>
      <div class="hot-list__right">
        <span class="hot-list__price" :class="percentClass(item.changePercent)">
          {{ formatPrice(item.latestPrice, item.market) }}
        </span>
        <span class="hot-list__badge" :class="percentClass(item.changePercent)">
          {{ formatPercent(item.changePercent) }}
        </span>
      </div>
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;
@use '../../styles/mixins' as *;

.hot-list {
  padding: 0 $sp-4 $sp-6;
}

.hot-list__head {
  display: flex;
  justify-content: space-between;
  padding: $sp-2 0;
  font-size: 12px;
  color: var(--nb-text-tertiary);
  border-bottom: 1px solid var(--nb-border);
}

.hot-list__row {
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

.hot-list__left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.hot-list__name {
  font-size: 14px;
  color: var(--nb-text);
  font-weight: 500;
  @include ellipsis;
}

.hot-list__symbol {
  font-size: 11px;
  color: var(--nb-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.hot-list__right {
  display: flex;
  align-items: center;
  gap: $sp-3;
  flex-shrink: 0;
}

.hot-list__price {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.hot-list__badge {
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

.dark .hot-list__badge.quote-up {
  background: rgba(255, 90, 95, 0.14);
}
.dark .hot-list__badge.quote-down {
  background: rgba(38, 180, 122, 0.16);
}

.hot-list__skeleton {
  height: 52px;
  border-radius: 8px;
  margin: $sp-2 0;
  background: var(--nb-surface-subtle);
  animation: hot-pulse 1.2s ease-in-out infinite;
}

.hot-list__error {
  display: flex;
  align-items: center;
  gap: $sp-2;
  padding: $sp-4 0;
  font-size: 13px;
  color: var(--nb-text-secondary);
}

.hot-list__retry {
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

@keyframes hot-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
</style>
