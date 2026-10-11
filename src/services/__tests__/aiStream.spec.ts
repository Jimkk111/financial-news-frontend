import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/api/ai'
import { ApiError } from '@/api/request'
import { followGeneration, readGenerationRecords, saveGenerationRecord } from '../ai'
import type { GenerationRecord, GenerationSnapshot } from '@/types'

vi.mock('@/api/ai', () => ({
  createGeneration: vi.fn(), getGeneration: vi.fn(), subscribeGeneration: vi.fn(), cancelGeneration: vi.fn(),
  createSession: vi.fn(), getSessions: vi.fn(), getSessionMessages: vi.fn(),
  deleteSession: vi.fn(), updateSessionTitle: vi.fn(), chatCompletion: vi.fn(), healthCheck: vi.fn(),
}))

const base: GenerationSnapshot = { generationId: 'g1', sessionId: 's1', messageId: 123,
  status: 'running', lastSeq: 0, content: '', reasoning: '', sources: [], errorCode: null }
const snapshot = (overrides: Partial<GenerationSnapshot> = {}) => ({ ...base, sources: [], ...overrides })
const record = (existing = false): GenerationRecord => ({
  key: 'stable-key', request: { messages: [{ role: 'user', content: '问题' }], webSearch: false },
  userMessageId: 'u1', assistantMessageId: 'a1', createdAt: new Date().toISOString(),
  cancelPending: false, connection: 'creating', ...(existing ? { snapshot: snapshot() } : {}),
})

function sse(chunks: string[], signal?: AbortSignal, stayOpen = false) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)))
    if (!stayOpen) controller.close()
    else signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')))
  } })
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
}
const event = (type: string, seq: number, data = {}) =>
  'id: ' + seq + '\nevent: ' + type + '\ndata: ' + JSON.stringify({ generationId: 'g1', seq, type, ...data }) + '\n\n'
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve() }
const created = { generationId: 'g1', sessionId: 's1', messageId: 123, status: 'queued' as const, lastSeq: 0 }

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  vi.mocked(api.createGeneration).mockResolvedValue(created)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('持久生成任务', () => {
  it('创建明确返回 409 时停止重试并清除待创建记录', async () => {
    vi.useFakeTimers()
    vi.mocked(api.createGeneration).mockRejectedValue(new ApiError('409', '当前会话仍在生成'))
    const onError = vi.fn()
    await followGeneration('owner', record(), { onUpdate: vi.fn(), onError }).promise
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.createGeneration).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
    expect(readGenerationRecords('owner')).toEqual([])
  })

  it('创建前保存请求和幂等键，完成后采用最终快照', async () => {
    const task = record()
    vi.mocked(api.createGeneration).mockImplementation(async (request, key) => {
      expect(readGenerationRecords('owner')[0]).toMatchObject({ key, request })
      return created
    })
    vi.mocked(api.getGeneration).mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ status: 'completed', lastSeq: 2, content: '最终答' }))
    vi.mocked(api.subscribeGeneration).mockResolvedValue(sse([event('delta', 1, { content: '答' }), event('completed', 2)]))
    const updates: GenerationRecord[] = []
    const handle = followGeneration('owner', task, { onUpdate: r => updates.push(JSON.parse(JSON.stringify(r))), onError: vi.fn() })
    expect(await handle.promise).toMatchObject({ status: 'completed', content: '最终答', lastSeq: 2 })
    expect(api.createGeneration).toHaveBeenCalledOnce()
    expect(api.subscribeGeneration).toHaveBeenCalledWith('g1', 0, expect.any(AbortSignal))
    expect(readGenerationRecords('owner')).toEqual([])
    expect(updates.some(r => r.snapshot?.content === '答')).toBe(true)
  })

  it('创建超时使用原始请求与同一幂等键重试', async () => {
    vi.useFakeTimers()
    const task = record()
    vi.mocked(api.createGeneration).mockRejectedValueOnce(new ApiError('408', '超时')).mockResolvedValue(created)
    vi.mocked(api.getGeneration).mockResolvedValue(snapshot({ status: 'completed', content: '答' }))
    const handle = followGeneration('owner', task, { onUpdate: vi.fn(), onError: vi.fn() })
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    await handle.promise
    const calls = vi.mocked(api.createGeneration).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0]!.slice(0, 2)).toEqual(calls[1]!.slice(0, 2))
    expect(calls[1]![0]).not.toHaveProperty('sessionId')
  })

  it('命名增量按序应用，重复游标忽略，来源与思考链保留', async () => {
    const task = record(true)
    task.snapshot = snapshot({ lastSeq: 1, content: '旧' })
    vi.mocked(api.getGeneration).mockResolvedValueOnce(snapshot({ lastSeq: 1, content: '旧' }))
      .mockResolvedValueOnce(snapshot({ status: 'completed', lastSeq: 5, content: '旧新', reasoning: '思考', sources: [{ url: 'https://a.com', title: '来源' }] }))
    const wire = event('delta', 1, { content: '重复' }) + event('delta', 2, { reasoning: '思考' }) +
      event('delta', 3, { content: '新' }) + event('delta', 4, { sources: [{ url: 'https://a.com', title: '来源' }] }) + event('completed', 5)
    vi.mocked(api.subscribeGeneration).mockResolvedValue(sse([wire.slice(0, 9), wire.slice(9, 55), wire.slice(55)]))
    const updates: GenerationSnapshot[] = []
    const result = await followGeneration('owner', task, { onUpdate: r => {
      if (r.snapshot) updates.push(JSON.parse(JSON.stringify(r.snapshot)))
    }, onError: vi.fn() }).promise
    expect(result?.content).toBe('旧新')
    expect(updates.find(r => r.lastSeq === 4)).toMatchObject({ content: '旧新', reasoning: '思考', sources: [{ title: '来源', url: 'https://a.com' }] })
    expect(api.createGeneration).not.toHaveBeenCalled()
  })

  it('游标缺口不拼接，重取快照并从新游标恢复', async () => {
    vi.mocked(api.getGeneration).mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ content: 'AB', lastSeq: 2 }))
      .mockResolvedValueOnce(snapshot({ content: 'ABC', lastSeq: 4, status: 'completed' }))
    vi.mocked(api.subscribeGeneration).mockResolvedValueOnce(sse([event('delta', 2, { content: '不能追加' })]))
      .mockResolvedValueOnce(sse([event('delta', 3, { content: 'C' }), event('completed', 4)]))
    expect((await followGeneration('owner', record(true), { onUpdate: vi.fn(), onError: vi.fn() }).promise)?.content).toBe('ABC')
    expect(api.subscribeGeneration).toHaveBeenNthCalledWith(2, 'g1', 2, expect.any(AbortSignal))
    expect(api.createGeneration).not.toHaveBeenCalled()
  })

  it('断流只重连 GET 订阅，快照替换部分内容，不重发提问', async () => {
    vi.useFakeTimers()
    vi.mocked(api.getGeneration).mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ content: 'A', lastSeq: 1 }))
      .mockResolvedValueOnce(snapshot({ content: 'AB', lastSeq: 3, status: 'completed' }))
    vi.mocked(api.subscribeGeneration).mockResolvedValueOnce(sse([event('delta', 1, { content: 'A' })]))
      .mockResolvedValueOnce(sse([event('delta', 2, { content: 'B' }), event('completed', 3)]))
    const handle = followGeneration('owner', record(true), { onUpdate: vi.fn(), onError: vi.fn() })
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    expect((await handle.promise)?.content).toBe('AB')
    expect(api.createGeneration).not.toHaveBeenCalled()
    expect(api.cancelGeneration).not.toHaveBeenCalled()
    expect(api.subscribeGeneration).toHaveBeenNthCalledWith(2, 'g1', 1, expect.any(AbortSignal))
  })

  it('无游标 end 关闭订阅并读取终态快照', async () => {
    vi.mocked(api.getGeneration).mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ status: 'cancelled', lastSeq: 2, content: '保留' }))
    vi.mocked(api.subscribeGeneration).mockResolvedValue(sse(['event: end\ndata: {"status":"cancelled","lastSeq":2}\n\n']))
    expect((await followGeneration('owner', record(true), { onUpdate: vi.fn(), onError: vi.fn() }).promise)?.status).toBe('cancelled')
    expect(api.getGeneration).toHaveBeenCalledTimes(2)
  })

  it('关闭订阅不取消远端任务，任务信息继续保留', async () => {
    vi.mocked(api.getGeneration).mockResolvedValue(snapshot())
    vi.mocked(api.subscribeGeneration).mockImplementation(async (_id, _seq, signal) => sse([], signal, true))
    const handle = followGeneration('owner', record(true), { onUpdate: vi.fn(), onError: vi.fn() })
    await flush()
    handle.abort()
    expect(await handle.promise).toBeUndefined()
    expect(api.cancelGeneration).not.toHaveBeenCalled()
    expect(readGenerationRecords('owner')[0]?.snapshot?.generationId).toBe('g1')
  })

  it('离线停止保存意图，联网后取消并等待最终快照', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const task = record(true)
    task.snapshot = snapshot({ content: '点击停止时的内容' })
    const handle = followGeneration('owner', task, { onUpdate: vi.fn(), onError: vi.fn() })
    handle.cancel()
    expect(readGenerationRecords('owner')[0]).toMatchObject({ cancelPending: true, connection: 'stop_pending', frozenSnapshot: { content: '点击停止时的内容' } })
    expect(api.cancelGeneration).not.toHaveBeenCalled()
    vi.mocked(api.cancelGeneration).mockResolvedValue(snapshot({ status: 'cancel_requested', content: '服务器已保存内容' }))
    vi.mocked(api.getGeneration).mockResolvedValueOnce(snapshot({ status: 'cancel_requested', content: '服务器已保存内容' }))
      .mockResolvedValueOnce(snapshot({ status: 'cancelled', lastSeq: 1, content: '最终保留内容' }))
    vi.mocked(api.subscribeGeneration).mockResolvedValue(sse([event('cancelled', 1)]))
    online.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    expect((await handle.promise)?.content).toBe('最终保留内容')
    expect(api.cancelGeneration).toHaveBeenCalledOnce()
    expect(readGenerationRecords('owner')).toEqual([])
  })

  it('重新打开应用继续同步持久化的待取消任务', async () => {
    const task = record(true)
    task.cancelPending = true
    saveGenerationRecord('owner', task)
    vi.mocked(api.cancelGeneration).mockResolvedValue(snapshot({ status: 'cancelled', content: '保留' }))
    const restored = readGenerationRecords('owner')[0]!
    expect((await followGeneration('owner', restored, { onUpdate: vi.fn(), onError: vi.fn() }).promise)?.status).toBe('cancelled')
    expect(api.cancelGeneration).toHaveBeenCalledWith('g1', expect.any(AbortSignal))
    expect(api.createGeneration).not.toHaveBeenCalled()
  })

  it('401 不无限重试，保留记录供重新登录恢复', async () => {
    vi.useFakeTimers()
    vi.mocked(api.getGeneration).mockRejectedValue(new ApiError('401', '登录失效'))
    const onError = vi.fn()
    const task = record(true)
    await followGeneration('owner', task, { onUpdate: vi.fn(), onError }).promise
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.getGeneration).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
    expect(readGenerationRecords('owner')[0]?.connection).toBe('error')
  })

  it('完成快照直接收尾，保留失败任务的部分正文及错误码', async () => {
    vi.mocked(api.getGeneration).mockResolvedValue(snapshot({ status: 'failed', content: '部分正文', errorCode: 'WORKER_INTERRUPTED' }))
    expect(await followGeneration('owner', record(true), { onUpdate: vi.fn(), onError: vi.fn() }).promise)
      .toMatchObject({ content: '部分正文', errorCode: 'WORKER_INTERRUPTED', status: 'failed' })
    expect(api.subscribeGeneration).not.toHaveBeenCalled()
  })

  it('本机存储失败时不提交创建请求', async () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    await expect(followGeneration('owner', record(), { onUpdate: vi.fn(), onError: vi.fn() }).promise).rejects.toThrow('quota')
    expect(api.createGeneration).not.toHaveBeenCalled()
  })
})
