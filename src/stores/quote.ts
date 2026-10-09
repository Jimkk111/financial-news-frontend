import { defineStore } from 'pinia'
import { getHotList, getIndices } from '@/api/quote'
import type { QuoteMarket, QuoteSnapshotVO } from '@/types/quote'
import { errorMessage } from '@/utils/toast'

// ============================================================
// 行情 Tab 页数据 store（docs/quote-frontend-design.md §4.2）
//
// - 市场级缓存：首次进入某市场才请求；切回已加载市场不重新请求（PRD 4.1），
//   新鲜度由视图层轮询负责
// - 分段失败隔离（PRD E7）：indices / hot 各自持有 error，互不影响；
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
  hot: QuoteSnapshotVO[]
  delayed: boolean
  fetchedAt: number
  indicesError: string | null
  hotError: string | null
}

export type QuoteSegment = 'indices' | 'hot'

export const useQuoteStore = defineStore('quote', {
  state: () => ({
    lastMarket: readLastMarket(),
    marketCache: {} as Partial<Record<QuoteMarket, MarketCache>>,
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
      return !!this.marketCache[market]
    },

    /** 已缓存直接返回（不判新鲜度，轮询负责）；未缓存拉取 */
    async ensureMarket(market: QuoteMarket): Promise<void> {
      if (this.marketCache[market]) return
      await this.refreshMarket(market)
    },

    /** indices + hot 并行拉取；分段独立捕获错误（Promise.allSettled 语义） */
    async refreshMarket(market: QuoteMarket): Promise<void> {
      const prev = this.marketCache[market]
      const [indicesRes, hotRes] = await Promise.allSettled([
        getIndices(market),
        getHotList(market),
      ])

      const indices =
        indicesRes.status === 'fulfilled'
          ? indicesRes.value.indices
          : (prev?.indices ?? [])
      const hot =
        hotRes.status === 'fulfilled' ? hotRes.value.stocks : (prev?.hot ?? [])
      const delayed =
        (indicesRes.status === 'fulfilled' ? indicesRes.value.delayed : false) ||
        (hotRes.status === 'fulfilled' ? hotRes.value.delayed : false) ||
        (prev?.delayed ?? false)

      this.marketCache[market] = {
        indices,
        hot,
        delayed,
        fetchedAt: Date.now(),
        indicesError:
          indicesRes.status === 'fulfilled'
            ? null
            : errorMessage(indicesRes.reason, '指数数据加载失败'),
        hotError:
          hotRes.status === 'fulfilled' ? null : errorMessage(hotRes.reason, '热门数据加载失败'),
      }
    },

    /** 单分段重试（E7：重试只重发该段请求） */
    async refreshSegment(market: QuoteMarket, segment: QuoteSegment): Promise<void> {
      const cache = this.marketCache[market]
      if (!cache) return
      try {
        if (segment === 'indices') {
          const res = await getIndices(market)
          cache.indices = res.indices
          cache.delayed = cache.delayed || res.delayed
          cache.indicesError = null
        } else {
          const res = await getHotList(market)
          cache.hot = res.stocks
          cache.delayed = cache.delayed || res.delayed
          cache.hotError = null
        }
      } catch (e) {
        const field = segment === 'indices' ? 'indicesError' : 'hotError'
        cache[field] = errorMessage(e, '加载失败，请重试')
      }
    },
  },
})
