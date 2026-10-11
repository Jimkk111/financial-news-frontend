import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { GenerationRecord, GenerationSnapshot, GenerationHandle } from '@/types'
import { useAiSessionStore } from '../aiSession'
import * as service from '@/services/ai'
import { toast } from '@/utils/toast'
import { ApiError } from '@/api/request'

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/utils/toast', () => ({ toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))
vi.mock('@/services/ai', () => ({
  getSessions: vi.fn(), getSessionMessages: vi.fn(), deleteSession: vi.fn(), updateSessionTitle: vi.fn(), healthCheck: vi.fn(),
  readGenerationRecords: vi.fn(), saveGenerationRecord: vi.fn(), followGeneration: vi.fn(),
  isGenerationTerminal: (status: string) => ['completed', 'cancelled', 'failed'].includes(status),
  generationErrorMessage: (error: Error) => error.message,
}))
const auth = reactive({ user: { uid: 'owner' } as { uid: string } | null, init: vi.fn().mockResolvedValue(undefined) })
const snapshot = (extra: Partial<GenerationSnapshot> = {}): GenerationSnapshot => ({
  generationId: 'g1', sessionId: 's1', messageId: 123, status: 'running', lastSeq: 0,
  content: '', reasoning: '', sources: [], errorCode: null, ...extra,
})
let active: Array<{
  record: GenerationRecord
  callbacks: Parameters<typeof service.followGeneration>[2]
  handle: GenerationHandle
  resolve: (result?: GenerationSnapshot) => void
}>
function update(index: number, state: GenerationSnapshot, connection: GenerationRecord['connection'] = 'connected') {
  const task = active[index]!
  task.record.snapshot = state
  task.record.connection = connection
  task.callbacks.onUpdate(task.record)
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve() }

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
  auth.user = { uid: 'owner' }
  active = []
  vi.mocked(service.getSessions).mockResolvedValue([])
  vi.mocked(service.getSessionMessages).mockResolvedValue([])
  vi.mocked(service.healthCheck).mockResolvedValue({ status: 'ok' })
  vi.mocked(service.readGenerationRecords).mockReturnValue([])
  vi.mocked(service.saveGenerationRecord).mockImplementation(() => {})
  vi.mocked(service.followGeneration).mockImplementation((_owner, record, callbacks) => {
    let resolve: (result?: GenerationSnapshot) => void = () => {}
    const handle: GenerationHandle = {
      promise: new Promise(r => { resolve = r }), abort: vi.fn(),
      cancel: vi.fn(() => {
        record.frozenSnapshot = record.snapshot ? JSON.parse(JSON.stringify(record.snapshot)) : undefined
        record.cancelPending = true
        record.connection = 'stop_pending'
        callbacks.onUpdate(record)
      }),
    }
    active.push({ record, callbacks, handle, resolve })
    return handle
  })
})
afterEach(() => vi.useRealTimers())

describe('AI 会话持久任务接入', () => {
  it('创建明确被拒绝后解除发送锁定，保留失败气泡', async () => {
    const store = useAiSessionStore()
    await store.sendMessage('问题')
    active[0]!.record.error = '当前会话仍在生成'
    active[0]!.callbacks.onError(new ApiError('409', '当前会话仍在生成'))
    active[0]!.resolve()
    await flush()
    expect(store.isSending).toBe(false)
    expect(store.messages[1]).toMatchObject({ status: 'complete', generationStatus: 'failed' })
    expect(store.error).toBe('当前会话仍在生成')
  })

  it('发送前持久化，任务原子创建会话且保留正文、思考和来源', async () => {
    const store = useAiSessionStore()
    await store.sendMessage(' 问题 ')
    expect(service.saveGenerationRecord).toHaveBeenCalledBefore(vi.mocked(service.followGeneration))
    expect(active[0]!.record.request).toEqual({ messages: [{ role: 'user', content: '问题' }], webSearch: false })
    expect(store.isSending).toBe(true)
    expect(store.messages).toHaveLength(2)
    update(0, snapshot({ content: '答', reasoning: '思考', lastSeq: 3, sources: [{ title: '来源', url: 'https://a.com' }] }), 'complete')
    expect(store.currentSessionId).toBe('s1')
    expect(store.messages[1]).toMatchObject({ content: '答', reasoning: '思考', lastSeq: 3, generationId: 'g1' })
    expect(localStorage.getItem('aiAssistantLastSessionId:owner')).toBe('s1')
  })

  it('切页返回重复 init 不重载历史、不关闭正在生成的订阅', async () => {
    const store = useAiSessionStore()
    await store.init()
    await store.sendMessage('问题')
    update(0, snapshot({ content: '部分' }), 'connecting')
    await store.init()
    expect(service.getSessionMessages).not.toHaveBeenCalled()
    expect(service.followGeneration).toHaveBeenCalledOnce()
    expect(active[0]!.handle.abort).not.toHaveBeenCalled()
    expect(store.messages[1]!.content).toBe('部分')
    expect(store.isSending).toBe(true)
  })

  it('切换会话不取消后台任务，旧回调不会写入新会话', async () => {
    const store = useAiSessionStore()
    await store.sendMessage('问题')
    update(0, snapshot({ content: '部分' }), 'connecting')
    await store.selectSession('s2')
    update(0, snapshot({ content: '旧会话完整回复', status: 'completed' }), 'complete')
    expect(store.currentSessionId).toBe('s2')
    expect(store.messages).toHaveLength(0)
    expect(active[0]!.handle.abort).not.toHaveBeenCalled()
    expect(active[0]!.handle.cancel).not.toHaveBeenCalled()
  })

  it('新建会话不取消旧任务，新问题使用不同幂等键', async () => {
    const store = useAiSessionStore()
    await store.sendMessage('第一问')
    store.createNewSession()
    await store.sendMessage('第二问')
    expect(active).toHaveLength(2)
    expect(active[0]!.record.key).not.toBe(active[1]!.record.key)
    update(0, snapshot({ content: '迟到内容' }), 'connecting')
    expect(store.currentSessionId).toBeNull()
    expect(store.messages[0]!.content).toBe('第二问')
  })

  it('刷新后从历史中恢复空助手消息和未完成任务', async () => {
    localStorage.setItem('aiAssistantLastSessionId:owner', 's1')
    vi.mocked(service.getSessionMessages).mockResolvedValue([
      { role: 'user', content: '问题' },
      { role: 'assistant', content: '', generationId: 'g1', status: 'queued', lastSeq: 0, messageId: 123 },
    ])
    const store = useAiSessionStore()
    await store.init()
    expect(store.isSending).toBe(true)
    expect(service.followGeneration).toHaveBeenCalledOnce()
    expect(active[0]!.record.snapshot?.generationId).toBe('g1')
    expect(store.messages[1]!.generationId).toBe('g1')
  })

  it('恢复创建超时的草稿，保留原请求和幂等键', async () => {
    const pending: GenerationRecord = { key: 'original-key', request: { messages: [{ role: 'user', content: '待确认问题' }] },
      userMessageId: 'u1', assistantMessageId: 'a1', createdAt: new Date().toISOString(), cancelPending: true, connection: 'stop_pending' }
    vi.mocked(service.readGenerationRecords).mockReturnValue([pending])
    const store = useAiSessionStore()
    await store.init()
    expect(active[0]!.record).toMatchObject(pending)
    expect(store.messages[0]!.content).toBe('待确认问题')
    expect(store.isStopping).toBe(true)
    expect(store.connectionNotice).toContain('停止请求待同步')
  })

  it('停止立即冻结显示，cancel_requested 仍等待，终态再补齐内容', async () => {
    const store = useAiSessionStore()
    await store.sendMessage('问题')
    update(0, snapshot({ content: '停止前' }), 'connecting')
    store.stopGeneration()
    expect(active[0]!.handle.cancel).toHaveBeenCalledOnce()
    expect(active[0]!.handle.abort).not.toHaveBeenCalled()
    expect(store.isStopping).toBe(true)
    update(0, snapshot({ status: 'cancel_requested', content: '服务端已保存额外内容' }), 'stopping')
    expect(store.messages[1]!.content).toBe('停止前')
    expect(store.isSending).toBe(true)
    active[0]!.record.cancelPending = false
    update(0, snapshot({ status: 'cancelled', content: '最终保留内容', lastSeq: 9 }), 'complete')
    expect(store.messages[1]).toMatchObject({ content: '最终保留内容', generationStatus: 'cancelled', lastSeq: 9 })
    expect(store.isSending).toBe(false)
  })

  it('失败保留空助手消息和错误状态', async () => {
    const store = useAiSessionStore()
    await store.sendMessage('问题')
    update(0, snapshot({ status: 'failed', errorCode: 'WORKER_INTERRUPTED' }), 'complete')
    expect(store.messages).toHaveLength(2)
    expect(store.messages[1]).toMatchObject({ content: '', generationStatus: 'failed', errorCode: 'WORKER_INTERRUPTED', status: 'complete' })
    expect(store.isSending).toBe(false)
  })

  it('重试保留用户消息，成功后替换气泡；再次重试使用新任务和新键', async () => {
    const store = useAiSessionStore()
    await store.sendMessage('问题')
    update(0, snapshot({ status: 'completed', content: '旧答', reasoning: '旧思考', sources: [{ url: 'https://old.com', title: '旧来源' }], lastSeq: 8 }), 'complete')
    store.messages[1]!.reasoningSeconds = 10
    active[0]!.resolve(active[0]!.record.snapshot)
    await flush()
    await store.regenerate()
    expect(store.messages).toHaveLength(2)
    expect(store.messages[1]!.content).toBe('旧答')
    expect(active[1]!.record.retryOf).toBe('g1')
    await store.regenerate()
    expect(active).toHaveLength(2)
    update(1, snapshot({ generationId: 'g2', messageId: 124, status: 'queued' }), 'connecting')
    expect(store.messages).toHaveLength(2)
    expect(store.messages[1]).toMatchObject({ content: '', generationId: 'g2', messageId: 124, lastSeq: 0 })
    expect(store.messages[1]!.reasoning).toBeUndefined()
    expect(store.messages[1]!.reasoningSeconds).toBeUndefined()
    expect(store.messages[1]!.sources).toEqual([])
    update(1, snapshot({ generationId: 'g2', messageId: 124, status: 'completed', content: '新答' }), 'complete')
    active[1]!.resolve(active[1]!.record.snapshot)
    await flush()
    await store.regenerate()
    expect(active[2]!.record.retryOf).toBe('g2')
    expect(active[2]!.record.key).not.toBe(active[1]!.record.key)
    expect(active[1]!.record.key).not.toBe(active[0]!.record.key)
  })

  it('重试明确失败保留原气泡，后续点击创建新操作', async () => {
    const store = useAiSessionStore()
    await store.sendMessage('问题')
    update(0, snapshot({ status: 'cancelled', content: '原答', reasoning: '原思考' }), 'complete')
    const original = JSON.parse(JSON.stringify(store.messages))
    await store.regenerate()
    active[1]!.callbacks.onError(new ApiError('409', '不是最后一轮'))
    active[1]!.resolve()
    await flush()
    expect(JSON.parse(JSON.stringify(store.messages))).toEqual(original)
    expect(store.isSending).toBe(false)
    await store.regenerate()
    expect(active[2]!.record.retryOf).toBe('g1')
    expect(active[2]!.record.key).not.toBe(active[1]!.record.key)
  })

  it('刷新时历史已替换回复，不插回旧气泡或重复订阅', async () => {
    const pending: GenerationRecord = {
      key: 'retry-key', retryOf: 'g-old', request: { sessionId: 's1', messages: [] },
      userMessageId: '', assistantMessageId: 'old-ui', createdAt: new Date().toISOString(),
      cancelPending: false, connection: 'reconnecting',
      previousReply: { id: 'old-ui', role: 'assistant', content: '旧答', generationId: 'g-old', generationStatus: 'completed', timestamp: new Date(), status: 'complete' },
    }
    vi.mocked(service.readGenerationRecords).mockReturnValue([pending])
    vi.mocked(service.getSessionMessages).mockResolvedValue([
      { role: 'user', content: '问题' },
      { role: 'assistant', content: '', generationId: 'g-new', status: 'queued', lastSeq: 0, messageId: 124 },
    ])
    const store = useAiSessionStore()
    await store.init()
    expect(active).toHaveLength(1)
    expect(store.messages).toHaveLength(2)
    update(0, snapshot({ generationId: 'g-new', messageId: 124, status: 'queued' }), 'connecting')
    expect(store.messages).toHaveLength(2)
    expect(store.messages[1]!.generationId).toBe('g-new')
  })

  it('非终态任务阻止删除会话', async () => {
    const store = useAiSessionStore()
    await store.sendMessage('问题')
    update(0, snapshot(), 'connecting')
    expect(await store.removeSession('s1')).toBe(false)
    expect(service.deleteSession).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalled()
  })

  it('划词提问只发送一次，返回页面保留任务', async () => {
    const store = useAiSessionStore()
    store.queueNewsQuestion('新闻选中内容')
    await store.init()
    expect(active[0]!.record.request.messages).toEqual([{ role: 'user', content: '新闻选中内容' }])
    await store.init()
    expect(service.followGeneration).toHaveBeenCalledOnce()
    expect(store.pendingNewsQuestion).toBe('')
  })

  it('重复初始化共享同一次加载', async () => {
    const store = useAiSessionStore()
    await Promise.all([store.init(), store.init()])
    expect(service.getSessions).toHaveBeenCalledOnce()
  })

  it('账号切换只断开订阅，清空展示并隔离持久记录', async () => {
    const store = useAiSessionStore()
    await store.sendMessage('私有问题')
    auth.user = null
    expect(active[0]!.handle.abort).toHaveBeenCalledOnce()
    expect(active[0]!.handle.cancel).not.toHaveBeenCalled()
    expect(store.messages).toEqual([])
    expect(store.needsLogin).toBe(true)
    auth.user = { uid: 'other' }
    await store.init()
    expect(service.readGenerationRecords).toHaveBeenLastCalledWith('other')
  })

  it('存储失败不提交任务，空问题也不提交', async () => {
    const store = useAiSessionStore()
    await store.sendMessage('  ')
    vi.mocked(service.saveGenerationRecord).mockImplementation(() => { throw new Error('quota') })
    await store.sendMessage('问题')
    expect(service.followGeneration).not.toHaveBeenCalled()
    expect(store.messages).toEqual([])
    expect(toast.error).toHaveBeenCalled()
  })

  it('联网搜索开关写入新任务请求', async () => {
    const store = useAiSessionStore()
    store.setWebSearch(true)
    await store.sendMessage('最新行情')
    expect(active[0]!.record.request.webSearch).toBe(true)
    expect(localStorage.getItem('aiAssistantWebSearch')).toBe('1')
  })
})
