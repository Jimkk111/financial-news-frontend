import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as aiApi from '@/api/ai'
import { createSession, getSessions, getSessionMessages } from '../ai'

vi.mock('@/api/ai', () => ({
  createSession: vi.fn(), getSessions: vi.fn(), getSessionMessages: vi.fn(),
  deleteSession: vi.fn(), updateSessionTitle: vi.fn(), chatCompletion: vi.fn(), healthCheck: vi.fn(),
}))

beforeEach(() => vi.resetAllMocks())

describe('AI 服务层数据兼容', () => {
  it.each([{ session_id: 'legacy' }, { sessionId: 'current' }, {}])('统一创建会话 ID %j', async raw => {
    vi.mocked(aiApi.createSession).mockResolvedValue(raw)
    expect(await createSession()).toEqual({ sessionId: raw.sessionId || raw.session_id || '' })
  })

  it('归一化会话列表的包装和字段名称', async () => {
    vi.mocked(aiApi.getSessions).mockResolvedValue({ sessions: [{ session_id: 'legacy', title: '标题' }] })
    expect(await getSessions()).toEqual([expect.objectContaining({ sessionId: 'legacy', title: '标题' })])
  })

  it('归一化历史消息的思考链和引用来源', async () => {
    vi.mocked(aiApi.getSessionMessages).mockResolvedValue({ messages: [{
      role: 'assistant', content: '答', reasoning_content: '思考',
      sources: JSON.stringify([{ url: 'https://example.com', site_name: '来源' }]),
    }] })
    expect(await getSessionMessages('session-1')).toEqual([{
      role: 'assistant', content: '答', reasoning: '思考',
      sources: [expect.objectContaining({ url: 'https://example.com', siteName: '来源' })],
    }])
    expect(aiApi.getSessionMessages).toHaveBeenCalledWith('session-1')
  })
})
