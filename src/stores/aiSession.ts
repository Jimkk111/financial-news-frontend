import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import type { ChatMessage, Message, SessionInfo, GenerationRecord, GenerationHandle } from '@/types'
import { ApiError } from '@/api/request'
import { toast } from '@/utils/toast'
import { useAuthStore } from './auth'
import {
  getSessions, getSessionMessages, deleteSession, updateSessionTitle, healthCheck,
  readGenerationRecords, saveGenerationRecord, followGeneration, isGenerationTerminal, generationErrorMessage,
} from '@/services/ai'

export interface SessionGroup {
  label: string
  key: string
  sessions: SessionInfo[]
}

function createMessageId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID() : 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)
}

export const useAiSessionStore = defineStore('aiSession', () => {
  const auth = useAuthStore()
  const owner = computed(() => auth.user?.uid || '')
  const sessions = ref<SessionInfo[]>([])
  const currentSessionId = ref<string | null>(null)
  const messages = ref<Message[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const searchQuery = ref('')
  const sidebarOpen = ref(false)
  const isServiceHealthy = ref<boolean | null>(null)
  const pendingNewsQuestion = ref('')
  const needsLogin = ref(false)
  const records = ref<Record<string, GenerationRecord>>({})
  const handles = new Map<string, GenerationHandle>()
  const renderTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const draftTaskKey = ref<string | null>(null)
  let viewEpoch = 0
  let initializedOwner = ''
  let initPromise: Promise<void> | undefined
  const lastSessionKey = () => 'aiAssistantLastSessionId:' + owner.value
  const sessionsKey = () => 'aiAssistantConversations:' + owner.value
  const currentRecord = computed(() => Object.values(records.value).reverse().find(record =>
    draftTaskKey.value === record.key ||
    (!!currentSessionId.value && (record.snapshot?.sessionId || record.request.sessionId) === currentSessionId.value &&
      (!record.snapshot || !isGenerationTerminal(record.snapshot.status) || record.connection !== 'complete'))))
  const isSending = computed(() => !!currentRecord.value &&
    (!currentRecord.value.snapshot || !isGenerationTerminal(currentRecord.value.snapshot.status) || currentRecord.value.connection !== 'complete'))
  const isStopping = computed(() => !!currentRecord.value &&
    (currentRecord.value.cancelPending || currentRecord.value.snapshot?.status === 'cancel_requested'))
  const connectionNotice = computed(() => {
    const record = currentRecord.value
    if (!record) return ''
    if (record.error) return record.error
    if (record.connection === 'stop_pending') return '停止请求待同步，联网后会自动发送'
    if (record.connection === 'offline') return '网络已断开，联网后会自动恢复对话'
    if (record.connection === 'reconnecting') return '连接中断，正在恢复对话…'
    if (isStopping.value) return '正在停止，等待服务器确认…'
    if (record.connection === 'creating') return '正在提交提问…'
    return ''
  })
  const canRetryConnection = computed(() => currentRecord.value?.connection === 'error')
  const webSearchEnabled = ref(localStorage.getItem('aiAssistantWebSearch') === '1')

  function queueNewsQuestion(content: string) { pendingNewsQuestion.value = content.trim() }
  function setWebSearch(enabled: boolean) {
    webSearchEnabled.value = enabled
    try { localStorage.setItem('aiAssistantWebSearch', enabled ? '1' : '0') } catch { /* 内存开关仍生效 */ }
  }
  function toggleWebSearch() { setWebSearch(!webSearchEnabled.value) }

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
    try {
      await healthCheck()
      isServiceHealthy.value = true
      return true
    } catch {
      isServiceHealthy.value = false
      return false
    }
  }

  async function loadSessions() {
    const taskOwner = owner.value
    try {
      const data = await getSessions()
      if (taskOwner !== owner.value) return
      sessions.value = [...data].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      localStorage.setItem(sessionsKey(), JSON.stringify(sessions.value))
    } catch {
      if (taskOwner !== owner.value || sessions.value.length) return
      try { sessions.value = JSON.parse(localStorage.getItem(sessionsKey()) || '[]') } catch { sessions.value = [] }
    }
  }

  function displayRecord(record: GenerationRecord) {
    const snapshot = record.snapshot
    const belongs = draftTaskKey.value === record.key ||
      (!!currentSessionId.value && (snapshot?.sessionId || record.request.sessionId) === currentSessionId.value)
    if (!belongs) return
    if (snapshot && draftTaskKey.value === record.key) {
      currentSessionId.value = snapshot.sessionId
      draftTaskKey.value = null
      localStorage.setItem(lastSessionKey(), snapshot.sessionId)
    }
    let ai = messages.value.find(message => message.id === record.assistantMessageId ||
      (snapshot && message.generationId === snapshot.generationId))
    if (!ai) {
      const question = [...record.request.messages].reverse().find(message => message.role === 'user')
      const last = messages.value[messages.value.length - 1]
      if (question && !messages.value.some(message => message.id === record.userMessageId) &&
        !(last?.role === 'user' && last.content === question.content)) {
        messages.value.push({ id: record.userMessageId, role: 'user', content: question.content,
          timestamp: new Date(record.createdAt), status: 'complete' })
      }
      ai = { id: record.assistantMessageId, role: 'assistant', content: '', timestamp: new Date(record.createdAt), status: 'streaming' }
      messages.value.push(ai)
      ai = messages.value[messages.value.length - 1]!
    }
    if (snapshot) {
      const terminal = isGenerationTerminal(snapshot.status) && record.connection === 'complete'
      const frozen = !!record.frozenSnapshot || record.cancelPending || snapshot.status === 'cancel_requested'
      const displayed = frozen && !terminal ? record.frozenSnapshot || snapshot : snapshot
      ai.content = displayed.content
      ai.reasoning = displayed.reasoning || undefined
      ai.sources = [...displayed.sources]
      ai.lastSeq = displayed.lastSeq
      ai.generationId = snapshot.generationId
      ai.generationStatus = snapshot.status
      ai.errorCode = snapshot.errorCode
      ai.status = terminal || frozen ? 'complete' : 'streaming'
      if (terminal && snapshot.status === 'completed' && !ai.content && !ai.reasoning && !ai.sources?.length) ai.content = 'AI暂无回应'
    }
  }

  function attachRecord(record: GenerationRecord) {
    const taskOwner = owner.value
    records.value = { ...records.value, [record.key]: record }
    displayRecord(record)
    if (handles.has(record.key)) return
    let acceptedSessionId = record.snapshot?.sessionId
    const handle = followGeneration(taskOwner, record, {
      onUpdate: update => {
        if (owner.value !== taskOwner) return
        const acceptedSession = update.snapshot?.sessionId
        records.value = { ...records.value, [update.key]: { ...update } }
        if (acceptedSession && !acceptedSessionId) {
          acceptedSessionId = acceptedSession
          void loadSessions()
        }
        const timer = renderTimers.get(update.key)
        const immediate = update.connection !== 'connected' || update.cancelPending ||
          (update.snapshot && isGenerationTerminal(update.snapshot.status))
        if (immediate) {
          if (timer) clearTimeout(timer)
          renderTimers.delete(update.key)
          displayRecord(update)
        } else if (!timer) {
          renderTimers.set(update.key, setTimeout(() => {
            renderTimers.delete(update.key)
            if (owner.value === taskOwner) displayRecord(update)
          }, 50))
        }
      },
      onError: failure => {
        if (owner.value !== taskOwner) return
        const unauthorized = failure instanceof ApiError ? failure.code === '401' :
          (failure as { response?: { status?: number } })?.response?.status === 401
        if (unauthorized) needsLogin.value = true
        error.value = record.error || generationErrorMessage(failure)
        if (!record.snapshot && !unauthorized) {
          const nextRecords = { ...records.value }
          delete nextRecords[record.key]
          records.value = nextRecords
          if (draftTaskKey.value === record.key) draftTaskKey.value = null
          const ai = messages.value.find(message => message.id === record.assistantMessageId)
          if (ai) { ai.status = 'complete'; ai.generationStatus = 'failed' }
        }
      },
    })
    handles.set(record.key, handle)
    void handle.promise.then(result => {
      if (owner.value === taskOwner && result) void loadSessions()
    }).catch(failure => {
      if (owner.value !== taskOwner) return
      records.value = { ...records.value, [record.key]: { ...record, connection: 'error', error: '保存任务状态失败，请释放浏览器存储空间后重试' } }
      error.value = generationErrorMessage(failure)
    }).finally(() => {
      if (handles.get(record.key) === handle) handles.delete(record.key)
    })
  }

  function createNewSession() {
    viewEpoch++
    draftTaskKey.value = null
    currentSessionId.value = null
    messages.value = []
    error.value = null
    isLoading.value = false
    localStorage.removeItem(lastSessionKey())
  }

  async function selectSession(sessionId: string) {
    if (currentSessionId.value === sessionId && (messages.value.length || isSending.value)) return
    const epoch = ++viewEpoch
    draftTaskKey.value = null
    sidebarOpen.value = false
    currentSessionId.value = sessionId
    messages.value = []
    error.value = null
    isLoading.value = true
    localStorage.setItem(lastSessionKey(), sessionId)
    // 离线时也先展示本机持久化的当前任务。
    for (const record of Object.values(records.value)) displayRecord(record)
    try {
      const history = await getSessionMessages(sessionId)
      if (epoch !== viewEpoch) return
      messages.value = history.map((msg, index) => ({
        id: msg.messageId != null ? String(msg.messageId) : sessionId + '-' + index,
        role: msg.role, content: msg.content, reasoning: msg.reasoning, sources: msg.sources,
        generationId: msg.generationId, generationStatus: msg.status, lastSeq: msg.lastSeq,
        errorCode: msg.errorCode,
        timestamp: new Date(), status: msg.status && !isGenerationTerminal(msg.status) ? 'streaming' : 'complete',
      }))
      for (const msg of history) {
        if (msg.role !== 'assistant' || !msg.generationId || !msg.status || isGenerationTerminal(msg.status)) continue
        if (Object.values(records.value).some(record => record.snapshot?.generationId === msg.generationId)) continue
        const record: GenerationRecord = {
          key: 'recovered:' + msg.generationId, request: { sessionId, messages: [] },
          userMessageId: '', assistantMessageId: msg.messageId != null ? String(msg.messageId) : createMessageId(),
          createdAt: new Date().toISOString(), cancelPending: false, connection: 'connecting',
          snapshot: {
            generationId: msg.generationId, sessionId, messageId: msg.messageId || 0, status: msg.status,
            content: msg.content, reasoning: msg.reasoning || '', sources: msg.sources || [], lastSeq: msg.lastSeq || 0, errorCode: msg.errorCode || null,
          },
        }
        saveGenerationRecord(owner.value, record)
        attachRecord(record)
      }
      for (const record of Object.values(records.value)) displayRecord(record)
    } catch {
      if (epoch === viewEpoch && !messages.value.length) error.value = '加载会话失败，请重试'
    } finally {
      if (epoch === viewEpoch) isLoading.value = false
    }
  }

  async function removeSession(sessionId: string): Promise<boolean> {
    const pending = Object.values(records.value).find(record =>
      (record.snapshot?.sessionId || record.request.sessionId) === sessionId &&
      (!record.snapshot || !isGenerationTerminal(record.snapshot.status)))
    if (pending) { toast.warning('该会话仍在生成，请先停止并等待服务器确认'); return false }
    try {
      await deleteSession(sessionId)
      await loadSessions()
      if (currentSessionId.value === sessionId) createNewSession()
      return true
    } catch (failure) {
      toast.error((failure as { response?: { status?: number } })?.response?.status === 409 ?
        '该会话仍在生成，请先停止并等待服务器确认' : '删除会话失败，请重试')
      return false
    }
  }

  async function renameSession(sessionId: string, title: string): Promise<boolean> {
    try { await updateSessionTitle(sessionId, title); await loadSessions(); return true }
    catch { toast.error('修改会话标题失败，请重试'); return false }
  }

  async function sendMessage(content: string) {
    const trimmed = content.trim()
    if (!trimmed || isSending.value || isLoading.value) return
    if (!owner.value) { needsLogin.value = true; return }
    const userId = createMessageId()
    const requestMessages: ChatMessage[] = messages.value
      .filter(msg => msg.role === 'user' || (msg.status === 'complete' && (!msg.generationStatus || isGenerationTerminal(msg.generationStatus))))
      .map(msg => ({ role: msg.role, content: msg.content }))
    requestMessages.push({ role: 'user', content: trimmed })
    const record: GenerationRecord = {
      key: createMessageId(), userMessageId: userId, assistantMessageId: createMessageId(),
      createdAt: new Date().toISOString(), cancelPending: false, connection: 'creating',
      request: { messages: requestMessages.slice(-20), webSearch: webSearchEnabled.value,
        ...(currentSessionId.value ? { sessionId: currentSessionId.value } : {}) },
    }
    try { saveGenerationRecord(owner.value, record) }
    catch { toast.error('无法保存提问，请允许浏览器本地存储或释放空间后重试'); return }
    messages.value.push({ id: userId, role: 'user', content: trimmed, timestamp: new Date(), status: 'complete' })
    if (!currentSessionId.value) draftTaskKey.value = record.key
    error.value = null
    attachRecord(record)
  }

  function stopGeneration() {
    const record = currentRecord.value
    if (!record || isStopping.value) return
    try {
      if (!handles.has(record.key)) attachRecord(record)
      handles.get(record.key)?.cancel()
    }
    catch { toast.error('无法保存停止请求，请释放浏览器存储空间后重试') }
  }

  function retryConnection() {
    const record = currentRecord.value
    if (!record || handles.has(record.key)) return
    record.error = undefined
    error.value = null
    attachRecord(record)
  }

  async function regenerate() {
    if (isSending.value) return
    const lastQuestion = [...messages.value].reverse().find(msg => msg.role === 'user')
    // 后端会保存新一轮问答，保留上一轮消息并使用新幂等键。
    if (lastQuestion) await sendMessage(lastQuestion.content)
  }

  function clearError() { error.value = null }
  function toggleSidebar() { sidebarOpen.value = !sidebarOpen.value }
  function openSidebar() { sidebarOpen.value = true }
  function closeSidebar() { sidebarOpen.value = false }
  function setSearchQuery(query: string) { searchQuery.value = query }

  async function initializeOwner(skipHistory: boolean) {
    const taskOwner = owner.value
    const persisted = readGenerationRecords(taskOwner)
    records.value = Object.fromEntries(persisted.map(record => [record.key, record]))
    const lastSession = localStorage.getItem(lastSessionKey())
    if (!skipHistory) {
      currentSessionId.value = lastSession && !['undefined', 'null'].includes(lastSession) ? lastSession :
        persisted[persisted.length - 1]?.snapshot?.sessionId || persisted[persisted.length - 1]?.request.sessionId || null
      const draft = persisted.find(record => !record.snapshot && !record.request.sessionId)
      if (!currentSessionId.value && draft) {
        draftTaskKey.value = draft.key
        const content = [...draft.request.messages].reverse().find(msg => msg.role === 'user')?.content || ''
        messages.value.push({ id: draft.userMessageId, role: 'user', content, timestamp: new Date(draft.createdAt), status: 'complete' })
      }
      for (const record of persisted) displayRecord(record)
    }
    for (const record of persisted) attachRecord(record)
    await Promise.all([checkHealth(), loadSessions()])
    if (owner.value !== taskOwner) return
    if (!skipHistory) {
      const target = currentSessionId.value || sessions.value[0]?.sessionId
      if (target) {
        // 强制首次读取历史，之后的切页返回不再恢复覆盖内存消息。
        currentSessionId.value = null
        await selectSession(target)
      }
    }
    initializedOwner = taskOwner
  }

  async function init() {
    const newsQuestion = pendingNewsQuestion.value
    pendingNewsQuestion.value = ''
    await auth.init()
    if (!owner.value) { needsLogin.value = true; return }
    needsLogin.value = false
    if (initializedOwner !== owner.value) {
      if (!initPromise) initPromise = initializeOwner(!!newsQuestion).finally(() => { initPromise = undefined })
      await initPromise
    }
    if (newsQuestion) { createNewSession(); await sendMessage(newsQuestion) }
  }

  watch(owner, () => {
    needsLogin.value = !owner.value
    error.value = null
    viewEpoch++
    for (const handle of handles.values()) handle.abort()
    handles.clear()
    for (const timer of renderTimers.values()) clearTimeout(timer)
    renderTimers.clear()
    records.value = {}
    sessions.value = []
    messages.value = []
    currentSessionId.value = null
    draftTaskKey.value = null
    initializedOwner = ''
    initPromise = undefined
    isLoading.value = false
  }, { flush: 'sync' })

  return {
    sessions, currentSessionId, messages, isLoading, isSending, isStopping, error, searchQuery,
    sidebarOpen, isServiceHealthy, pendingNewsQuestion, needsLogin, connectionNotice, canRetryConnection,
    webSearchEnabled, setWebSearch, toggleWebSearch, queueNewsQuestion, currentSession,
    filteredSessions, groupedSessions, hasMessages, checkHealth, loadSessions, createNewSession,
    selectSession, removeSession, renameSession, sendMessage, stopGeneration, retryConnection,
    regenerate, clearError, toggleSidebar, openSidebar, closeSidebar, setSearchQuery, init,
  }
})
