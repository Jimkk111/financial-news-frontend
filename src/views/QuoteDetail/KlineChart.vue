<script setup lang="ts">
import { onMounted, ref, type PropType } from 'vue'
import type { QuoteKlineVO } from '@/types/quote'
import { buildKlineOption } from '@/utils/quote/chartOptions'
import { useECharts } from '@/composables/useECharts'

// 日 K 薄壳：蜡烛 + MA + 量副图 + dataZoom（首屏 120 根，本地缩放不翻页）
const props = defineProps({
  kline: { type: Object as PropType<QuoteKlineVO>, required: true },
})

const elRef = ref<HTMLElement | null>(null)

const { init } = useECharts(elRef, (isDark) => buildKlineOption(props.kline, isDark), [
  () => props.kline,
])

onMounted(init)
</script>

<template>
  <div ref="elRef" class="kline-chart" />
</template>

<style scoped lang="scss">
.kline-chart {
  width: 100%;
  height: 420px;
}

@media (max-width: 480px) {
  .kline-chart {
    height: 360px;
  }
}
</style>
