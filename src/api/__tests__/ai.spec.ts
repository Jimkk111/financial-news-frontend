import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as request from '../request'
import * as aiApi from '../ai'

vi.mock('../request', () => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), postStream: vi.fn(), getStream: vi.fn(),
}))

beforeEach(() => vi.resetAllMocks())

describe('AI API 定义', () => {
  it('任务创建携带幂等键，订阅、快照与取消使用独立接口', async () => {
    const data = { messages: [{ role: 'user' as const, content: '问题' }] }
    const controller = new AbortController()
    await aiApi.createGeneration(data, 'key-1', controller.signal)
    await aiApi.getGeneration('g1', controller.signal)
    await aiApi.subscribeGeneration('g1', 42, controller.signal)
    await aiApi.cancelGeneration('g1', controller.signal)
    expect(request.post).toHaveBeenCalledWith('/ai/generations', data, { headers: { 'Idempotency-Key': 'key-1' }, signal: controller.signal })
    expect(request.get).toHaveBeenCalledWith('/ai/generations/g1', { signal: controller.signal })
    expect(request.getStream).toHaveBeenCalledWith('/ai/generations/g1/events?afterSeq=42', controller.signal)
    expect(request.post).toHaveBeenCalledWith('/ai/generations/g1/cancel', undefined, { signal: controller.signal })
  })
  it('创建会话保留后端字段，由服务层处理兼容', async () => {
    const raw = { session_id: 'session-1' }
    vi.mocked(request.post).mockResolvedValue(raw)
    expect(await aiApi.createSession()).toBe(raw)
    expect(request.post).toHaveBeenCalledWith('/ai/sessions')
  })

  it('会话列表和历史消息保留原始响应', async () => {
    const sessions = { sessions: [{ session_id: 'session-1' }] }
    const messages = { messages: [{ role: 'assistant', content: '答', reasoning_content: '思考' }] }
    vi.mocked(request.get).mockResolvedValueOnce(sessions).mockResolvedValueOnce(messages)
    expect(await aiApi.getSessions()).toBe(sessions)
    expect(await aiApi.getSessionMessages('session-1')).toBe(messages)
    expect(request.get).toHaveBeenNthCalledWith(1, '/ai/sessions')
    expect(request.get).toHaveBeenNthCalledWith(2, '/ai/sessions/session-1/messages')
  })

  it('删除、重命名、健康检查调用对应接口', async () => {
    await aiApi.deleteSession('session-1')
    await aiApi.updateSessionTitle('session-1', '新标题')
    await aiApi.healthCheck()
    expect(request.del).toHaveBeenCalledWith('/ai/sessions/session-1')
    expect(request.put).toHaveBeenCalledWith('/ai/sessions/session-1', { title: '新标题' })
    expect(request.get).toHaveBeenCalledWith('/ai/health')
  })

  it('普通对话传递请求体并返回响应', async () => {
    const data = { messages: [{ role: 'user' as const, content: '你好' }] }
    const response = { content: '答' }
    vi.mocked(request.post).mockResolvedValue(response)
    expect(await aiApi.chatCompletion(data)).toBe(response)
    expect(request.post).toHaveBeenCalledWith('/ai/chat', data)
  })

  it('流式接口只传递请求体、取消信号和原始响应', async () => {
    const data = { messages: [{ role: 'user' as const, content: '你好' }], webSearch: true }
    const controller = new AbortController()
    const response = new Response('', { headers: { 'Content-Type': 'text/event-stream' } })
    vi.mocked(request.postStream).mockResolvedValue(response)
    expect(await aiApi.streamChat(data, controller.signal)).toBe(response)
    expect(request.postStream).toHaveBeenCalledWith('/ai/chat/stream', data, controller.signal)
  })
})
