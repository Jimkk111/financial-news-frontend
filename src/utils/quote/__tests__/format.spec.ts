import { describe, expect, it } from 'vitest'
import {
  currencySymbol,
  formatBigNumber,
  formatChange,
  formatPercent,
  formatPrice,
  formatTurnover,
  marketLabel,
  secTypeLabel,
  shouldShowDataDate,
  tradeStatusLabel,
} from '../format'

describe('formatPrice', () => {
  it('null/undefined 显示 —（退市/无成交）', () => {
    expect(formatPrice(null, 'CN')).toBe('—')
    expect(formatPrice(undefined, 'US')).toBe('—')
  })

  it('A股/美股固定 2 位小数', () => {
    expect(formatPrice(3842.19, 'CN')).toBe('3842.19')
    expect(formatPrice(189.5, 'US')).toBe('189.50')
  })

  it('港股按数据原样展示，不强转 2 位（E6 仙股 3-4 位）', () => {
    expect(formatPrice(107.3, 'HK')).toBe('107.3')
    expect(formatPrice(0.123, 'HK')).toBe('0.123')
    expect(formatPrice(0.0123, 'HK')).toBe('0.0123')
  })
})

describe('formatPercent / formatChange', () => {
  it('涨跌幅带符号 2 位小数', () => {
    expect(formatPercent(0.31)).toBe('+0.31%')
    expect(formatPercent(-1.2)).toBe('-1.20%')
    expect(formatPercent(0)).toBe('0.00%')
    expect(formatPercent(null)).toBe('—')
  })

  it('涨跌额带符号 2 位小数', () => {
    expect(formatChange(11.74)).toBe('+11.74')
    expect(formatChange(-3.05)).toBe('-3.05')
    expect(formatChange(null)).toBe('—')
  })
})

describe('formatBigNumber / formatTurnover', () => {
  it('万/亿缩写', () => {
    expect(formatBigNumber(41456024700)).toBe('414.56亿')
    expect(formatBigNumber(679398992444.8)).toBe('6793.99亿')
    expect(formatBigNumber(123456)).toBe('12.35万')
    expect(formatBigNumber(999)).toBe('999')
    expect(formatBigNumber(null)).toBe('—')
  })

  it('成交额带币种符号', () => {
    expect(formatTurnover(679398992444.8, 'CNY')).toBe('¥6793.99亿')
    expect(formatTurnover(123456789, 'HKD')).toBe('HK$1.23亿')
    expect(formatTurnover(null, 'USD')).toBe('—')
  })
})

describe('币种与徽标', () => {
  it('币种符号映射（对接文档 §2.3）', () => {
    expect(currencySymbol('CNY')).toBe('¥')
    expect(currencySymbol('HKD')).toBe('HK$')
    expect(currencySymbol('USD')).toBe('$')
  })

  it('市场与类型中文名', () => {
    expect(marketLabel('CN')).toBe('A股')
    expect(marketLabel('HK')).toBe('港股')
    expect(marketLabel('US')).toBe('美股')
    expect(secTypeLabel('stock')).toBe('股票')
    expect(secTypeLabel('index')).toBe('指数')
  })
})

describe('tradeStatus 状态映射（对接文档 §4）', () => {
  it('全部已知状态 → 页面文案', () => {
    expect(tradeStatusLabel('OPEN')).toBe('交易中')
    expect(tradeStatusLabel('PRE_OPEN')).toBe('未开盘')
    expect(tradeStatusLabel('LUNCH_BREAK')).toBe('午间休市')
    expect(tradeStatusLabel('CLOSED')).toBe('已收盘')
    expect(tradeStatusLabel('HOLIDAY')).toBe('休市')
    expect(tradeStatusLabel('SUSPENDED')).toBe('停牌')
    expect(tradeStatusLabel('DELISTED')).toBe('已退市')
  })

  it('未知状态按 CLOSED 兜底（向前兼容）', () => {
    expect(tradeStatusLabel('SOMETHING_NEW')).toBe('已收盘')
  })

  it('仅 OPEN 不展示数据日期，其余（含未知）都要展示', () => {
    expect(shouldShowDataDate('OPEN')).toBe(false)
    expect(shouldShowDataDate('CLOSED')).toBe(true)
    expect(shouldShowDataDate('HOLIDAY')).toBe(true)
    expect(shouldShowDataDate('SUSPENDED')).toBe(true)
    expect(shouldShowDataDate('UNKNOWN_FUTURE')).toBe(true)
  })
})
