<script setup lang="ts">
import { useRouter } from 'vue-router'
import { RefreshCw } from 'lucide-vue-next'
import type { QuoteSnapshotVO } from '@/types/quote'
import { formatPercent, formatPrice } from '@/utils/quote/format'

// 指数卡片行（PRD 4.1）：后端配置顺序渲染、不重排（对接文档 §3.1）；整卡进详情
const props = defineProps<{
  indices: QuoteSnapshotVO[]
  loading?: boolean
  error?: string | null
}>()

const emit = defineEmits<{ retry: [] }>()

const router = useRouter()

const goToDetail = (item: QuoteSnapshotVO) => {
  // 同号异实红线：必须携带完整 symbol + secType（对接文档 §2.2）
  router.push({ name: 'quoteDetail', params: { secType: item.secType, symbol: item.symbol } })
}

const percentClass = (pct: number | null) =>
  pct === null || pct === 0 ? 'quote-flat' : pct > 0 ? 'quote-up' : 'quote-down'
</script>

<template>
  <div class="index-cards">
    <template v-if="loading && !indices.length">
      <div v-for="i in 4" :key="i" class="index-cards__skeleton" />
    </template>

    <div v-else-if="error && !indices.length" class="index-cards__error">
      <span>{{ error }}</span>
      <button class="index-cards__retry" @click="emit('retry')">
        <RefreshCw :size="13" /> 重试
      </button>
    </div>

    <div v-else class="index-cards__scroll">
      <button
        v-for="item in indices"
        :key="item.symbol"
        class="index-cards__card"
        @click="goToDetail(item)"
      >
        <span class="index-cards__name">{{ item.name }}</span>
        <span class="index-cards__price" :class="percentClass(item.changePercent)">
          {{ formatPrice(item.latestPrice, item.market) }}
        </span>
        <span class="index-cards__pct" :class="percentClass(item.changePercent)">
          {{ formatPercent(item.changePercent) }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;
@use '../../styles/mixins' as *;

.index-cards {
  padding: $sp-2 $sp-4 $sp-3;
  min-height: 84px;
}

.index-cards__scroll {
  display: flex;
  gap: $sp-2;
  overflow-x: auto;
  @include hide-scrollbar;
}

.index-cards__card {
  flex: 0 0 auto;
  min-width: 108px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--nb-surface-subtle);
  border: 1px solid var(--nb-border);
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: var(--nb-hover);
  }
}

.index-cards__name {
  font-size: 12px;
  color: var(--nb-text-secondary);
  @include ellipsis;
  max-width: 96px;
}

.index-cards__price,
.index-cards__pct {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.index-cards__pct {
  font-size: 12px;
  font-weight: 500;
}

.index-cards__skeleton {
  flex: 0 0 auto;
  width: 108px;
  height: 64px;
  border-radius: 10px;
  background: var(--nb-surface-subtle);
  animation: pulse 1.2s ease-in-out infinite;
}

.index-cards__error {
  display: flex;
  align-items: center;
  gap: $sp-2;
  padding: $sp-3;
  font-size: 13px;
  color: var(--nb-text-secondary);
}

.index-cards__retry {
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

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
</style>
