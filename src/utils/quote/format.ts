import type { QuoteCurrency, QuoteMarket } from '@/types/quote'

// ============================================================
// 行情展示格式化（纯函数）
// 规则来源：PRD 5.2 / 对接文档 §2.3、§2.4
// ============================================================

/** 币种符号映射（前端持有，PRD 5.2） */
const CURRENCY_SYMBOLS: Record<QuoteCurrency, string> = {
  CNY: '¥',
  HKD: 'HK$',
  USD: '$',
}

export function currencySymbol(currency: QuoteCurrency): string {
  return CURRENCY_SYMBOLS[currency] ?? ''
}

/**
 * 价格格式化
 * - null → '—'（退市/无成交）
 * - A股/美股固定 2 位小数；港股按数据原样展示（最多 3 位、仙股 4 位，禁止强转 2 位）
 */
export function formatPrice(
  value: number | null | undefined,
  market: QuoteMarket,
): string {
  if (value === null || value === undefined) return '—'
  if (market === 'HK') return String(value)
  return value.toFixed(2)
}

/** 涨跌幅：带符号 2 位小数 + %；null → '—'。正负号由前端渲染（对接文档 §2.3） */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

/** 涨跌额：带符号 2 位小数；null → '—' */
export function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}`
}

/**
 * 万/亿缩写：≥1e8 → X.XX亿，≥1e4 → X.XX万，否则原值
 * 成交量（股）与成交额（元）共用；调用方自行拼接单位
 */
export function formatBigNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(2)}亿`
  if (Math.abs(value) >= 1e4) return `${(value / 1e4).toFixed(2)}万`
  return String(value)
}

/** 带币种符号的成交额：¥6793.99亿 */
export function formatTurnover(
  value: number | null | undefined,
  currency: QuoteCurrency,
): string {
  if (value === null || value === undefined) return '—'
  return `${currencySymbol(currency)}${formatBigNumber(value)}`
}

/** 市场中文名（搜索结果/详情页徽标） */
export function marketLabel(market: QuoteMarket): string {
  const map: Record<QuoteMarket, string> = { CN: 'A股', HK: '港股', US: '美股' }
  return map[market]
}

/** 标的类型中文名 */
export function secTypeLabel(secType: 'stock' | 'index'): string {
  return secType === 'stock' ? '股票' : '指数'
}

// ============================================================
// tradeStatus → 页面文案（对接文档 §4 状态对照表）
// 未知状态按 CLOSED 处理（向前兼容）
// ============================================================

const TRADE_STATUS_LABELS: Record<string, string> = {
  OPEN: '交易中',
  PRE_OPEN: '未开盘',
  LUNCH_BREAK: '午间休市',
  CLOSED: '已收盘',
  HOLIDAY: '休市',
  SUSPENDED: '停牌',
  DELISTED: '已退市',
}

export function tradeStatusLabel(status: string): string {
  return TRADE_STATUS_LABELS[status] ?? '已收盘'
}

/** 非 OPEN 状态必须在报价区展示数据日期（对接文档 §4 通用规则） */
export function shouldShowDataDate(status: string): boolean {
  const normalized = TRADE_STATUS_LABELS[status] ? status : 'CLOSED'
  return normalized !== 'OPEN'
}
