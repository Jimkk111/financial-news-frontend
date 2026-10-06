import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../request'
import { streamChat } from '../ai'

describe('streamChat', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  type StubResponse = {
    ok: boolean
    status: number
    headers: { get: (key: string) => string | null }
    body?: ReadableStream<Uint8Array>
    json?: () => Promise<unknown>
  }

  /** 用 ReadableStream 模拟后端 SSE 响应，记录请求的 URL 与 body */
  function stubFetchSse(chunks: string[], options?: { close?: boolean }) {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init })
      const encoder = new TextEncoder()
      const signal = init?.signal as AbortSignal | undefined
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
          if (options?.close) controller.close()
          // 模拟真实 fetch：请求被 abort 时底层流以 AbortError 中断
          signal?.addEventListener('abort', () => {
            controller.error(new DOMException('The operation was aborted.', 'AbortError'))
          })
        },
      })
      const response: StubResponse = {
        ok: true,
        status: 200,
        headers: { get: (key) => (key.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
        body,
      }
      return response
    })
    vi.stubGlobal('fetch', fetchMock)
    return { fetchMock, requests }
  }

  it('请求 POST /ai/chat/stream,body 不带 stream 字段', async () => {
    const { requests } = stubFetchSse(['data: {"content":"hi"}\n\n', 'data: [DONE]\n\n'])

    const handle = streamChat([{ role: 'user', content: '你好' }], { onChunk: () => {} })
    const result = await handle.promise

    expect(requests[0]!.url).toBe('/api/ai/chat/stream')
    expect(JSON.parse(requests[0]!.init!.body as string)).toEqual({
      messages: [{ role: 'user', content: '你好' }],
    })
    expect(result.aborted).toBe(false)
    expect(result.content).toBe('hi')
  })

  it('按序回调分片并在结束时汇聚 sessionId', async () => {
    stubFetchSse([
      'data: {"content":"你"}\n\n',
      'data: {"content":"好"}\n\n',
      'data: {"sessionId":"session-abc12345"}\n\n',
      'data: [DONE]\n\n',
    ])

    const received: string[] = []
    const handle = streamChat([{ role: 'user', content: '你好' }], { onChunk: (chunk) => received.push(chunk) })
    const result = await handle.promise

    expect(received).toEqual(['你', '好'])
    expect(result.content).toBe('你好')
    expect(result.sessionId).toBe('session-abc12345')
  })

  it('思考链事件走 onReasoning 增量回调并在结果中拼接', async () => {
    stubFetchSse([
      'data: {"sessionId":"session-1"}\n\n',
      'data: {"reasoning":"用户在测试。"}\n\n',
      'data: {"reasoning":"继续思考"}\n\n',
      'data: {"content":"你好"}\n\n',
      'data: [DONE]\n\n',
    ])

    const reasoningChunks: string[] = []
    const contentChunks: string[] = []
    const handle = streamChat([{ role: 'user', content: '你好' }], {
      onChunk: (chunk) => contentChunks.push(chunk),
      onReasoning: (chunk) => reasoningChunks.push(chunk),
    })
    const result = await handle.promise

    expect(reasoningChunks).toEqual(['用户在测试。', '继续思考'])
    expect(contentChunks).toEqual(['你好'])
    expect(result.reasoning).toBe('用户在测试。继续思考')
    expect(result.content).toBe('你好')
    expect(result.sessionId).toBe('session-1')
  })

  it('非思考型模型无 reasoning 事件时结果为空串', async () => {
    stubFetchSse(['data: {"content":"hi"}\n\n', 'data: [DONE]\n\n'])

    const handle = streamChat([{ role: 'user', content: '你好' }], { onChunk: () => {} })
    const result = await handle.promise

    expect(result.reasoning).toBe('')
  })

  it('sources 事件按批回调并在结果中聚合', async () => {
    stubFetchSse([
      'data: {"sessionId":"session-1"}\n\n',
      'data: {"sources":[{"title":"A股大涨","url":"https://a.com/1","siteName":"新浪财经"}]}\n\n',
      'data: {"reasoning":"需要搜索最新行情"}\n\n',
      'data: {"sources":[{"title":"央行降息","url":"https://b.com/2"}]}\n\n',
      'data: {"content":"根据最新消息[1][2]"}\n\n',
      'data: [DONE]\n\n',
    ])

    const batches: unknown[][] = []
    const handle = streamChat([{ role: 'user', content: '今天行情' }], {
      onChunk: () => {},
      sessionId: 'session-1',
      onSources: (batch) => batches.push([...batch]),
    })
    const result = await handle.promise

    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(1)
    expect(batches[1]).toHaveLength(1)
    expect(result.sources).toHaveLength(2)
    expect(result.sources[0]).toMatchObject({ title: 'A股大涨', siteName: '新浪财经' })
    expect(result.sources[1]!.url).toBe('https://b.com/2')
    expect(result.content).toBe('根据最新消息[1][2]')
  })

  it('无 sources 事件时结果为空数组', async () => {
    stubFetchSse(['data: {"content":"hi"}\n\n', 'data: [DONE]\n\n'])

    const handle = streamChat([{ role: 'user', content: '你好' }], { onChunk: () => {} })
    const result = await handle.promise

    expect(result.sources).toEqual([])
  })

  it('webSearch 开启时请求体带 webSearch:true，默认不带', async () => {
    const first = stubFetchSse(['data: [DONE]\n\n'])
    await streamChat([{ role: 'user', content: 'hi' }], {
      onChunk: () => {},
      sessionId: 'sess-1',
      webSearch: true,
    }).promise
    expect(JSON.parse(first.requests[0]!.init!.body as string).webSearch).toBe(true)

    const second = stubFetchSse(['data: [DONE]\n\n'])
    await streamChat([{ role: 'user', content: 'hi' }], { onChunk: () => {} }).promise
    expect(JSON.parse(second.requests[0]!.init!.body as string)).not.toHaveProperty('webSearch')
  })

  it('sessionId 事件触发 onAccepted 受理信号', async () => {
    stubFetchSse([
      'data: {"sessionId":"session-9"}\n\n',
      'data: {"content":"hi"}\n\n',
      'data: [DONE]\n\n',
    ])

    const accepted: string[] = []
    const result = await streamChat([{ role: 'user', content: '你好' }], {
      onChunk: () => {},
      onAccepted: (id) => accepted.push(id),
    }).promise

    expect(accepted).toEqual(['session-9'])
    expect(result.sessionId).toBe('session-9')
  })

  it('流内 error 事件以 ApiError 抛出，而不是静默成空回复', async () => {
    stubFetchSse(['data: {"error":"AI服务暂时不可用"}\n\n', 'data: [DONE]\n\n'])

    const handle = streamChat([{ role: 'user', content: '你好' }], { onChunk: () => {} })
    const error = await handle.promise.catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe('AI服务暂时不可用')
  })

  it('后端未发 [DONE] 即断流时按错误处理（completeWithError 场景）', async () => {
    // 发出一段内容后直接关闭流，模拟 SseEmitter.completeWithError
    stubFetchSse(['data: {"content":"部分"}\n\n'], { close: true })

    const handle = streamChat([{ role: 'user', content: '你好' }], { onChunk: () => {} })
    const error = await handle.promise.catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toContain('中断')
  })

  it('调用方中止后保留已收到的部分内容', async () => {
    // 首个分片后不再发送数据，等待调用方 abort
    stubFetchSse(['data: {"content":"部分"}\n\n'])

    const received: string[] = []
    const handle = streamChat([{ role: 'user', content: '你好' }], { onChunk: (chunk) => received.push(chunk) })

    await vi.waitFor(() => expect(received).toEqual(['部分']))
    handle.abort()

    const result = await handle.promise
    expect(result.aborted).toBe(true)
    expect(result.content).toBe('部分')
  })

  it('空闲超时默认 30s，webSearch 开启放宽到 60s', async () => {
    vi.useFakeTimers()

    // 默认 30s：29.999s 仍在等待，30s 整触发超时
    stubFetchSse([])
    const plain = streamChat([{ role: 'user', content: 'hi' }], { onChunk: () => {} })
    let plainRejected = false
    plain.promise.catch(() => {
      plainRejected = true
    })
    await vi.advanceTimersByTimeAsync(29_999)
    expect(plainRejected).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(plainRejected).toBe(true)

    // webSearch 60s：30s 不触发，60s 整触发
    stubFetchSse([])
    const searching = streamChat([{ role: 'user', content: 'hi' }], {
      onChunk: () => {},
      webSearch: true,
    })
    let searchingRejected = false
    searching.promise.catch(() => {
      searchingRejected = true
    })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(searchingRejected).toBe(false)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(searchingRejected).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(searchingRejected).toBe(true)
  })

  it('HTTP 错误时抛出统一响应壳中的 msg', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ code: '500', msg: 'AI服务调用失败' }),
        headers: { get: () => 'application/json' },
      })),
    )

    const handle = streamChat([{ role: 'user', content: '你好' }], { onChunk: () => {} })
    await expect(handle.promise).rejects.toMatchObject({ message: 'AI服务调用失败' })
  })
})
