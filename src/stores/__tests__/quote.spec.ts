import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/api/request'
import type { IndexListVO, HotListVO, QuoteSnapshotVO } from '@/types/quote'

vi.mock('@/api/quote', () => ({
  getIndices: vi.fn(),
  getHotList: vi.fn(),
}))

vi.mock('@/utils/toast', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
  errorMessage: vi.fn((_e: unknown, fallback: string) => fallback),
}))

import { getIndices, getHotList } from '@/api/quote'
import { useQuoteStore } from '../quote'

const getIndicesMock = vi.mocked(getIndices)
const getHotListMock = vi.mocked(getHotList)

function makeSnapshot(overrides: Partial<QuoteSnapshotVO> = {}): QuoteSnapshotVO {
  return {
    secType: 'index',
    symbol: '000001.SH',
    name: '上证指数',
    market: 'CN',
    currency: 'CNY',
    tradeStatus: 'CLOSED',
    dataDate: '2026-09-30',
    dataTime: '15:00:03',
    delayed: false,
    latestPrice: 3842.19,
    changeAmount: 11.74,
    changePercent: 0.31,
    open: 3839.25,
    prevClose: 3830.45,
    high: 3851.22,
    low: 3833.09,
    volume: 41456024700,
    turnover: 679398992444.8,
    ...overrides,
  }
}

function makeIndices(overrides: Partial<IndexListVO> = {}): IndexListVO {
  return { market: 'CN', delayed: false, indices: [makeSnapshot()], ...overrides }
}

function makeHot(overrides: Partial<HotListVO> = {}): HotListVO {
  return {
    market: 'CN',
    delayed: false,
    stocks: [makeSnapshot({ secType: 'stock', symbol: '600519.SH', name: '贵州茅台' })],
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
})

describe('ensureMarket 缓存', () => {
  it('首次进入拉取 indices + hot（并行两个请求）', async () => {
    getIndicesMock.mockResolvedValue(makeIndices())
    getHotListMock.mockResolvedValue(makeHot())
    const store = useQuoteStore()

    await store.ensureMarket('CN')

    expect(getIndicesMock).toHaveBeenCalledTimes(1)
    expect(getHotListMock).toHaveBeenCalledTimes(1)
    expect(store.marketCache.CN?.indices).toHaveLength(1)
    expect(store.marketCache.CN?.hot).toHaveLength(1)
    expect(store.hasCache('CN')).toBe(true)
  })

  it('切回已加载市场不重新请求（PRD 4.1），ensureMarket 直接命中缓存', async () => {
    getIndicesMock.mockResolvedValue(makeIndices())
    getHotListMock.mockResolvedValue(makeHot())
    const store = useQuoteStore()

    await store.ensureMarket('CN')
    await store.ensureMarket('CN')

    expect(getIndicesMock).toHaveBeenCalledTimes(1)
    expect(getHotListMock).toHaveBeenCalledTimes(1)
  })
})

describe('分段失败隔离（PRD E7）', () => {
  it('indices 失败不影响 hot 正常渲染，且保留上一份成功数据', async () => {
    getIndicesMock.mockResolvedValue(makeIndices())
    getHotListMock.mockResolvedValue(makeHot())
    const store = useQuoteStore()
    await store.ensureMarket('CN')

    // 轮询时 indices 挂了
    getIndicesMock.mockRejectedValue(new ApiError('QUOTE_UPSTREAM_FAILED', '上游不可用'))
    await store.refreshMarket('CN')

    const cache = store.marketCache.CN!
    expect(cache.indicesError).toBe('指数数据加载失败')
    expect(cache.hotError).toBeNull()
    expect(cache.indices).toHaveLength(1) // 上一份成功数据仍在
    expect(cache.hot).toHaveLength(1)
  })

  it('分段重试只重发该段请求', async () => {
    getIndicesMock.mockRejectedValue(new ApiError('QUOTE_UPSTREAM_FAILED', '上游不可用'))
    getHotListMock.mockResolvedValue(makeHot())
    const store = useQuoteStore()
    await store.ensureMarket('CN')
    expect(store.marketCache.CN?.indicesError).not.toBeNull()

    getIndicesMock.mockResolvedValue(makeIndices())
    await store.refreshSegment('CN', 'indices')

    expect(store.marketCache.CN?.indicesError).toBeNull()
    expect(store.marketCache.CN?.indices).toHaveLength(1)
    // refreshSegment 只打 indices
    expect(getIndicesMock).toHaveBeenCalledTimes(2)
    expect(getHotListMock).toHaveBeenCalledTimes(1)
  })
})

describe('lastMarket 记忆', () => {
  it('setLastMarket 持久化到 localStorage（quote.lastMarket）', () => {
    const store = useQuoteStore()
    store.setLastMarket('US')
    expect(store.lastMarket).toBe('US')
    expect(localStorage.getItem('quote.lastMarket')).toBe('US')
  })

  it('localStorage 非法值回退 CN', () => {
    localStorage.setItem('quote.lastMarket', 'XX')
    const store = useQuoteStore()
    expect(store.lastMarket).toBe('CN')
  })
})

describe('marketIsOpen 轮询门', () => {
  it('首个指数 OPEN 才允许轮询', async () => {
    getIndicesMock.mockResolvedValue(makeIndices({ indices: [makeSnapshot({ tradeStatus: 'CLOSED' })] }))
    getHotListMock.mockResolvedValue(makeHot())
    const store = useQuoteStore()

    await store.ensureMarket('CN')
    expect(store.marketIsOpen('CN')).toBe(false)

    getIndicesMock.mockResolvedValue(makeIndices({ indices: [makeSnapshot({ tradeStatus: 'OPEN' })] }))
    await store.refreshMarket('CN')
    expect(store.marketIsOpen('CN')).toBe(true)
  })
})
