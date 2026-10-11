import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, postStream } from '../request'

const clearAuth = vi.hoisted(() => vi.fn())
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ clearAuth }) }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('postStream 公共传输', () => {
  it('携带 Cookie、JSON 请求体和取消信号', async () => {
    const response = new Response('', { headers: { 'Content-Type': 'text/event-stream' } })
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    expect(await postStream('/events', { question: '你好' }, controller.signal)).toBe(response)
    expect(fetchMock).toHaveBeenCalledWith('/api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ question: '你好' }), signal: controller.signal,
    })
  })

  it('401 清除登录态并保留服务端错误消息', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ msg: '登录失效' }), { status: 401 })))
    await expect(postStream('/events', {})).rejects.toMatchObject({ code: '401', message: '登录失效' })
    await vi.waitFor(() => expect(clearAuth).toHaveBeenCalledOnce())
  })

  it('兼容旧错误结构以及无法解析的 HTTP 错误', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: '服务繁忙' } }), { status: 503 }))
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 })))
    await expect(postStream('/events', {})).rejects.toMatchObject({ code: '503', message: '服务繁忙' })
    await expect(postStream('/events', {})).rejects.toMatchObject({ code: '502', message: '请求失败（502）' })
  })

  it('拒绝非 SSE 的成功响应', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } })))
    await expect(postStream('/events', {})).rejects.toBeInstanceOf(ApiError)
  })
})
