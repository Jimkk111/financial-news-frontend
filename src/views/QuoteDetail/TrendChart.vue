<script setup lang="ts">
import { onMounted, ref, type PropType } from 'vue'
import type { QuoteTrendVO } from '@/types/quote'
import { buildTrendOption } from '@/utils/quote/chartOptions'
import { useECharts } from '@/composables/useECharts'

// 分时图薄壳（docs/quote-frontend-design.md §5.5）：
// 数据重排/轴刻度/量价联动全部在 buildTrendOption 纯函数中，可单测
const props = defineProps({
  trend: { type: Object as PropType<QuoteTrendVO>, required: true },
})

const elRef = ref<HTMLElement | null>(null)

const { init } = useECharts(elRef, (isDark) => buildTrendOption(props.trend, isDark), [
  () => props.trend,
])

onMounted(init)
</script>

<template>
  <div ref="elRef" class="trend-chart" />
</template>

<style scoped lang="scss">
.trend-chart {
  width: 100%;
  height: 380px;
}

@media (max-width: 480px) {
  .trend-chart {
    height: 320px;
  }
}
</style>
