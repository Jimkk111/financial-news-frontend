<script setup lang="ts">
import type { QuoteMarket } from '@/types/quote'

// 市场分段切换（PRD 4.1）：本地切换 + 记忆最后所在市场，由父组件触发加载
const OPTIONS: Array<{ value: QuoteMarket; label: string }> = [
  { value: 'CN', label: 'A股' },
  { value: 'US', label: '美股' },
  { value: 'HK', label: '港股' },
]

const props = defineProps<{ modelValue: QuoteMarket }>()
const emit = defineEmits<{ update: [market: QuoteMarket] }>()

function select(market: QuoteMarket) {
  if (market !== props.modelValue) emit('update', market)
}
</script>

<template>
  <div class="market-tabs" role="tablist">
    <button
      v-for="opt in OPTIONS"
      :key="opt.value"
      class="market-tabs__item"
      :class="{ 'is-active': opt.value === modelValue }"
      role="tab"
      :aria-selected="opt.value === modelValue"
      @click="select(opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.market-tabs {
  display: flex;
  gap: $sp-1;
  padding: 0 $sp-4 $sp-2;
}

.market-tabs__item {
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--nb-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--nb-hover);
  }

  &.is-active {
    color: var(--nb-text);
    background: var(--nb-surface-subtle);
    border-color: var(--nb-border);
    font-weight: 600;
  }
}
</style>
