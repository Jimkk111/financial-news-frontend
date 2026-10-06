import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { StreamChatHandle, StreamChatOptions, StreamChatResult } from '@/api/ai'
import type { AiSource } from '@/types'
import { ApiError } from '@/api/request'

vi.mock('@/api/ai', () => ({
  createSession: vi.fn(),
  getSessions: vi.fn(),
  getSessionMessages: vi.fn(),
  deleteSession: vi.fn(),
  updateSessionTitle: vi.fn(),
  streamChat: vi.fn(),
  healthCheck: vi.fn(),
}))

vi.mock('@/utils/toast', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
  errorMessage: vi.fn(),
}))

import { useAiSessionStore } from '../aiSession'
import { toast } from '@/utils/toast'
import {
  createSession,
  getSessions,
  getSessionMessages,
  streamChat,
} from '@/api/ai'

const createSessionMock = vi.mocked(createSession)
const getSessionsMock = vi.mocked(getSessions)
const getSessionMessagesMock = vi.mocked(getSessionMessages)
const streamChatMock = vi.mocked(streamChat)

/** 构造可控的流式 handle：测试中手动派发增量 / 完成 / 中止 */
function createStreamHandle() {
  let capturedOptions: StreamChatOptions | undefined
  let capturedResolve: ((result: StreamChatResult) => void) | undefined
  let capturedReject: ((error: unknown) => void) | undefined
  const abort = vi.fn()

  const handle: StreamChatHandle = {
    promise: new Promise<StreamChatResult>((resolve, reject) => {
      capturedResolve = resolve
      capturedReject = reject
    }),
    abort,
  }

  return {
    handle,
    abort,
    options: () => capturedOptions,
    onChunk: (chunk: string) => capturedOptions?.onChunk(chunk),
    onReasoning: (chunk: string) => capturedOptions?.onReasoning?.(chunk),
    onSources: (batch: AiSource[]) => capturedOptions?.onSources?.(batch),
    onAccepted: (sessionId: string) => capturedOptions?.onAccepted?.(sessionId),
    resolve: (result: StreamChatResult) => capturedResolve?.(result),
    reject: (error: unknown) => capturedReject?.(error),
    inject: () => {
      streamChatMock.mockImplementation((_messages, options) => {
        capturedOptions = options
        return handle
      })
    },
  }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useAiSessionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    getSessionsMock.mockResolvedValue([])
  })

  describe('sendMessage', () => {
    it('流式完成后消息落位、会话 ID 更新', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      const stream = createStreamHandle()
      stream.inject()

      const store = useAiSessionStore()
      const sending = store.sendMessage('你好')
      await flushMicrotasks()

      expect(store.messages[0]!.role).toBe('user')

      stream.onChunk('部分')
      await flushMicrotasks()
      expect(store.messages[1]!.status).toBe('streaming')

      stream.resolve({ content: '完整回答', reasoning: '', sources: [], sessionId: 'sess-1', aborted: false })
      await sending

      expect(store.currentSessionId).toBe('sess-1')
      expect(store.messages).toHaveLength(2)
      expect(store.messages[1]!.content).toBe('完整回答')
      expect(store.messages[1]!.status).toBe('complete')
      expect(store.isSending).toBe(false)
    })

    it('停止生成保留已收到的部分回复', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      const stream = createStreamHandle()
      stream.inject()

      const store = useAiSessionStore()
      const sending = store.sendMessage('写一篇长文')
      await flushMicrotasks()

      stream.onChunk('部分内容')
      await flushMicrotasks()

      store.stopGeneration()
      expect(stream.abort).toHaveBeenCalled()

      stream.resolve({ content: '部分内容', reasoning: '', sources: [], aborted: true })
      await sending

      expect(store.messages).toHaveLength(2)
      expect(store.messages[1]!.content).toBe('部分内容')
      expect(store.messages[1]!.status).toBe('complete')
      expect(store.error).toBeNull()
      expect(store.isSending).toBe(false)
    })

    it('未收到任何内容时停止则移除占位消息', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      const stream = createStreamHandle()
      stream.inject()

      const store = useAiSessionStore()
      const sending = store.sendMessage('你好')
      await flushMicrotasks()

      store.stopGeneration()
      stream.resolve({ content: '', reasoning: '', sources: [], aborted: true })
      await sending

      expect(store.messages).toHaveLength(1)
      expect(store.messages[0]!.role).toBe('user')
    })

    it('思考链先于正文流式展示，完成后保留 reasoning 与思考耗时', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      const stream = createStreamHandle()
      stream.inject()

      const store = useAiSessionStore()
      const sending = store.sendMessage('你好')
      await flushMicrotasks()

      // 思考链先到：占位消息已创建，正文仍为空
      stream.onReasoning('让我想想')
      await flushMicrotasks()
      expect(store.messages).toHaveLength(2)
      expect(store.messages[1]!.role).toBe('assistant')
      expect(store.messages[1]!.status).toBe('streaming')
      expect(store.messages[1]!.content).toBe('')
      expect(store.messages[1]!.reasoning).toBe('让我想想')

      // 正文开始到达，期间思考链继续增量
      stream.onChunk('正文')
      stream.onReasoning('补充思考')
      await flushMicrotasks()

      stream.resolve({
        content: '正文回答',
        reasoning: '让我想想补充思考',
        sources: [],
        sessionId: 'sess-1',
        aborted: false,
      })
      await sending

      expect(store.messages[1]!.content).toBe('正文回答')
      expect(store.messages[1]!.reasoning).toBe('让我想想补充思考')
      expect(store.messages[1]!.reasoningSeconds).toBeGreaterThanOrEqual(1)
      expect(store.messages[1]!.status).toBe('complete')
    })

    it('非思考型模型无 reasoning 时消息不带该字段', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      const stream = createStreamHandle()
      stream.inject()

      const store = useAiSessionStore()
      const sending = store.sendMessage('你好')
      await flushMicrotasks()

      stream.onChunk('直接回答')
      stream.resolve({ content: '直接回答', reasoning: '', sources: [], sessionId: 'sess-1', aborted: false })
      await sending

      expect(store.messages[1]!.content).toBe('直接回答')
      expect(store.messages[1]!.reasoning).toBeUndefined()
    })

    it('思考中停止生成时保留已收到的思考链', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      const stream = createStreamHandle()
      stream.inject()

      const store = useAiSessionStore()
      const sending = store.sendMessage('写一篇长文')
      await flushMicrotasks()

      stream.onReasoning('部分思考')
      await flushMicrotasks()

      store.stopGeneration()
      expect(stream.abort).toHaveBeenCalled()
      stream.resolve({ content: '', reasoning: '部分思考', sources: [], aborted: true })
      await sending

      expect(store.messages).toHaveLength(2)
      expect(store.messages[1]!.content).toBe('')
      expect(store.messages[1]!.reasoning).toBe('部分思考')
      expect(store.messages[1]!.status).toBe('complete')
    })

    it('思考链已到但流式失败时保留思考链并提示错误', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      const stream = createStreamHandle()
      stream.inject()

      const store = useAiSessionStore()
      const sending = store.sendMessage('你好')
      await flushMicrotasks()

      stream.onReasoning('思考了但没结果')
      await flushMicrotasks()

      stream.reject(new ApiError('500', 'AI 响应内容为空'))
      await sending

      expect(toast.error).toHaveBeenCalledWith('AI 响应内容为空')
      expect(store.messages).toHaveLength(2)
      expect(store.messages[1]!.content).toBe('')
      expect(store.messages[1]!.reasoning).toBe('思考了但没结果')
      expect(store.messages[1]!.status).toBe('complete')
    })

    it('请求受理即显示思考中占位消息，首增量到达后正常流式', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      const stream = createStreamHandle()
      stream.inject()

      const store = useAiSessionStore()
      const sending = store.sendMessage('你好')
      await flushMicrotasks()

      // 受理前只有用户消息
      expect(store.messages).toHaveLength(1)

      stream.onAccepted('sess-1')
      await flushMicrotasks()
      expect(store.messages).toHaveLength(2)
      expect(store.messages[1]!.role).toBe('assistant')
      expect(store.messages[1]!.status).toBe('streaming')
      expect(store.messages[1]!.content).toBe('')

      stream.onReasoning('开始想')
      stream.onChunk('答')
      stream.resolve({ content: '答', reasoning: '开始想', sources: [], sessionId: 'sess-1', aborted: false })
      await sending

      expect(store.messages[1]!.content).toBe('答')
      expect(store.messages[1]!.status).toBe('complete')
    })

    it('受理后未收到任何内容即停止则移除占位消息', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      const stream = createStreamHandle()
      stream.inject()

      const store = useAiSessionStore()
      const sending = store.sendMessage('你好')
      await flushMicrotasks()

      stream.onAccepted('sess-1')
      await flushMicrotasks()
      expect(store.messages).toHaveLength(2)

      store.stopGeneration()
      stream.resolve({ content: '', reasoning: '', sources: [], aborted: true })
      await sending

      expect(store.messages).toHaveLength(1)
      expect(store.messages[0]!.role).toBe('user')
    })

    it('联网搜索开关随请求下发并持久化', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      const stream = createStreamHandle()
      stream.inject()

      const store = useAiSessionStore()
      expect(store.webSearchEnabled).toBe(false)

      store.setWebSearch(true)
      expect(localStorage.getItem('aiAssistantWebSearch')).toBe('1')

      const first = store.sendMessage('今天A股行情')
      await flushMicrotasks()
      expect(stream.options()?.webSearch).toBe(true)
      stream.resolve({ content: '答', reasoning: '', sources: [], sessionId: 'sess-1', aborted: false })
      await first

      const stream2 = createStreamHandle()
      stream2.inject()
      store.toggleWebSearch()
      expect(localStorage.getItem('aiAssistantWebSearch')).toBe('0')

      const second = store.sendMessage('再问')
      await flushMicrotasks()
      expect(stream2.options()?.webSearch).toBe(false)
      stream2.resolve({ content: '答二', reasoning: '', sources: [], sessionId: 'sess-1', aborted: false })
      await second
    })

    it('引用来源分批到达时追加到消息，完成后保留', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      const stream = createStreamHandle()
      stream.inject()

      const store = useAiSessionStore()
      const sending = store.sendMessage('最新消息')
      await flushMicrotasks()

      // 首批来源先于思考/正文到达：占位消息即携带来源
      stream.onSources([{ title: 'A股大涨', url: 'https://a.com/1' }])
      await flushMicrotasks()
      expect(store.messages).toHaveLength(2)
      expect(store.messages[1]!.status).toBe('streaming')
      expect(store.messages[1]!.sources).toHaveLength(1)

      stream.onReasoning('搜到的资料显示')
      stream.onChunk('根据最新消息[1]')
      await flushMicrotasks()

      const allSources: AiSource[] = [
        { title: 'A股大涨', url: 'https://a.com/1' },
        { title: '央行降息', url: 'https://b.com/2' },
      ]
      stream.resolve({ content: '根据最新消息[1]', reasoning: '', sources: allSources, sessionId: 'sess-1', aborted: false })
      await sending

      expect(store.messages[1]!.sources).toEqual(allSources)
      expect(store.messages[1]!.status).toBe('complete')
    })

    it('搜索阶段停止生成时保留已收到的来源', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      const stream = createStreamHandle()
      stream.inject()

      const store = useAiSessionStore()
      const sending = store.sendMessage('最新消息')
      await flushMicrotasks()

      stream.onSources([{ title: 'A股大涨', url: 'https://a.com/1' }])
      await flushMicrotasks()

      store.stopGeneration()
      stream.resolve({ content: '', reasoning: '', sources: [{ title: 'A股大涨', url: 'https://a.com/1' }], aborted: true })
      await sending

      expect(store.messages).toHaveLength(2)
      expect(store.messages[1]!.sources).toHaveLength(1)
      expect(store.messages[1]!.status).toBe('complete')
    })

    it('请求失败时保留用户消息并弹出错误提示', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      streamChatMock.mockReturnValue({
        promise: Promise.reject(new ApiError('500', '模型服务过载')),
        abort: vi.fn(),
      })

      const store = useAiSessionStore()
      await store.sendMessage('你好')

      expect(toast.error).toHaveBeenCalledWith('模型服务过载')
      expect(store.error).toBeNull()
      expect(store.messages).toHaveLength(1)
      expect(store.messages[0]!.role).toBe('user')
      expect(store.isSending).toBe(false)
    })

    it('空内容不触发发送', async () => {
      const store = useAiSessionStore()
      await store.sendMessage('   ')
      expect(streamChatMock).not.toHaveBeenCalled()
    })

    it('切换会话后旧流结果不写入新会话', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      getSessionMessagesMock.mockResolvedValue([])
      const stream = createStreamHandle()
      stream.inject()

      const store = useAiSessionStore()
      const sending = store.sendMessage('慢问题')
      await flushMicrotasks()

      // 模拟流式进行中用户切换到另一会话
      store.selectSession('sess-2')
      await flushMicrotasks()

      stream.onChunk('迟到的片段')
      stream.resolve({ content: '迟到的完整回复', reasoning: '', sources: [], aborted: false })
      await sending
      await flushMicrotasks()

      // sess-2 的消息列表为空，旧流结果被丢弃
      expect(store.messages).toHaveLength(0)
      expect(store.currentSessionId).toBe('sess-2')
    })
  })

  describe('selectSession', () => {
    it('加载历史会话时保留 assistant 思考链与引用来源', async () => {
      getSessionMessagesMock.mockResolvedValue([
        { role: 'user', content: '问' },
        { role: 'assistant', content: '答', reasoning: '历史思考' },
        {
          role: 'assistant',
          content: '带来源的答',
          sources: [{ title: 'A股大涨', url: 'https://a.com/1', siteName: '新浪财经' }],
        },
      ])

      const store = useAiSessionStore()
      await store.selectSession('sess-h')

      expect(store.currentSessionId).toBe('sess-h')
      expect(store.messages[1]!.content).toBe('答')
      expect(store.messages[1]!.reasoning).toBe('历史思考')
      expect(store.messages[1]!.status).toBe('complete')
      expect(store.messages[2]!.reasoning).toBeUndefined()
      expect(store.messages[2]!.sources).toEqual([
        { title: 'A股大涨', url: 'https://a.com/1', siteName: '新浪财经' },
      ])
    })
  })

  describe('regenerate', () => {
    it('移除最后一轮问答后重发用户消息', async () => {
      createSessionMock.mockResolvedValue({ sessionId: 'sess-1' })
      const stream1 = createStreamHandle()
      stream1.inject()

      const store = useAiSessionStore()
      const first = store.sendMessage('第一问')
      await flushMicrotasks()
      stream1.resolve({ content: '第一答', reasoning: '', sources: [], aborted: false })
      await first
      expect(store.messages).toHaveLength(2)

      const stream2 = createStreamHandle()
      stream2.inject()
      const regenerating = store.regenerate()

      // 旧问答被移除，用户消息重新入列
      expect(store.messages).toHaveLength(1)
      expect(store.messages[0]!.role).toBe('user')
      expect(store.messages[0]!.content).toBe('第一问')

      stream2.resolve({ content: '重新回答', reasoning: '', sources: [], aborted: false })
      await regenerating

      expect(store.messages).toHaveLength(2)
      expect(store.messages[1]!.content).toBe('重新回答')
    })
  })

  describe('会话列表', () => {
    it('groupedSessions 按时间分组', () => {
      const store = useAiSessionStore()
      const today = new Date()
      const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())

      store.sessions = [
        { sessionId: 'a', title: '今天', createdAt: '', updatedAt: today.toISOString() },
        { sessionId: 'b', title: '昨天', createdAt: '', updatedAt: new Date(midnight.getTime() - 3600_000).toISOString() },
        { sessionId: 'c', title: '本周', createdAt: '', updatedAt: new Date(midnight.getTime() - 3 * 86_400_000).toISOString() },
        { sessionId: 'd', title: '更早', createdAt: '', updatedAt: new Date(midnight.getTime() - 10 * 86_400_000).toISOString() },
      ]

      const groups = store.groupedSessions
      expect(groups.map((g) => g.key)).toEqual(['today', 'yesterday', 'thisWeek', 'older'])
      expect(groups[0]!.sessions[0]!.sessionId).toBe('a')
    })

    it('filteredSessions 按标题不区分大小写过滤', () => {
      const store = useAiSessionStore()
      store.sessions = [
        { sessionId: 'a', title: 'Stock Report', createdAt: '', updatedAt: '' },
        { sessionId: 'b', title: '量化策略', createdAt: '', updatedAt: '' },
      ]

      store.setSearchQuery('stock')
      expect(store.filteredSessions.map((s) => s.sessionId)).toEqual(['a'])

      store.setSearchQuery('量化')
      expect(store.filteredSessions.map((s) => s.sessionId)).toEqual(['b'])
    })
  })
})
