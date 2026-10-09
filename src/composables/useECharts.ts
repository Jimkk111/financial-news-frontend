import { computed, onUnmounted, ref, watch, type Ref, type WatchSource } from 'vue'
import { echarts, type EChartsCoreOption, type EChartsType } from '@/utils/echarts'
import { useThemeStore } from '@/stores/theme'

// ============================================================
// ECharts 薄壳 composable（docs/quote-frontend-design.md §5.5）
//
// - mounted 时按需 init（调用方保证容器已渲染）
// - ResizeObserver 跟随容器尺寸
// - option / 主题任一变化 → setOption 全量重建（notMerge: true），
//   数据量小（250 根 / 391 点）重建成本可忽略，换取可靠性与暗色切换无残影
// - unmounted 自动 dispose
// ============================================================

export function useECharts(
  elRef: Ref<HTMLElement | null>,
  buildOption: (isDark: boolean) => EChartsCoreOption,
  watchSources: WatchSource[],
) {
  const themeStore = useThemeStore()
  const isDark = computed(() => themeStore.getAppliedTheme() === 'dark')
  const ready = ref(false)

  let chart: EChartsType | null = null
  let ro: ResizeObserver | null = null

  function render() {
    if (!chart) return
    chart.setOption(buildOption(isDark.value), { notMerge: true })
  }

  function init() {
    if (!elRef.value || chart) return
    chart = echarts.init(elRef.value)
    ready.value = true
    render()

    ro = new ResizeObserver(() => chart?.resize())
    ro.observe(elRef.value)
  }

  function dispose() {
    ro?.disconnect()
    ro = null
    chart?.dispose()
    chart = null
    ready.value = false
  }

  // 数据或主题变化重绘；首次调用时若尚未 init（v-if 场景）由组件在
  // 容器挂载后手动调 init() —— 用 ready 标记避免空指针
  watch([isDark, ...watchSources], () => render())

  onUnmounted(dispose)

  return { init, dispose, render, ready, isDark }
}
