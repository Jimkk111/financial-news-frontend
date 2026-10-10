import { defineStore } from 'pinia'
import { getStockList, getIndices } from '@/api/quote'
import type { QuoteMarket, QuoteSnapshotVO } from '@/types/quote'
import { errorMessage } from '@/utils/toast'

// ============================================================
// 行情 Tab 页数据 store（docs/quote-frontend-design.md §4.2）
//
// - 市场级缓存：首次进入某市场才请求；切回已加载市场不重新请求（PRD 4.1），
//   新鲜度由视图层轮询负责
// - 分段失败隔离：indices / stocks 各自持有 error，互不影响；
//   任一失败只置对应 error 字段，另一段正常渲染
// - 详情页数据不进 store（页面级状态，离开即弃）
// ============================================================

const LAST_MARKET_KEY = 'quote.lastMarket'
const MARKETS: QuoteMarket[] = ['CN', 'HK', 'US']

function readLastMarket(): QuoteMarket {
  try {
    const stored = localStorage.getItem(LAST_MARKET_KEY) as QuoteMarket | null
    if (stored && MARKETS.includes(stored)) return stored
  } catch {
    /* localStorage 不可用时用默认值 */
  }
  return 'CN'
}

export interface MarketCache {
  indices: QuoteSnapshotVO[]
  stocks: QuoteSnapshotVO[]
  page: number
  pageSize: number
  total: number
  requestedPage: number
  stocksLoading: boolean
  indicesDelayed: boolean
  stocksDelayed: boolean
  delayed: boolean
  fetchedAt: number
  indicesError: string | null
  stocksError: string | null
}

export type QuoteSegment = 'indices' | 'stocks'

function createMarketCache(): MarketCache {
  return {
    indices: [], stocks: [], page: 1, pageSize: 50, total: 0, requestedPage: 1,
    stocksLoading: false, indicesDelayed: false, stocksDelayed: false, delayed: false,
    fetchedAt: 0, indicesError: null, stocksError: null,
  }
}

export const useQuoteStore = defineStore('quote', {
  state: () => ({
    lastMarket: readLastMarket(),
    marketCache: {} as Partial<Record<QuoteMarket, MarketCache>>,
    stockRequestIds: {} as Partial<Record<QuoteMarket, number>>,
  }),

  getters: {
    /** 某市场是否处于可轮询状态（首个指数快照为 OPEN） */
    marketIsOpen(state) {
      return (market: QuoteMarket) =>
        state.marketCache[market]?.indices.some((it) => it.tradeStatus === 'OPEN') ?? false
    },
  },

  actions: {
    setLastMarket(market: QuoteMarket) {
      this.lastMarket = market
      try {
        localStorage.setItem(LAST_MARKET_KEY, market)
      } catch {
        /* 忽略持久化失败 */
      }
    },

    hasCache(market: QuoteMarket): boolean {
      return !!this.marketCache[market]?.fetchedAt
    },

    /** 已缓存直接返回（不判新鲜度，轮询负责）；未缓存拉取 */
    async ensureMarket(market: QuoteMarket): Promise<void> {
      if (this.marketCache[market]) return
      await this.refreshMarket(market)
    },

    /** 指数和当前股票页独立刷新；翻页中不重复请求股票 */
    async refreshMarket(market: QuoteMarket): Promise<void> {
      this.marketCache[market] ??= createMarketCache()
      const cache = this.marketCache[market]!
      await Promise.all([
        this.refreshSegment(market, 'indices'),
        cache.stocksLoading ? Promise.resolve() : this.refreshStocks(market),
      ])
      cache.fetchedAt = Date.now()
    },

    /** 仅最新请求可以更新该市场，避免较慢的旧页响应覆盖新页 */
    async refreshStocks(market: QuoteMarket, page?: number): Promise<void> {
      this.marketCache[market] ??= createMarketCache()
      const cache = this.marketCache[market]!
      const targetPage = page ?? cache.requestedPage
      const requestId = (this.stockRequestIds[market] ?? 0) + 1
      this.stockRequestIds[market] = requestId
      cache.requestedPage = targetPage
      cache.stocksLoading = true
      cache.stocksError = null
      try {
        const res = await getStockList(market, targetPage, cache.pageSize)
        if (this.stockRequestIds[market] !== requestId) return
        cache.stocks = res.stocks
        cache.page = res.page
        cache.requestedPage = res.page
        cache.pageSize = res.pageSize
        cache.total = res.total
        cache.stocksDelayed = res.delayed
        cache.delayed = cache.indicesDelayed || cache.stocksDelayed
      } catch (e) {
        if (this.stockRequestIds[market] !== requestId) return
        cache.stocksError = errorMessage(e, '股票列表加载失败')
      } finally {
        if (this.stockRequestIds[market] === requestId) cache.stocksLoading = false
      }
    },

    /** 单分段重试（E7：重试只重发该段请求） */
    async refreshSegment(market: QuoteMarket, segment: QuoteSegment): Promise<void> {
      const cache = this.marketCache[market]
      if (!cache) return
      if (segment === 'stocks') {
        await this.refreshStocks(market)
        return
      }
      try {
        const res = await getIndices(market)
        cache.indices = res.indices
        cache.indicesDelayed = res.delayed
        cache.delayed = cache.indicesDelayed || cache.stocksDelayed
        cache.indicesError = null
      } catch (e) {
        cache.indicesError = errorMessage(e, '指数数据加载失败')
      }
    },
  },
})
