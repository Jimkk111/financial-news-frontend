<script setup lang="ts">
import { computed } from 'vue'
import type { QuoteSnapshotVO } from '@/types/quote'
import {
  currencySymbol,
  formatBigNumber,
  formatChange,
  formatPercent,
  formatPrice,
  marketLabel,
  secTypeLabel,
  shouldShowDataDate,
  tradeStatusLabel,
} from '@/utils/quote/format'

// 详情页报价区（PRD 4.2 / 对接文档 §3.4、§4）
// - 币种符号按市场（¥/HK$/$）；A股美股价格 2 位，港股原样（E6）
// - latestPrice null → '—'（退市/无成交）
// - 非 OPEN 状态必须展示数据日期（对接文档 §4 通用规则）；未知状态按 CLOSED
const props = defineProps<{ snapshot: QuoteSnapshotVO }>()

const percentClass = (pct: number | null | undefined) =>
  pct === null || pct === undefined || pct === 0 ? 'quote-flat' : pct > 0 ? 'quote-up' : 'quote-down'

const meta = computed(() => [
  { label: '今开', value: formatPrice(props.snapshot.open, props.snapshot.market) },
  { label: '昨收', value: formatPrice(props.snapshot.prevClose, props.snapshot.market) },
  { label: '最高', value: formatPrice(props.snapshot.high, props.snapshot.market) },
  { label: '最低', value: formatPrice(props.snapshot.low, props.snapshot.market) },
  {
    label: '成交量',
    value:
      props.snapshot.volume === null
        ? '—'
        : `${formatBigNumber(props.snapshot.volume)}股`,
  },
  { label: '成交额', value: formatTurnoverOf(props.snapshot) },
])

function formatTurnoverOf(s: QuoteSnapshotVO): string {
  if (s.turnover === null) return '—'
  return `${currencySymbol(s.currency)}${formatBigNumber(s.turnover)}`
}
</script>

<template>
  <div class="quote-header">
    <div class="quote-header__title">
      <span class="quote-header__name">{{ snapshot.name }}</span>
      <span class="quote-header__symbol">{{ snapshot.symbol }}</span>
      <span class="quote-header__tag">{{ marketLabel(snapshot.market) }}</span>
      <span class="quote-header__tag">{{ secTypeLabel(snapshot.secType) }}</span>
      <span
        class="quote-header__tag quote-header__tag--status"
        :class="{ 'quote-header__tag--warn': snapshot.tradeStatus === 'SUSPENDED' || snapshot.tradeStatus === 'DELISTED' }"
      >
        {{ tradeStatusLabel(snapshot.tradeStatus) }}
      </span>
    </div>

    <div class="quote-header__quote">
      <span class="quote-header__price" :class="percentClass(snapshot.changePercent)">
        {{ formatPrice(snapshot.latestPrice, snapshot.market) }}
      </span>
      <span class="quote-header__change" :class="percentClass(snapshot.changePercent)">
        {{ formatChange(snapshot.changeAmount) }}
      </span>
      <span class="quote-header__pct" :class="percentClass(snapshot.changePercent)">
        {{ formatPercent(snapshot.changePercent) }}
      </span>
      <span v-if="shouldShowDataDate(snapshot.tradeStatus)" class="quote-header__date">
        数据日期 {{ snapshot.dataDate }}
      </span>
    </div>

    <div class="quote-header__meta">
      <div v-for="m in meta" :key="m.label" class="quote-header__meta-item">
        <span class="quote-header__meta-label">{{ m.label }}</span>
        <span class="quote-header__meta-value">{{ m.value }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.quote-header {
  padding: $sp-3 $sp-4;
  border-bottom: 1px solid var(--nb-border);
}

.quote-header__title {
  display: flex;
  align-items: center;
  gap: $sp-2;
  flex-wrap: wrap;
}

.quote-header__name {
  font-size: 17px;
  font-weight: 600;
  color: var(--nb-text);
}

.quote-header__symbol {
  font-size: 12px;
  color: var(--nb-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.quote-header__tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  color: var(--nb-text-secondary);
  background: var(--nb-surface-subtle);
  border: 1px solid var(--nb-border);

  &--status {
    color: var(--nb-info);
    background: var(--nb-info-subtle);
    border-color: transparent;
  }

  &--warn {
    color: var(--nb-warning);
    background: var(--nb-warning-subtle);
  }
}

.quote-header__quote {
  display: flex;
  align-items: baseline;
  gap: $sp-3;
  margin: $sp-2 0;
  flex-wrap: wrap;
}

.quote-header__price {
  font-size: 30px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.quote-header__change,
.quote-header__pct {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.quote-header__date {
  margin-left: auto;
  font-size: 11px;
  color: var(--nb-text-tertiary);
}

.quote-header__meta {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: $sp-2 $sp-3;
}

.quote-header__meta-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.quote-header__meta-label {
  font-size: 11px;
  color: var(--nb-text-tertiary);
}

.quote-header__meta-value {
  font-size: 13px;
  color: var(--nb-text);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 480px) {
  .quote-header__meta {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
