import type { EChartsCoreOption } from '@/utils/echarts'
import type { QuoteKlineVO, QuoteMarket, QuoteTrendVO } from '@/types/quote'
import { currencySymbol, formatBigNumber, formatPercent, formatPrice } from './format'
import { getChartPalette, MA_COLORS, type QuoteChartPalette } from './chartTheme'

// ============================================================
// 行情图表 option 生成（纯函数，组件只做薄壳）
// 设计来源：docs/quote-frontend-design.md §5.5
//
// 分时 x 轴约定（对接文档 §3.5）：
// - minute 是折叠午休后的轴偏移，[0, timelineMinutes]，图表全轴长度 = timelineMinutes + 1
// - 盘中未到的分钟保持 null，折线自然停在最新点
// - 轴刻度只标边界点；CN/HK 时段固定用常量表，US（跨日 + 夏令时）
//   动态取数据点的 time，禁止由 minute 反推时间
// ============================================================

/** CN/HK 交易时段固定（无夏令时）：边界 minute → 刻度文案 */
const TREND_BOUNDARY_LABELS: Partial<
  Record<QuoteMarket, { total: number; labels: Record<number, string> }>
> = {
  CN: { total: 240, labels: { 0: '09:30', 120: '11:30/13:00', 240: '15:00' } },
  HK: { total: 330, labels: { 0: '09:30', 150: '12:00/13:00', 330: '16:00' } },
}

/** 分时图首屏可视默认值（量价图上下两块的高度占比） */
const TREND_PRICE_GRID_HEIGHT = '55%'
const TREND_VOLUME_GRID_TOP = '74%'
const TREND_VOLUME_GRID_HEIGHT = '16%'

export interface TrendSeriesData {
  /** 下标 = minute；未来分钟 / 缺失为 null */
  prices: Array<number | null>
  avgPrices: Array<number | null>
  volumes: Array<number | null>
  /** 每分钟的展示时间（HH:mm），tooltip 与动态刻度用；null = 无数据 */
  times: Array<string | null>
  /** 成交量柱着色（与前一点价格比，首点与昨收比） */
  volumeColors: string[]
  prevClose: number | null
  /** 轴刻度：边界 minute → 文案 */
  axisLabels: Array<{ minute: number; label: string }>
}

/** 分时数据重排：把 points 按 minute 回填到全轴，并推导柱色与轴刻度 */
export function buildTrendSeriesData(trend: QuoteTrendVO): TrendSeriesData {
  const palette = getChartPalette(false)
  const len = trend.timelineMinutes + 1
  const prices: Array<number | null> = new Array(len).fill(null)
  const avgPrices: Array<number | null> = new Array(len).fill(null)
  const volumes: Array<number | null> = new Array(len).fill(null)
  const times: Array<string | null> = new Array(len).fill(null)

  for (const pt of trend.points) {
    // 防御：越界点丢弃，避免打乱轴结构
    if (pt.minute < 0 || pt.minute >= len) continue
    prices[pt.minute] = pt.price
    avgPrices[pt.minute] = pt.avgPrice
    volumes[pt.minute] = pt.volume
    times[pt.minute] = pt.time
  }

  // 量柱红绿：与前一点比价；首个有效点与昨收比；无基准按平盘灰
  const volumeColors: string[] = new Array(len).fill(palette.flat)
  let lastPrice: number | null = trend.prevClose
  for (let i = 0; i < len; i++) {
    const price = prices[i]
    // noUncheckedIndexedAccess：索引访问可能是 undefined，一并排除
    if (price === null || price === undefined) continue
    volumeColors[i] =
      lastPrice === null || price === lastPrice
        ? palette.flat
        : price > lastPrice
          ? palette.up
          : palette.down
    lastPrice = price
  }

  return {
    prices,
    avgPrices,
    volumes,
    times,
    volumeColors,
    prevClose: trend.prevClose,
    axisLabels: buildTrendAxisLabels(trend.market, len, times),
  }
}

/** 轴刻度：CN/HK 常量表（timelineMinutes 匹配时），否则动态取数据点 time */
function buildTrendAxisLabels(
  market: QuoteMarket,
  len: number,
  times: Array<string | null>,
): Array<{ minute: number; label: string }> {
  const fixed = TREND_BOUNDARY_LABELS[market]
  if (fixed && fixed.total === len - 1) {
    return Object.entries(fixed.labels).map(([minute, label]) => ({
      minute: Number(minute),
      label,
    }))
  }

  // 动态（美股 / 时段与常量不符）：只用数据点携带的 time，绝不反推
  const lastAvailable = findLastIndex(times, (t) => t !== null)
  if (lastAvailable < 0) return []
  const candidates = Array.from(
    new Set([0, Math.floor((len - 1) / 3), Math.floor(((len - 1) * 2) / 3), lastAvailable]),
  )
  const labels: Array<{ minute: number; label: string }> = []
  for (const minute of candidates) {
    const time = times[minute]
    if (time) labels.push({ minute, label: time })
  }
  return labels
}

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    const item = arr[i]
    if (item !== undefined && predicate(item)) return i
  }
  return -1
}

/** 价格轴范围：包含昨收基准线上下留白；全空数据返回 undefined（轴自动） */
function priceBounds(prices: Array<number | null>, prevClose: number | null) {
  let lo: number | null = null
  let hi: number | null = null
  for (const v of prices) {
    if (v === null) continue
    if (lo === null || v < lo) lo = v
    if (hi === null || v > hi) hi = v
  }
  if (prevClose !== null) {
    if (lo === null || prevClose < lo) lo = prevClose
    if (hi === null || prevClose > hi) hi = prevClose
  }
  if (lo === null || hi === null) return { yMin: undefined, yMax: undefined }
  // 一字线（hi === lo）时给个最小幅度，避免轴退化
  const pad = Math.max((hi - lo) * 0.08, Math.abs(hi) * 0.002 || 0.01)
  return { yMin: lo - pad, yMax: hi + pad }
}

export function buildTrendOption(trend: QuoteTrendVO, isDark: boolean): EChartsCoreOption {
  const p = getChartPalette(isDark)
  const d = buildTrendSeriesData(trend)
  const len = d.prices.length
  const categories = Array.from({ length: len }, (_, i) => String(i))
  const { yMin, yMax } = priceBounds(d.prices, d.prevClose)

  // 右轴涨跌幅与左轴价格共享同一像素区间（同基准线性映射）
  const hasPercent = d.prevClose !== null && d.prevClose !== 0 && yMin !== undefined
  const toPercent = (v: number) => ((v - (d.prevClose as number)) / (d.prevClose as number)) * 100

  const labelMap = new Map(d.axisLabels.map((a) => [String(a.minute), a.label]))

  const baseXAxis = {
    type: 'category' as const,
    data: categories,
    boundaryGap: false,
    axisLine: { lineStyle: { color: p.axisLine } },
    axisTick: { show: false },
    splitLine: { show: false },
  }

  const quote = currencySymbol(trend.currency)

  return {
    animation: false,
    // 量价十字光标联动（主图/副图共享 x 轴指针）
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'cross' },
      // 浮层固定在图区顶部，移动端不遮挡手指（PRD 4.2）
      position(
        point: [number, number],
        _params: unknown,
        _dom: unknown,
        _rect: unknown,
        size: { contentSize: [number, number]; viewSize: [number, number] },
      ) {
        const left = Math.min(
          Math.max(point[0] - size.contentSize[0] / 2, 8),
          size.viewSize[0] - size.contentSize[0] - 8,
        )
        return { left, top: 4 }
      },
      formatter: (params: unknown) => {
        const list = params as Array<{ axisValue?: string | number; dataIndex?: number }>
        const first = list?.[0]
        if (!first) return ''
        const minute = Number(first.axisValue ?? first.dataIndex ?? -1)
        const time = d.times[minute]
        const price = d.prices[minute]
        if (!time || price === null || price === undefined) return ''
        const avg = d.avgPrices[minute]
        const vol = d.volumes[minute]
        const pct =
          d.prevClose !== null && d.prevClose !== 0
            ? formatPercent(Math.round(((price - d.prevClose) / d.prevClose) * 10000) / 100)
            : '—'
        const row = (label: string, value: string, color?: string) =>
          `<div style="margin-top:2px">${label} <span style="float:right;margin-left:16px;${
            color ? `color:${color}` : ''
          }">${value}</span></div>`
        return (
          `<div style="font-weight:600;margin-bottom:2px">${time}</div>` +
          row('价格', `${quote}${formatPrice(price, trend.market)}`, pctColor(price, d.prevClose, p)) +
          row('均价', avg === null ? '—' : `${quote}${formatPrice(avg, trend.market)}`) +
          row('涨跌幅', pct, pctColor(price, d.prevClose, p)) +
          row('成交量', vol === null ? '—' : `${formatBigNumber(vol)}股`)
        )
      },
    },
    grid: [
      { left: 8, right: 8, top: 30, height: TREND_PRICE_GRID_HEIGHT, containLabel: true },
      {
        left: 8,
        right: 8,
        top: TREND_VOLUME_GRID_TOP,
        height: TREND_VOLUME_GRID_HEIGHT,
        containLabel: true,
      },
    ],
    xAxis: [
      { ...baseXAxis, gridIndex: 0, axisLabel: { show: false } },
      {
        ...baseXAxis,
        gridIndex: 1,
        axisLabel: {
          show: true,
          color: p.textSub,
          fontSize: 10,
          // 只标边界点，其余隐藏
          interval: (index: number) => labelMap.has(String(index)),
          formatter: (value: string) => labelMap.get(value) ?? '',
        },
        axisPointer: {
          label: { show: true, formatter: (p2: { value: string | number }) => d.times[Number(p2.value)] ?? '' },
        },
      },
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 0,
        position: 'left',
        min: yMin,
        max: yMax,
        axisLabel: { show: true, color: p.textSub, fontSize: 10, formatter: (v: number) => formatPrice(v, trend.market) },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: p.splitLine } },
        axisPointer: { label: { show: false } },
      },
      hasPercent
        ? {
            type: 'value',
            gridIndex: 0,
            position: 'right',
            min: toPercent(yMin as number),
            max: toPercent(yMax as number),
            axisLabel: {
              color: p.textSub,
              fontSize: 10,
              formatter: (v: number) => `${v.toFixed(2)}%`,
            },
            axisLine: { show: false },
            splitLine: { show: false },
            axisPointer: { label: { show: false } },
          }
        : { type: 'value', gridIndex: 0, position: 'right', show: false },
      {
        type: 'value',
        gridIndex: 1,
        axisLabel: { show: false },
        axisLine: { show: false },
        splitLine: { show: false },
        axisPointer: { label: { show: false } },
      },
    ],
    series: [
      {
        name: 'price',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: d.prices,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: p.priceLine, width: 1.2 },
        itemStyle: { color: p.priceLine },
        z: 3,
        markLine: d.prevClose
          ? {
              silent: true,
              symbol: 'none',
              label: { show: false },
              lineStyle: { type: 'dashed', color: p.prevCloseLine, width: 1 },
              data: [{ yAxis: d.prevClose }],
            }
          : undefined,
      },
      {
        name: 'avg',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: d.avgPrices,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: p.avgLine, width: 1 },
        itemStyle: { color: p.avgLine },
        z: 2,
      },
      {
        name: 'volume',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 2,
        data: d.volumes.map((v, i) =>
          v === null ? null : { value: v, itemStyle: { color: d.volumeColors[i] } },
        ),
        barWidth: '60%',
        z: 2,
      },
    ],
  }
}

function pctColor(price: number, prevClose: number | null, p: QuoteChartPalette): string {
  if (prevClose === null || price === prevClose) return p.flat
  return price > prevClose ? p.up : p.down
}

// ============================================================
// 日 K（固定前复权）
// 一次拉 count（默认 250）根，首屏展示最近约 120 根，
// 缩放/平移在本地 dataZoom 上做，不翻页请求（对接文档 §3.6）
// ============================================================

export const KLINE_VISIBLE_BARS = 120

export interface KlineSeriesData {
  dates: string[]
  /** ECharts candlestick 数据格式 [open, close, low, high] */
  candle: Array<[number, number, number, number]>
  /** 与 bars 下标对齐，null 透传（ECharts line 自动断线） */
  maLines: Array<{ name: string; color: string; data: Array<number | null> }>
  volumes: Array<{ value: number; itemStyle: { color: string } } | null>
  /** 首屏可视起点（bars 下标） */
  zoomStart: number
}

export function buildKlineSeriesData(kline: QuoteKlineVO, isDark: boolean): KlineSeriesData {
  const p = getChartPalette(isDark)
  const bars = kline.bars
  return {
    dates: bars.map((b) => b.date),
    candle: bars.map((b) => [b.open, b.close, b.low, b.high] as [number, number, number, number]),
    maLines: [
      { name: 'MA5', color: MA_COLORS.ma5, data: kline.ma.ma5 },
      { name: 'MA10', color: MA_COLORS.ma10, data: kline.ma.ma10 },
      { name: 'MA20', color: MA_COLORS.ma20, data: kline.ma.ma20 },
      { name: 'MA60', color: MA_COLORS.ma60, data: kline.ma.ma60 },
    ],
    volumes: bars.map((b) =>
      b.volume === null
        ? null
        : { value: b.volume, itemStyle: { color: b.close >= b.open ? p.up : p.down } },
    ),
    zoomStart: Math.max(0, bars.length - KLINE_VISIBLE_BARS),
  }
}

export function buildKlineOption(kline: QuoteKlineVO, isDark: boolean): EChartsCoreOption {
  const p = getChartPalette(isDark)
  const d = buildKlineSeriesData(kline, isDark)
  const quote = currencySymbol(kline.currency)

  const baseXAxis = {
    type: 'category' as const,
    data: d.dates,
    boundaryGap: true,
    axisLine: { lineStyle: { color: p.axisLine } },
    axisTick: { show: false },
    splitLine: { show: false },
  }

  return {
    animation: false,
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'cross' },
      position(
        point: [number, number],
        _params: unknown,
        _dom: unknown,
        _rect: unknown,
        size: { contentSize: [number, number]; viewSize: [number, number] },
      ) {
        const left = Math.min(
          Math.max(point[0] - size.contentSize[0] / 2, 8),
          size.viewSize[0] - size.contentSize[0] - 8,
        )
        return { left, top: 4 }
      },
      formatter: (params: unknown) => {
        const list = params as Array<{ dataIndex?: number }>
        const idx = list?.[0]?.dataIndex
        if (idx === undefined || idx === null || !kline.bars[idx]) return ''
        const b = kline.bars[idx]
        const up = b.close >= b.open
        const color = up ? p.up : p.down
        const row = (label: string, value: string, c?: string) =>
          `<div style="margin-top:2px">${label} <span style="float:right;margin-left:16px;${
            c ? `color:${c}` : ''
          }">${value}</span></div>`
        const maRows = d.maLines
          .map(
            (m) =>
              row(m.name, m.data[idx] === null ? '—' : `${(m.data[idx] as number).toFixed(2)}`, m.color),
          )
          .join('')
        return (
          `<div style="font-weight:600;margin-bottom:2px">${b.date}</div>` +
          row('开', `${quote}${formatPrice(b.open, kline.market)}`) +
          row('高', `${quote}${formatPrice(b.high, kline.market)}`) +
          row('低', `${quote}${formatPrice(b.low, kline.market)}`) +
          row('收', `${quote}${formatPrice(b.close, kline.market)}`, color) +
          row('涨跌幅', formatPercent(b.changePercent), color) +
          row('成交量', b.volume === null ? '—' : `${formatBigNumber(b.volume)}股`) +
          row('成交额', b.turnover === null ? '—' : `${quote}${formatBigNumber(b.turnover)}`) +
          maRows
        )
      },
    },
    grid: [
      { left: 8, right: 8, top: 30, height: '58%', containLabel: true },
      { left: 8, right: 8, top: '76%', height: '14%', containLabel: true },
    ],
    xAxis: [
      {
        ...baseXAxis,
        gridIndex: 0,
        axisLabel: { show: false },
      },
      {
        ...baseXAxis,
        gridIndex: 1,
        axisLabel: {
          show: true,
          color: p.textSub,
          fontSize: 10,
          // 刻度数量随数据量自适应，保持约 5 个标签
          interval: Math.max(0, Math.floor(d.dates.length / 5) - 1),
        },
      },
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 0,
        position: 'left',
        scale: true,
        axisLabel: { show: true, color: p.textSub, fontSize: 10 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: p.splitLine } },
        axisPointer: { label: { show: false } },
      },
      {
        type: 'value',
        gridIndex: 1,
        axisLabel: { show: false },
        axisLine: { show: false },
        splitLine: { show: false },
        axisPointer: { label: { show: false } },
      },
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        startValue: d.zoomStart,
        end: 100,
        throttle: 20,
      },
      {
        type: 'slider',
        xAxisIndex: [0, 1],
        startValue: d.zoomStart,
        end: 100,
        height: 16,
        bottom: 4,
        borderColor: 'transparent',
        fillerColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(55,53,47,0.06)',
        handleStyle: { color: p.axisLine },
        textStyle: { color: p.textSub, fontSize: 10 },
      },
    ],
    series: [
      {
        name: 'kline',
        type: 'candlestick',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: d.candle,
        itemStyle: {
          color: p.up,
          color0: p.down,
          borderColor: p.up,
          borderColor0: p.down,
        },
        z: 3,
      },
      ...d.maLines.map((m) => ({
        name: m.name,
        type: 'line' as const,
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: m.data,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: m.color, width: 1 },
        itemStyle: { color: m.color },
        z: 2,
      })),
      {
        name: 'volume',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: d.volumes,
        barWidth: '60%',
        z: 2,
      },
    ],
  }
}
