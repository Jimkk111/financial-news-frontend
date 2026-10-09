import axios from 'axios'
import { get, ApiError } from './request'
import type {
  HotListVO,
  IndexListVO,
  QuoteKlineVO,
  QuoteMarket,
  QuoteSearchVO,
  QuoteSecType,
  QuoteSnapshotVO,
  QuoteTrendVO,
} from '@/types/quote'

// ============================================================
// 行情接口层
// 契约来源：《行情功能前端对接文档》§2.1 / §3
//
// 与其他模块不同：行情的业务错误以「非 200 的 HTTP 状态码」返回
// （400/404/429/502，响应体仍是 {code,msg,data}），而现有响应拦截器
// 只在 HTTP 200 时检查业务码，非 200 直接进 axios error 分支。
// 因此这里用 quoteGet 统一归一化为 ApiError，业务代码只 catch ApiError。
// ============================================================

export async function quoteGet<T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<T> {
  try {
    return await get<T>(url, { params })
  } catch (e) {
    // axios.isAxiosError 收窄类型；带 {code,msg} 响应体的才是行情业务错误
    if (axios.isAxiosError(e) && e.response?.data?.code) {
      const body = e.response.data as { code: string; msg?: string }
      throw new ApiError(body.code, body.msg ?? '行情服务暂不可用')
    }
    throw e
  }
}

export function isRateLimitError(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'RATE_LIMIT_EXCEEDED'
}

// ============================================================
// 接口函数
// ============================================================

/** 指数卡片（按 market；返回顺序即展示顺序，前端不得重排） */
export function getIndices(market: QuoteMarket): Promise<IndexListVO> {
  return quoteGet<IndexListVO>('/quotes/indices', { market })
}

/** 热门标的列表（后端配置名单，约 20 只/市场） */
export function getHotList(market: QuoteMarket, limit = 20): Promise<HotListVO> {
  return quoteGet<HotListVO>('/quotes/hot', { market, limit })
}

/** 三市场混合搜索联想（空关键词/无结果返回 items: []，不报错） */
export function searchQuotes(keyword: string, limit = 10): Promise<QuoteSearchVO> {
  return quoteGet<QuoteSearchVO>('/quotes/search', { keyword, limit })
}

/** 单标的实时快照（详情页报价区）。secType 必须随跳转携带（同号异实红线） */
export function getSnapshot(
  secType: QuoteSecType,
  symbol: string,
): Promise<QuoteSnapshotVO> {
  return quoteGet<QuoteSnapshotVO>(`/quotes/${secType}/${symbol}/snapshot`)
}

/** 当日分时（休市返回最近交易日全天；退市返回空 points） */
export function getTrend(
  secType: QuoteSecType,
  symbol: string,
): Promise<QuoteTrendVO> {
  return quoteGet<QuoteTrendVO>(`/quotes/${secType}/${symbol}/trend`)
}

/** 日 K（固定前复权；count 20–500，缺省 250） */
export function getKline(
  secType: QuoteSecType,
  symbol: string,
  count = 250,
): Promise<QuoteKlineVO> {
  return quoteGet<QuoteKlineVO>(`/quotes/${secType}/${symbol}/kline`, { count })
}
