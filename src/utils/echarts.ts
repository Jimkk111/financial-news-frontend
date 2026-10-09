// ============================================================
// ECharts 按需注册出口（全项目唯一允许 import echarts 的地方）
// 目标：vendor-echarts 独立 chunk，gzip ≤ 150KB；不用的能力不注册
// ============================================================

import * as echarts from 'echarts/core'
import { LineChart, CandlestickChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  AxisPointerComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  CandlestickChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  AxisPointerComponent,
  CanvasRenderer,
])

export { echarts }
export type { EChartsCoreOption } from 'echarts/core'
export type { EChartsType } from 'echarts/core'
