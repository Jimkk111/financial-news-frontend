import { afterEach, describe, expect, it, vi } from 'vitest'
import request from '../request'
import { getStockList } from '../quote'

const originalAdapter = request.defaults.adapter

afterEach(() => {
  request.defaults.adapter = originalAdapter
})

describe('getStockList', () => {
  it.each(['CN', 'HK', 'US'] as const)('请求 %s 的分页股票接口并解包响应', async (market) => {
    const data = { market, delayed: false, stocks: [], page: 2, pageSize: 50, total: 100 }
    const adapter = vi.fn(async (config) => ({
      data: { code: '200', msg: 'success', data },
      status: 200, statusText: 'OK', headers: {}, config,
    }))
    request.defaults.adapter = adapter
    expect(await getStockList(market, 2)).toEqual(data)
    expect(adapter.mock.calls[0]![0]).toMatchObject({
      method: 'get', baseURL: '/api', url: '/quotes/stocks', params: { market, page: 2, pageSize: 50 },
    })
  })

  it('省略分页参数时使用第 1 页、每页 50 只', async () => {
    const adapter = vi.fn(async (config) => ({
      data: { code: '200', data: { market: 'CN', stocks: [], page: 1, pageSize: 50, total: 0, delayed: false } },
      status: 200, statusText: 'OK', headers: {}, config,
    }))
    request.defaults.adapter = adapter
    await getStockList('CN')
    expect(adapter.mock.calls[0]![0].params).toEqual({ market: 'CN', page: 1, pageSize: 50 })
  })
})
