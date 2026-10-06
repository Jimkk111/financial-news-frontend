import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { AiSource, ChatMessage, Message, SessionInfo } from '@/types'
import { ApiError } from '@/api/request'
import { toast } from '@/utils/toast'
import {
  createSession,
  getSessions,
  getSessionMessages,
  deleteSession,
  updateSessionTitle,
  streamChat,
  healthCheck
} from '@/api/ai'

export interface SessionGroup {
  label: string
  key: string
  sessions: SessionInfo[]
}

const CONVERSATIONS_CACHE_KEY = 'aiAssistantConversations'
const LAST_SESSION_KEY = 'aiAssistantLastSessionId'
const WEB_SEARCH_KEY = 'aiAssistantWebSearch'

// 服务不可用的内联横幅文案：属于持续性状态，不用自动消失的 toast；
// checkHealth 恢复时按此常量匹配清除
const SERVICE_DOWN_BANNER = '后端服务不可用，正在自动重试连接'

// 流式 chunk 按 50ms 批量刷入消息，避免每个 token 都触发响应式更新与 Markdown 重渲染
const CHUNK_FLUSH_INTERVAL = 50

function createMessageId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export const useAiSessionStore = defineStore('aiSession', () => {
  const sessions = ref<SessionInfo[]>([])
  const currentSessionId = ref<string | null>(null)
  const messages = ref<Message[]>([])
  const isLoading = ref(false)
  const isSending = ref(false)
  const error = ref<string | null>(null)
  const searchQuery = ref('')
  const sidebarOpen = ref(false)
  const isServiceHealthy = ref<boolean | null>(null)
  // 联网搜索开关：跨会话记忆，随每条消息的流式请求下发
  const webSearchEnabled = ref(
    (() => {
      try {
        return localStorage.getItem(WEB_SEARCH_KEY) === '1'
      } catch {
        return false
      }
    })()
  )

  function setWebSearch(enabled: boolean) {
    webSearchEnabled.value = enabled
    try {
      localStorage.setItem(WEB_SEARCH_KEY, enabled ? '1' : '0')
    } catch {
      // localStorage 不可用时仅影响持久化，开关本身照常生效
    }
  }

  function toggleWebSearch() {
    setWebSearch(!webSearchEnabled.value)
  }

  // 进行中的流式请求句柄与代数：切换/新建/删除会话时通过递增代数
  // 使回调失效并中止连接，避免旧流写入新会话的消息列表
  let activeStream: { abort: () => void } | null = null
  let streamEpoch = 0

  const currentSession = computed(() =>
    sessions.value.find(s => s.sessionId === currentSessionId.value)
  )

  // 根据搜索词过滤会话列表
  const filteredSessions = computed(() => {
    if (!searchQuery.value) return sessions.value
    const query = searchQuery.value.toLowerCase()
    return sessions.value.filter(s =>
      s.title.toLowerCase().includes(query)
    )
  })

  const groupedSessions = computed((): SessionGroup[] => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 86400000)
    const lastWeek = new Date(today.getTime() - 604800000)

    const groups: SessionGroup[] = [
      { label: '今天', key: 'today', sessions: [] },
      { label: '昨天', key: 'yesterday', sessions: [] },
      { label: '本周', key: 'thisWeek', sessions: [] },
      { label: '更早', key: 'older', sessions: [] }
    ]

    filteredSessions.value.forEach(session => {
      const date = new Date(session.updatedAt)
      if (date >= today) {
        groups[0]!.sessions.push(session)
      } else if (date >= yesterday) {
        groups[1]!.sessions.push(session)
      } else if (date >= lastWeek) {
        groups[2]!.sessions.push(session)
      } else {
        groups[3]!.sessions.push(session)
      }
    })

    return groups.filter(g => g.sessions.length > 0)
  })

  const hasMessages = computed(() => messages.value.length > 0)

  async function checkHealth(): Promise<boolean> {
    const wasHealthy = isServiceHealthy.value
    try {
      await healthCheck()
      isServiceHealthy.value = true
      if (error.value === SERVICE_DOWN_BANNER) error.value = null
      return true
    } catch {
      isServiceHealthy.value = false
      // 使用中途断连才提示；首次进入的失败由 init 的横幅说明，避免双重提示
      if (wasHealthy === true) toast.warning('AI 服务连接已断开，恢复后将自动重试')
      return false
    }
  }

  async function loadSessions() {
    try {
      const data = await getSessions()
      sessions.value = [...data].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      localStorage.setItem(CONVERSATIONS_CACHE_KEY, JSON.stringify(sessions.value))
    } catch {
      // 请求失败时若已有列表则保留，仅在空列表时回退到本地缓存
      if (sessions.value.length > 0) return
      try {
        const cached = localStorage.getItem(CONVERSATIONS_CACHE_KEY)
        if (cached) sessions.value = JSON.parse(cached) as SessionInfo[]
      } catch {
        sessions.value = []
      }
    }
  }

  function abortActiveStream() {
    if (!activeStream) return
    streamEpoch++
    activeStream.abort()
    activeStream = null
  }

  function createNewSession() {
    abortActiveStream()
    currentSessionId.value = null
    messages.value = []
    error.value = null
    localStorage.removeItem(LAST_SESSION_KEY)
  }

  async function selectSession(sessionId: string) {
    abortActiveStream()
    // 先关侧滑抽屉再加载：抽屉是模态的（带全屏遮罩），
    // 若加载失败时才关，遮罩会把整页挡住无法操作
    sidebarOpen.value = false

    try {
      isLoading.value = true
      error.value = null

      const sessionMessages = await getSessionMessages(sessionId)

      // 后端暂未返回消息时间戳，历史消息统一使用加载时刻
      const formattedMessages: Message[] = sessionMessages.map((msg, index) => ({
        id: `${sessionId}-${index}`,
        role: msg.role,
        content: msg.content,
        reasoning: msg.reasoning || undefined,
        sources: msg.sources,
        timestamp: new Date(),
        status: 'complete' as const
      }))

      currentSessionId.value = sessionId
      messages.value = formattedMessages

      localStorage.setItem(LAST_SESSION_KEY, sessionId)
    } catch (e) {
      console.error('selectSession failed:', e)
      toast.error('加载会话失败，请重试')
    } finally {
      isLoading.value = false
    }
  }

  async function removeSession(sessionId: string): Promise<boolean> {
    if (sessionId === currentSessionId.value) {
      abortActiveStream()
    }
    try {
      await deleteSession(sessionId)
      await loadSessions()

      if (sessionId === currentSessionId.value) {
        currentSessionId.value = null
        messages.value = []
        localStorage.removeItem(LAST_SESSION_KEY)
      }

      return true
    } catch {
      toast.error('删除会话失败，请重试')
      return false
    }
  }

  async function renameSession(sessionId: string, title: string): Promise<boolean> {
    try {
      await updateSessionTitle(sessionId, title)
      await loadSessions()
      return true
    } catch {
      toast.error('修改会话标题失败，请重试')
      return false
    }
  }

  /** 发送消息并流式接收回复。失败时保留用户消息便于重试 */
  async function sendMessage(content: string) {
    const trimmed = content.trim()
    if (!trimmed || isSending.value) return

    const userMessage: Message = {
      id: createMessageId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
      status: 'complete'
    }

    messages.value = [...messages.value, userMessage]
    isSending.value = true
    error.value = null

    const epoch = ++streamEpoch
    let sessionIdValue = currentSessionId.value
    const aiMessageId = createMessageId()
    let hasCreatedMessage = false
    let currentContent = ''
    let currentReasoning = ''
    let currentSources: AiSource[] = []
    // 思考耗时：首个思考增量到首个正文增量的间隔（秒），无思考链时为 null
    let reasoningStartedAt: number | null = null
    let reasoningSeconds: number | null = null
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const flushContent = () => {
      flushTimer = null
      if (epoch !== streamEpoch) return
      // 原地修改已有对象属性，确保 Vue Proxy 能精确追踪变更并触发响应式更新
      const aiMsg = messages.value.find(m => m.id === aiMessageId)
      if (aiMsg) {
        aiMsg.content = currentContent
        aiMsg.reasoning = currentReasoning || undefined
        aiMsg.sources = currentSources.length > 0 ? [...currentSources] : undefined
      }
    }

    // 首个来源/思考/正文增量到达时创建占位消息，后续增量走批量刷新
    const ensureMessage = () => {
      if (!hasCreatedMessage) {
        messages.value = [...messages.value, {
          id: aiMessageId,
          role: 'assistant',
          content: currentContent,
          reasoning: currentReasoning || undefined,
          sources: currentSources.length > 0 ? [...currentSources] : undefined,
          timestamp: new Date(),
          status: 'streaming'
        }]
        hasCreatedMessage = true
        return
      }
      if (flushTimer === null) {
        flushTimer = setTimeout(flushContent, CHUNK_FLUSH_INTERVAL)
      }
    }

    function removeMessage(id: string) {
      messages.value = messages.value.filter(m => m.id !== id)
    }

    try {
      // 唯一的会话创建入口：发消息时才创建会话
      if (!sessionIdValue) {
        isLoading.value = true
        const { sessionId: newSessionId } = await createSession()
        if (epoch !== streamEpoch) return
        if (!newSessionId) {
          toast.error('创建会话失败，请重试')
          removeMessage(userMessage.id)
          return
        }
        sessionIdValue = newSessionId
        currentSessionId.value = newSessionId
        localStorage.setItem(LAST_SESSION_KEY, newSessionId)
        void loadSessions()
        isLoading.value = false
      }

      const chatMessages: ChatMessage[] = messages.value
        .filter(m => m.role === 'user' || m.status === 'complete')
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }))

      const { promise, abort } = streamChat(chatMessages, {
        sessionId: sessionIdValue,
        webSearch: webSearchEnabled.value,
        // 请求受理（sessionId 事件到达）即建占位消息：
        // 搜索/思考首包前的静默期气泡显示「思考中」，不再空白
        onAccepted: () => {
          if (epoch !== streamEpoch) return
          ensureMessage()
        },
        onChunk: (chunk) => {
          if (epoch !== streamEpoch) return
          if (reasoningStartedAt !== null && reasoningSeconds === null) {
            reasoningSeconds = Math.max(1, Math.round((Date.now() - reasoningStartedAt) / 1000))
          }
          currentContent += chunk
          ensureMessage()
        },
        onReasoning: (chunk) => {
          if (epoch !== streamEpoch) return
          if (reasoningStartedAt === null) reasoningStartedAt = Date.now()
          currentReasoning += chunk
          ensureMessage()
        },
        onSources: (batch) => {
          if (epoch !== streamEpoch) return
          currentSources = currentSources.concat(batch)
          ensureMessage()
        }
      })
      activeStream = { abort }

      const result = await promise

      // 会话已切换/重置：丢弃本次流的结果，避免写入新会话的消息列表
      if (epoch !== streamEpoch) return

      if (flushTimer !== null) {
        clearTimeout(flushTimer)
        flushTimer = null
      }

      if (result.sessionId && result.sessionId !== currentSessionId.value) {
        currentSessionId.value = result.sessionId
        localStorage.setItem(LAST_SESSION_KEY, result.sessionId)
      }

      const aiMsg = messages.value.find(m => m.id === aiMessageId)
      const finalSources = result.sources.length > 0
        ? result.sources
        : currentSources.length > 0 ? [...currentSources] : undefined
      if (result.aborted && !result.content && !result.reasoning && !finalSources) {
        // 未收到任何内容即停止：移除占位消息
        if (aiMsg) removeMessage(aiMessageId)
      } else if (aiMsg) {
        // 原地修改已有对象属性，确保 Vue Proxy 能精确追踪变更并触发响应式更新
        aiMsg.content = result.content
        aiMsg.reasoning = result.reasoning || undefined
        if (reasoningSeconds !== null) aiMsg.reasoningSeconds = reasoningSeconds
        aiMsg.sources = finalSources
        aiMsg.status = 'complete'
        // 正文、思考链、来源全都没有（服务端正常收尾但没输出）时兜底占位文案
        if (!aiMsg.content && !aiMsg.reasoning && !aiMsg.sources) aiMsg.content = 'AI暂无回应'
      } else {
        messages.value = [...messages.value, {
          id: aiMessageId,
          role: 'assistant',
          content: result.content || 'AI暂无回应',
          reasoning: result.reasoning || undefined,
          sources: finalSources,
          timestamp: new Date(),
          status: 'complete'
        }]
      }

      await loadSessions()
    } catch (e) {
      if (flushTimer !== null) clearTimeout(flushTimer)
      if (epoch !== streamEpoch) return

      // 保留用户消息与已收到的部分回复（正文/思考链/来源）便于重试，仅移除空占位消息
      const aiMsg = messages.value.find(m => m.id === aiMessageId)
      if (aiMsg && !aiMsg.content && !aiMsg.reasoning && !(aiMsg.sources?.length)) {
        removeMessage(aiMessageId)
      } else if (aiMsg) {
        aiMsg.status = 'complete'
      }
      // 后端错误信息（ApiError.message）直接展示给用户，其余给通用文案
      toast.error(e instanceof ApiError && e.message ? e.message : '发送消息失败，请重试')
    } finally {
      if (epoch === streamEpoch) {
        activeStream = null
      }
      isSending.value = false
      isLoading.value = false
    }
  }

  /** 停止生成：中止进行中的流，已收到的部分回复会被保留 */
  function stopGeneration() {
    activeStream?.abort()
  }

  /** 重新生成：移除最后一轮问答后重发 */
  function regenerate(): Promise<void> {
    if (isSending.value) return Promise.resolve()
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i]!.role === 'user') {
        const content = messages.value[i]!.content
        messages.value = messages.value.slice(0, i)
        return sendMessage(content)
      }
    }
    return Promise.resolve()
  }

  function clearError() {
    error.value = null
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }

  function openSidebar() {
    sidebarOpen.value = true
  }

  function closeSidebar() {
    sidebarOpen.value = false
  }

  function setSearchQuery(query: string) {
    searchQuery.value = query
  }

  async function init() {
    const healthy = await checkHealth()
    // 健康检查失败也尝试渲染列表（服务端不可达时回退本地缓存）
    await loadSessions()

    if (!healthy) {
      error.value = SERVICE_DOWN_BANNER
      return
    }

    let targetSessionId = localStorage.getItem(LAST_SESSION_KEY)

    // 过滤掉旧代码可能写入的无效值
    if (!targetSessionId || targetSessionId === 'undefined' || targetSessionId === 'null') {
      targetSessionId = null
    }

    if (!targetSessionId && sessions.value.length > 0) {
      targetSessionId = sessions.value[0]!.sessionId
      if (targetSessionId) {
        localStorage.setItem(LAST_SESSION_KEY, targetSessionId)
      }
    }

    if (targetSessionId) {
      try {
        await selectSession(targetSessionId)
      } catch (e) {
        console.error('selectSession failed:', e)
        currentSessionId.value = null
        messages.value = []
        localStorage.removeItem(LAST_SESSION_KEY)
      }
    }
  }

  return {
    sessions,
    currentSessionId,
    messages,
    isLoading,
    isSending,
    error,
    searchQuery,
    sidebarOpen,
    isServiceHealthy,
    webSearchEnabled,
    setWebSearch,
    toggleWebSearch,
    currentSession,
    filteredSessions,
    groupedSessions,
    hasMessages,
    checkHealth,
    loadSessions,
    createNewSession,
    selectSession,
    removeSession,
    renameSession,
    sendMessage,
    stopGeneration,
    regenerate,
    clearError,
    toggleSidebar,
    openSidebar,
    closeSidebar,
    setSearchQuery,
    init
  }
})
