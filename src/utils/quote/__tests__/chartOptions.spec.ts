import { describe, expect, it } from 'vitest'
import type { QuoteKlineVO, QuoteTrendVO, TrendPointVO } from '@/types/quote'
import {
  buildKlineOption,
  buildKlineSeriesData,
  buildTrendOption,
  buildTrendSeriesData,
  KLINE_VISIBLE_BARS,
} from '../chartOptions'

// ---------- 分时 ----------

function makeTrend(overrides: Partial<QuoteTrendVO> = {}): QuoteTrendVO {
  return {
    secType: 'stock',
    symbol: '600519.SH',
    name: '贵州茅台',
    market: 'CN',
    currency: 'CNY',
    tradeStatus: 'CLOSED',
    dataDate: '2026-09-30',
    dataTime: '15:00:03',
    delayed: false,
    prevClose: 100,
    timelineMinutes: 240,
    points: [],
    ...overrides,
  }
}

function cnPoints(): TrendPointVO[] {
  // 3 个点：09:30 涨、10:00 续涨、10:01 回落 —— 覆盖红/绿/回填逻辑
  return [
    { minute: 0, time: '09:30', price: 101, avgPrice: 101, volume: 1000 },
    { minute: 30, time: '10:00', price: 102, avgPrice: 101.5, volume: 800 },
    { minute: 31, time: '10:01', price: 101.5, avgPrice: 101.4, volume: 600 },
  ]
}

describe('buildTrendSeriesData', () => {
  it('按 minute 回填全轴（timelineMinutes + 1），未到的分钟保持 null', () => {
    const data = buildTrendSeriesData(makeTrend({ points: cnPoints() }))
    expect(data.prices).toHaveLength(241)
    expect(data.prices[0]).toBe(101)
    expect(data.prices[30]).toBe(102)
    expect(data.prices[31]).toBe(101.5)
    expect(data.prices[32]).toBeNull()
    expect(data.prices[240]).toBeNull()
    expect(data.times[0]).toBe('09:30')
    expect(data.times[32]).toBeNull()
  })

  it('越界 minute 丢弃，不打乱轴结构', () => {
    const data = buildTrendSeriesData(
      makeTrend({ points: [{ minute: 999, time: '99:99', price: 1, avgPrice: 1, volume: 1 }] }),
    )
    expect(data.prices).toHaveLength(241)
    expect(data.prices.every((v) => v === null)).toBe(true)
  })

  it('量柱红绿：与前一点比，首点与昨收比；回落转绿', () => {
    const data = buildTrendSeriesData(makeTrend({ points: cnPoints() }))
    expect(data.volumeColors[0]).toContain('#d92e2e') // 101 > 昨收 100 → 红
    expect(data.volumeColors[30]).toContain('#d92e2e') // 102 > 101 → 红
    expect(data.volumeColors[31]).toContain('#0f7b52') // 101.5 < 102 → 绿
  })

  it('CN 常量轴刻度（09:30 / 11:30/13:00 / 15:00）', () => {
    const data = buildTrendSeriesData(makeTrend())
    expect(data.axisLabels).toEqual([
      { minute: 0, label: '09:30' },
      { minute: 120, label: '11:30/13:00' },
      { minute: 240, label: '15:00' },
    ])
  })

  it('US 动态轴刻度：只用数据点携带的 time，禁止由 minute 反推（对接文档 §3.5）', () => {
    const data = buildTrendSeriesData(
      makeTrend({
        market: 'US',
        timelineMinutes: 390,
        prevClose: 200,
        points: [
          { minute: 0, time: '21:30', price: 201, avgPrice: 201, volume: 100 },
          { minute: 20, time: '21:50', price: 200.5, avgPrice: 200.8, volume: 90 },
        ],
      }),
    )
    // 候选位 130/260 无数据 → 跳过；只保留有 time 的边界
    expect(data.axisLabels).toEqual([
      { minute: 0, label: '21:30' },
      { minute: 20, label: '21:50' },
    ])
  })

  it('US 常量表未配置时也不该命中 CN/HK 常量（timelineMinutes 不匹配走动态）', () => {
    // CN 时段若与常量 240 不符（防御），同样走动态取数据 time
    const data = buildTrendSeriesData(
      makeTrend({
        timelineMinutes: 100,
        points: [{ minute: 0, time: '09:30', price: 10, avgPrice: 10, volume: 1 }],
      }),
    )
    expect(data.axisLabels).toEqual([{ minute: 0, label: '09:30' }])
  })
})

describe('buildTrendOption', () => {
  it('结构：双 grid、3 条 series、量价 axisPointer 联动', () => {
    const option = buildTrendOption(makeTrend({ points: cnPoints() }), false) as Record<
      string,
      unknown
    >
    expect((option.grid as unknown[]).length).toBe(2)
    expect((option.series as unknown[]).length).toBe(3)
    expect((option.xAxis as unknown[]).length).toBe(2)
    expect(option.axisPointer).toEqual({ link: [{ xAxisIndex: 'all' }] })
  })

  it('昨收存在时右轴为涨跌幅且与左轴同区间映射；markLine 画昨收基准线', () => {
    const option = buildTrendOption(makeTrend({ points: cnPoints(), prevClose: 100 }), false) as Record<
      string,
      unknown
    >
    const yAxes = option.yAxis as Array<Record<string, unknown>>
    const priceAxis = yAxes[0]
    const pctAxis = yAxes[1]
    // 左轴区间上下留白 8% 后，右轴 = (v - prevClose) / prevClose * 100
    const yMin = priceAxis.min as number
    const yMax = priceAxis.max as number
    expect(pctAxis.min).toBeCloseTo(((yMin - 100) / 100) * 100, 6)
    expect(pctAxis.max).toBeCloseTo(((yMax - 100) / 100) * 100, 6)

    const priceSeries = (option.series as Array<Record<string, unknown>>)[0]
    const markLine = priceSeries.markLine as Record<string, unknown>
    expect((markLine.data as Array<{ yAxis: number }>)[0].yAxis).toBe(100)
  })

  it('昨收缺失（美股备源降级）时右轴隐藏、无 markLine，页面不报错', () => {
    const option = buildTrendOption(
      makeTrend({
        market: 'US',
        timelineMinutes: 390,
        prevClose: null,
        points: [{ minute: 0, time: '21:30', price: 201, avgPrice: 201, volume: 1 }],
      }),
      false,
    ) as Record<string, unknown>
    const yAxes = option.yAxis as Array<Record<string, unknown>>
    expect(yAxes[1].show).toBe(false)
    const priceSeries = (option.series as Array<Record<string, unknown>>)[0]
    expect(priceSeries.markLine).toBeUndefined()
  })

  it('无价格点时：有昨收则轴围绕昨收展示，无昨收（退市/降级）交给自动', () => {
    const withPrev = buildTrendOption(makeTrend({ points: [] }), false) as Record<string, unknown>
    const axisWithPrev = (withPrev.yAxis as Array<Record<string, unknown>>)[0]
    // lo = hi = 100，pad = max(0, 100*0.002) = 0.2
    expect(axisWithPrev.min).toBe(99.8)
    expect(axisWithPrev.max).toBe(100.2)

    const noPrev = buildTrendOption(
      makeTrend({ points: [], prevClose: null }),
      false,
    ) as Record<string, unknown>
    const axisNoPrev = (noPrev.yAxis as Array<Record<string, unknown>>)[0]
    expect(axisNoPrev.min).toBeUndefined()
    expect(axisNoPrev.max).toBeUndefined()
  })
})

// ---------- 日 K ----------

function makeKline(count: number): QuoteKlineVO {
  const bars = Array.from({ length: count }, (_, i) => {
    const open = 10 + i * 0.1
    // 偶数阳线（close > open）、奇数阴线（close < open），覆盖量柱红绿两色
    const close = i % 2 === 0 ? open + 0.3 : open - 0.3
    return {
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      open,
      high: Math.max(open, close) + 0.1,
      low: Math.min(open, close) - 0.1,
      close,
      volume: 1000 + i,
      turnover: 10000 + i,
      changePercent: 0.5,
    }
  })
  return {
    secType: 'stock',
    symbol: '600519.SH',
    name: '贵州茅台',
    market: 'CN',
    currency: 'CNY',
    tradeStatus: 'CLOSED',
    dataDate: '2026-09-30',
    dataTime: '15:00:00',
    delayed: false,
    fq: 'qfq',
    bars,
    ma: {
      // 首部 3 根历史不足 → null，应原样透传（E5 新股 MA 缺线不报错）
      ma5: bars.map((_, i) => (i < 3 ? null : 10 + i * 0.1)),
      ma10: bars.map(() => null),
      ma20: bars.map((_, i) => 10.2 + i * 0.1),
      ma60: bars.map(() => null),
    },
  }
}

describe('buildKlineSeriesData', () => {
  it('candlestick 数据格式为 [open, close, low, high]', () => {
    const data = buildKlineSeriesData(makeKline(5), false)
    expect(data.candle[0]).toEqual([10, 10.3, 9.9, 10.4])
    expect(data.dates).toHaveLength(5)
  })

  it('MA 数组与 bars 下标一一对齐，null 原样透传', () => {
    const data = buildKlineSeriesData(makeKline(10), false)
    expect(data.maLines).toHaveLength(4)
    expect(data.maLines[0].data[0]).toBeNull()
    expect(data.maLines[0].data[3]).toBe(10.3)
    expect(data.maLines[1].data.every((v) => v === null)).toBe(true)
  })

  it('首屏可视起点 = bars.length - 120（250 根 → 130）', () => {
    expect(buildKlineSeriesData(makeKline(250), false).zoomStart).toBe(130)
    expect(buildKlineSeriesData(makeKline(50), false).zoomStart).toBe(0)
    expect(KLINE_VISIBLE_BARS).toBe(120)
  })

  it('量柱红绿按 close >= open', () => {
    const data = buildKlineSeriesData(makeKline(4), false)
    expect(data.volumes[0]?.itemStyle.color).toContain('#d92e2e') // i=0 阳线 → 红
    expect(data.volumes[1]?.itemStyle.color).toContain('#0f7b52') // i=1 阴线 → 绿
  })
})

describe('buildKlineOption', () => {
  it('结构：双 grid、inside+slider dataZoom、首屏从 120 根前开始', () => {
    const option = buildKlineOption(makeKline(250), false) as Record<string, unknown>
    expect((option.grid as unknown[]).length).toBe(2)
    const zooms = option.dataZoom as Array<Record<string, unknown>>
    expect(zooms).toHaveLength(2)
    expect(zooms.map((z) => z.type)).toEqual(['inside', 'slider'])
    expect(zooms[0].startValue).toBe(130)
    expect(zooms[0].end).toBe(100)
  })

  it('series：蜡烛 + 4 条 MA + 量柱；MA 透传 null', () => {
    const option = buildKlineOption(makeKline(250), false) as Record<string, unknown>
    const series = option.series as Array<Record<string, unknown>>
    expect(series).toHaveLength(6)
    expect(series[0].type).toBe('candlestick')
    expect(series.slice(1, 5).every((s) => s.type === 'line')).toBe(true)
    expect(series[1].data).toHaveLength(250)
    expect((series[1].data as Array<number | null>).filter((v) => v === null)).toHaveLength(3)
    expect(series[5].type).toBe('bar')
  })

  it('暗色主题色板切换（up/down 色值随 isDark）', () => {
    const light = buildKlineOption(makeKline(10), false) as Record<string, unknown>
    const dark = buildKlineOption(makeKline(10), true) as Record<string, unknown>
    const lightStyle = ((light.series as Array<Record<string, unknown>>)[0].itemStyle ?? {}) as Record<
      string,
      string
    >
    const darkStyle = ((dark.series as Array<Record<string, unknown>>)[0].itemStyle ?? {}) as Record<
      string,
      string
    >
    expect(lightStyle.color).not.toBe(darkStyle.color)
  })
})
