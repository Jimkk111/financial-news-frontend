import { describe, expect, it } from 'vitest'
import { normalizeChatMessages, normalizeSession, normalizeSessions } from '../aiNormalize'

describe('normalizeSession', () => {
  it('兼容 snake_case 字段', () => {
    const session = normalizeSession({
      session_id: 's1',
      title: '财报分析',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    })
    expect(session).toEqual({
      sessionId: 's1',
      title: '财报分析',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    })
  })

  it('字段缺失时给出兜底值', () => {
    const session = normalizeSession({})
    expect(session.sessionId).toBe('')
    expect(session.title).toBe('未命名会话')
    expect(session.createdAt).toBeTruthy()
    expect(session.updatedAt).toBeTruthy()
  })
})

describe('normalizeSessions', () => {
  it('直接接受数组', () => {
    const sessions = normalizeSessions([{ sessionId: 'a' }, { session_id: 'b' }])
    expect(sessions.map((s) => s.sessionId)).toEqual(['a', 'b'])
  })

  it('解包 { sessions } 包装', () => {
    const sessions = normalizeSessions({ sessions: [{ sessionId: 'a' }] })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.sessionId).toBe('a')
  })

  it('解包 { data } 包装', () => {
    const sessions = normalizeSessions({ data: [{ id: 'c' }] })
    expect(sessions[0]!.sessionId).toBe('c')
  })

  it('非法输入返回空数组', () => {
    expect(normalizeSessions(null)).toEqual([])
    expect(normalizeSessions('x')).toEqual([])
    expect(normalizeSessions({ other: 1 })).toEqual([])
  })
})

describe('normalizeChatMessages', () => {
  it('解包 { messages } 包装并过滤无效项', () => {
    const messages = normalizeChatMessages({
      messages: [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '' },
        { role: 'assistant' },
        'bad-item',
      ],
    })
    expect(messages).toEqual([{ role: 'user', content: '你好' }])
  })

  it('未知 role 归一化为 user', () => {
    const messages = normalizeChatMessages([{ role: 'system', content: 'x' }])
    expect(messages).toEqual([{ role: 'user', content: 'x' }])
  })

  it('直接接受数组', () => {
    const messages = normalizeChatMessages([{ role: 'assistant', content: '回复' }])
    expect(messages).toEqual([{ role: 'assistant', content: '回复' }])
  })

  it('assistant 思考链归一化为 reasoning（兼容 camelCase / snake_case）', () => {
    const messages = normalizeChatMessages([
      { role: 'assistant', content: '回复一', reasoningContent: '思考一' },
      { role: 'assistant', content: '回复二', reasoning_content: '思考二' },
      { role: 'assistant', content: '非思考模型回复' },
    ])
    expect(messages).toEqual([
      { role: 'assistant', content: '回复一', reasoning: '思考一' },
      { role: 'assistant', content: '回复二', reasoning: '思考二' },
      { role: 'assistant', content: '非思考模型回复' },
    ])
  })

  it('assistant sources 归一化：历史接口的 JSON 字符串解析为数组', () => {
    const messages = normalizeChatMessages({
      messages: [
        {
          role: 'assistant',
          content: '答',
          sources: JSON.stringify([
            { title: 'A股大涨', url: 'https://a.com/1', siteName: '新浪财经', summary: '摘要', publish_time: '2026-09-25' },
          ]),
        },
        { role: 'assistant', content: '答二', sources: '不是合法 JSON' },
        { role: 'assistant', content: '答三', sources: '[]' },
        { role: 'assistant', content: '答四' },
      ],
    })
    expect(messages[0]!.sources).toEqual([
      {
        title: 'A股大涨',
        url: 'https://a.com/1',
        summary: '摘要',
        siteName: '新浪财经',
        publishTime: '2026-09-25',
        logoUrl: undefined,
      },
    ])
    expect(messages[1]!.sources).toBeUndefined()
    expect(messages[2]!.sources).toBeUndefined()
    expect(messages[3]!.sources).toBeUndefined()
  })

  it('sources 数组项缺 url 时被过滤，缺 title 时回退为 url', () => {
    const messages = normalizeChatMessages({
      messages: [
        {
          role: 'assistant',
          content: '答',
          sources: JSON.stringify([{ title: '无链接' }, { url: 'https://b.com' }]),
        },
      ],
    })
    expect(messages[0]!.sources).toEqual([
      {
        title: 'https://b.com',
        url: 'https://b.com',
        summary: undefined,
        siteName: undefined,
        publishTime: undefined,
        logoUrl: undefined,
      },
    ])
  })
})
