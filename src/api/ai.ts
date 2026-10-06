import { get, post, put, del, resolveUrl, ApiError } from './request'
import type { AiSource, ChatMessage, SessionInfo } from '@/types'
import { extractSseEvents } from '@/utils/sse'
import {
  asRecord,
  normalizeSessions,
  normalizeChatMessages,
  normalizeSources,
} from '@/utils/aiNormalize'

// ============================================================
// 会话管理
// ============================================================

export async function createSession(): Promise<{ sessionId: string }> {
  const data = await post<{ sessionId?: string; session_id?: string }>('/ai/sessions')
  return { sessionId: data.sessionId || data.session_id || '' }
}

export async function getSessions(): Promise<SessionInfo[]> {
  return normalizeSessions(await get<unknown>('/ai/sessions'))
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  return normalizeChatMessages(await get<unknown>(`/ai/sessions/${sessionId}/messages`))
}

export async function deleteSession(sessionId: string): Promise<{ message: string }> {
  return del<{ message: string }>(`/ai/sessions/${sessionId}`)
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<{ message: string }> {
  return put<{ message: string }>(`/ai/sessions/${sessionId}`, { title })
}

export async function chatCompletion(data: {
  messages: ChatMessage[]
  sessionId?: string
  webSearch?: boolean
  stream?: boolean
}): Promise<{ content: string; sessionId?: string; reasoning?: string; sources?: unknown }> {
  return post<{ content: string; sessionId?: string; reasoning?: string; sources?: unknown }>(
    '/ai/chat',
    data,
  )
}

export async function healthCheck(): Promise<{ status: string }> {
  return get<{ status: string }>('/ai/health')
}

// ============================================================
// 流式对话
// 后端契约：POST /ai/chat/stream（SseEmitter，JWT 走 HttpOnly Cookie）
//   data: {"sessionId": "..."} 请求受理即发送（绑定会话）
//   data: {"sources": [...]}   联网搜索引用来源批次，webSearch 时随上游首包到达（可能多批）
//   data: {"reasoning": "..."} 思考链增量，出现在正文之前（思考型模型）
//   data: {"content": "..."}   逐段正文；开搜索后正文内含 [n] 引用编号，与 sources 下标对应
//   data: {"error": "..."}     仅异常场景（如只有思考链没有正文），发送后仍会 [DONE]
//   data: [DONE]              正常结束标记
// 搜索由模型意图识别触发，开启 webSearch 也可能没有 sources 事件，按「有就渲染」处理。
// 静默期后端每 15s 发送注释行 ":keep-alive"，extractSseEvents 只取 data: 行天然忽略。
// 失败时后端 completeWithError 直接断流（不会发 [DONE]）；
// 也兼容显式 { error } 事件的实现。错误统一走 { code, msg } 响应壳。
// ============================================================

export interface StreamChatResult {
  /** 累积的完整回复内容 */
  content: string
  /** 累积的完整思考链，非思考型模型为空串 */
  reasoning: string
  /** 累积的全部引用来源（多批合并），未开搜索为空数组 */
  sources: AiSource[]
  sessionId?: string
  /** true 表示被调用方主动中止（保留已收到的部分内容） */
  aborted: boolean
}

export interface StreamChatOptions {
  /** 关联会话；新会话首条消息由后端建会话后经 sessionId 事件回传 */
  sessionId?: string
  /** 开启联网搜索（意图识别模式下模型自行判断是否真的搜索） */
  webSearch?: boolean
  /** 请求受理信号：sessionId 事件到达时触发（新契约在流首，可提前渲染等待态） */
  onAccepted?: (sessionId: string) => void
  /** 正文增量回调 */
  onChunk: (chunk: string) => void
  /** 思考链增量回调 */
  onReasoning?: (chunk: string) => void
  /** 引用来源批次回调：sources 事件可能分多批到达，每次回调本批增量 */
  onSources?: (batch: AiSource[]) => void
}

export interface StreamChatHandle {
  promise: Promise<StreamChatResult>
  abort: () => void
}

const IDLE_TIMEOUT = 30_000 // 30 秒无新数据视为连接异常；任一字节到达（含心跳注释行）即重置
// 联网搜索时模型先搜索再思考，首个事件合法地可能超 30s，放宽一倍避免误杀
const WEB_SEARCH_IDLE_TIMEOUT = 60_000

function extractErrorMessage(body: unknown, status: number): string {
  const source = asRecord(body)
  if (source) {
    // 统一响应壳 { code, msg }，兼容旧格式 { error: { message } }
    const msg = source.msg
    if (typeof msg === 'string' && msg) return msg
    const error = asRecord(source.error)
    const message = error ? error.message : undefined
    if (typeof message === 'string' && message) return message
  }
  return `请求失败（${status}）`
}

function clearAuthState() {
  // 与 axios 拦截器保持一致：401 时清空内存登录态，由路由守卫拦截跳转登录页
  import('@/stores/auth')
    .then(({ useAuthStore }) => useAuthStore().clearAuth())
    .catch(() => {})
}

/** 带空闲超时的单次 read：超时主动 abort 连接并抛错，定时器保证被清理 */
function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
  idleTimeout: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    reader.read(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new ApiError('408', 'AI 响应超时，请重试'))
        // 超时后中止底层连接，避免资源悬挂
        if (!signal.aborted) {
          try {
            reader.cancel().catch(() => {})
          } catch {
            // ignore
          }
        }
      }, idleTimeout)
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

export function streamChat(messages: ChatMessage[], options: StreamChatOptions): StreamChatHandle {
  const { onChunk, onReasoning, onSources, onAccepted } = options
  const controller = new AbortController()

  const promise = (async (): Promise<StreamChatResult> => {
    let content = ''
    let reasoning = ''
    const sources: AiSource[] = []
    let receivedSessionId: string | undefined

    const finalize = (aborted: boolean): StreamChatResult => ({
      content,
      reasoning,
      sources: [...sources],
      sessionId: receivedSessionId,
      aborted,
    })

    try {
      const response = await fetch(resolveUrl('/ai/chat/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // webSearch 关闭时不带该字段，保持旧请求体不变
        body: JSON.stringify({
          messages,
          sessionId: options.sessionId,
          ...(options.webSearch ? { webSearch: true } : {}),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        if (response.status === 401) clearAuthState()
        throw new ApiError(String(response.status), extractErrorMessage(body, response.status))
      }

      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('text/event-stream')) {
        throw new ApiError('500', '响应不是流式数据')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new ApiError('500', '无法读取响应')
      }

      const decoder = new TextDecoder()
      let buffer = ''
      // 兼容以显式 { error } 事件报告失败的实现（当前后端是直接断流）
      let streamError: string | undefined

      const consumeEvents = (events: string[]): boolean => {
        // 返回 true 表示流正常结束（收到 [DONE]）
        for (const data of events) {
          if (data === '[DONE]') return true
          try {
            const parsed = JSON.parse(data) as {
              content?: unknown
              reasoning?: unknown
              sources?: unknown
              sessionId?: unknown
              error?: unknown
            }
            if (typeof parsed.error === 'string' && parsed.error) {
              streamError = parsed.error
            }
            const batch = normalizeSources(parsed.sources)
            if (batch) {
              sources.push(...batch)
              onSources?.(batch)
            }
            if (typeof parsed.reasoning === 'string' && parsed.reasoning) {
              reasoning += parsed.reasoning
              onReasoning?.(parsed.reasoning)
            }
            if (typeof parsed.content === 'string' && parsed.content) {
              content += parsed.content
              onChunk(parsed.content)
            }
            if (typeof parsed.sessionId === 'string' && parsed.sessionId) {
              receivedSessionId = parsed.sessionId
              onAccepted?.(parsed.sessionId)
            }
          } catch {
            // 非 JSON 的 data 行，跳过
          }
        }
        return false
      }

      // 搜索阶段上游可能长时间不发首包，空闲超时按是否联网搜索取值
      const idleTimeout = options.webSearch ? WEB_SEARCH_IDLE_TIMEOUT : IDLE_TIMEOUT

      let done = false
      while (!done) {
        const result = await readWithIdleTimeout(reader, controller.signal, idleTimeout)
        if (result.done) break

        const { events, rest } = extractSseEvents(buffer + decoder.decode(result.value, { stream: true }))
        buffer = rest
        done = consumeEvents(events)
      }

      // 流结束但未收到 [DONE]，把残余不完整行也消费掉
      if (!done) {
        const { events } = extractSseEvents(buffer, true)
        done = consumeEvents(events)
      }

      // 流内错误优先于部分内容：交由调用方展示后端错误信息
      if (streamError) {
        throw new ApiError('500', streamError)
      }

      // 后端 completeWithError / 网关超时等会直接断流，不会发 [DONE]：
      // 此时回复不完整，按错误处理（已收到的部分内容由调用方保留展示）
      if (!done) {
        throw new ApiError('500', content ? 'AI 响应中断，内容可能不完整' : 'AI 服务连接中断，请重试')
      }

      return finalize(false)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // 调用方主动停止：保留已收到的部分内容
        return finalize(true)
      }
      throw error
    }
  })()

  return { promise, abort: () => controller.abort() }
}
