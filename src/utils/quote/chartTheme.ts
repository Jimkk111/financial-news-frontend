// ============================================================
// 行情图表配色（亮/暗两套）
// 红涨绿跌为 A 股惯例，三市场一致（PRD 5.2-1）。
// CSS 侧令牌见 src/styles/tokens.scss 的 --quote-up/--quote-down/--quote-flat，
// 两处色值需保持一致（ECharts 需静态色值，无法读 CSS 变量）。
// ============================================================

export interface QuoteChartPalette {
  /** 主文字（tooltip 标题等） */
  text: string
  /** 次级文字（轴标签） */
  textSub: string
  /** 轴线 */
  axisLine: string
  /** 分割线 */
  splitLine: string
  /** tooltip 背景/边框 */
  tooltipBg: string
  tooltipBorder: string
  /** 涨（红） */
  up: string
  /** 跌（绿） */
  down: string
  /** 平盘（灰） */
  flat: string
  /** 分时价格线（蓝） */
  priceLine: string
  /** 分时均价线（黄） */
  avgLine: string
  /** 昨收基准虚线 */
  prevCloseLine: string
}

const LIGHT: QuoteChartPalette = {
  text: '#37352f',
  textSub: '#9b9a97',
  axisLine: 'rgba(55, 53, 47, 0.16)',
  splitLine: 'rgba(55, 53, 47, 0.07)',
  tooltipBg: '#ffffff',
  tooltipBorder: 'rgba(55, 53, 47, 0.16)',
  up: '#d92e2e',
  down: '#0f7b52',
  flat: '#8c8c8c',
  priceLine: '#2383e2',
  avgLine: '#f0a742',
  prevCloseLine: 'rgba(55, 53, 47, 0.3)',
}

const DARK: QuoteChartPalette = {
  text: 'rgba(255, 255, 255, 0.81)',
  textSub: 'rgba(255, 255, 255, 0.45)',
  axisLine: 'rgba(255, 255, 255, 0.18)',
  splitLine: 'rgba(255, 255, 255, 0.08)',
  tooltipBg: '#2a2a2a',
  tooltipBorder: 'rgba(255, 255, 255, 0.18)',
  up: '#ff5a5f',
  down: '#26b47a',
  flat: '#7a7a7a',
  priceLine: '#4c9aff',
  avgLine: '#f0a742',
  prevCloseLine: 'rgba(255, 255, 255, 0.35)',
}

export function getChartPalette(isDark: boolean): QuoteChartPalette {
  return isDark ? DARK : LIGHT
}

/** 日 K 均线固定色相区分：MA5 黄 / MA10 蓝 / MA20 紫 / MA60 青 */
export const MA_COLORS = {
  ma5: '#f0a742',
  ma10: '#5b8ff9',
  ma20: '#c26de8',
  ma60: '#42c28d',
} as const

export function maColor(key: keyof typeof MA_COLORS): string {
  return MA_COLORS[key]
}
