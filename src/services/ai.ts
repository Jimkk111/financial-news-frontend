import * as aiApi from '@/api/ai'
import { ApiError } from '@/api/request'
import type { ChatMessage, SessionInfo, GenerationRecord, GenerationSnapshot, GenerationHandle, GenerationStatus } from '@/types'
import { extractSseFrames } from '@/utils/sse'
import { readWithIdleTimeout } from '@/utils/stream'
import { normalizeSessions, normalizeChatMessages, normalizeSources } from '@/utils/aiNormalize'

export { deleteSession, updateSessionTitle, chatCompletion, healthCheck } from '@/api/ai'

export async function createSession(): Promise<{ sessionId: string }> {
  const data = await aiApi.createSession()
  return { sessionId: data.sessionId || data.session_id || '' }
}

export async function getSessions(): Promise<SessionInfo[]> {
  return normalizeSessions(await aiApi.getSessions())
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  return normalizeChatMessages(await aiApi.getSessionMessages(sessionId))
}

export function isGenerationTerminal(status: GenerationStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'failed'
}

const cacheKey = (owner: string) => 'aiGenerationTasks:' + owner
const isOnline = () => navigator.onLine !== false

export function readGenerationRecords(owner: string): GenerationRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(cacheKey(owner)) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item): item is GenerationRecord => !!item && typeof item.key === 'string' &&
      !!item.request && Array.isArray(item.request.messages) && typeof item.assistantMessageId === 'string')
  } catch {
    return []
  }
}

export function saveGenerationRecord(owner: string, record: GenerationRecord) {
  const records = readGenerationRecords(owner).filter(item => item.key !== record.key)
  // 创建之前必须保存原始请求及幂等键；保存失败时不发送网络请求。
  localStorage.setItem(cacheKey(owner), JSON.stringify([...records, record]))
}

function forgetGeneration(owner: string, key: string) {
  localStorage.setItem(cacheKey(owner), JSON.stringify(readGenerationRecords(owner).filter(item => item.key !== key)))
}

function httpStatus(error: unknown): number {
  if (error instanceof ApiError) return Number(error.code) || 0
  return Number((error as { response?: { status?: number } })?.response?.status) || 0
}

export function generationErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message
    : (error as { response?: { data?: { msg?: string } } })?.response?.data?.msg || '连接中断，正在恢复对话'
}

/** 持久任务订阅器。abort 只断开订阅，cancel 才请求停止远端任务。 */
export function followGeneration(
  owner: string,
  record: GenerationRecord,
  callbacks: { onUpdate: (record: GenerationRecord) => void; onError: (error: unknown) => void },
): GenerationHandle {
  let detached = false
  let controller: AbortController | undefined
  let wake: (() => void) | undefined
  let retry = 0
  const publish = () => {
    saveGenerationRecord(owner, record)
    callbacks.onUpdate(record)
  }
  const wait = (delay?: number) => new Promise<void>(resolve => {
    let timer: ReturnType<typeof setTimeout> | undefined
    wake = () => {
      if (timer !== undefined) clearTimeout(timer)
      wake = undefined
      resolve()
    }
    if (delay !== undefined) timer = setTimeout(() => wake?.(), delay)
  })
  const online = () => wake?.()
  const offline = () => controller?.abort()
  const adopt = (snapshot: GenerationSnapshot) => {
    if (record.snapshot && snapshot.generationId !== record.snapshot.generationId) {
      throw new ApiError('400', '任务信息不一致，请重新加载会话')
    }
    record.snapshot = { ...snapshot, sources: normalizeSources(snapshot.sources) || [] }
    publish()
  }
  const finish = () => {
    record.cancelPending = false
    record.connection = 'complete'
    record.error = undefined
    publish()
    forgetGeneration(owner, record.key)
    return record.snapshot
  }

  window.addEventListener('online', online)
  window.addEventListener('offline', offline)
  const promise = (async () => {
    try {
      while (!detached) {
        if (!isOnline()) {
          record.connection = record.cancelPending ? 'stop_pending' : 'offline'
          publish()
          await wait()
          continue
        }
        controller = new AbortController()
        try {
          if (!record.snapshot) {
            record.connection = record.cancelPending ? 'stop_pending' : 'creating'
            publish()
            const created = record.retryOf
              ? await aiApi.retryGeneration(record.retryOf, record.key, controller.signal)
              : await aiApi.createGeneration(record.request, record.key, controller.signal)
            // 即使用户刚切换会话，也先保存已接受的任务 ID，避免下次误创建。
            record.snapshot = { ...created, lastSeq: record.retryOf ? 0 : created.lastSeq, content: '', reasoning: '', sources: [], errorCode: null }
            record.startFromZero = !!record.retryOf
            saveGenerationRecord(owner, record)
            if (detached) return undefined
            callbacks.onUpdate(record)
          }
          if (record.cancelPending) {
            record.connection = 'stopping'
            publish()
            adopt(await aiApi.cancelGeneration(record.snapshot.generationId, controller.signal))
            if (detached) return undefined
            if (isGenerationTerminal(record.snapshot.status)) return finish()
            record.cancelPending = false
            publish()
          }
          record.connection = record.snapshot.status === 'cancel_requested' ? 'stopping' : 'connecting'
          publish()
          // 重连总是先用事务快照替换内容和游标，再订阅未读事件。
          const snapshot = record.startFromZero ? record.snapshot :
            await aiApi.getGeneration(record.snapshot.generationId, controller.signal)
          if (detached) return undefined
          adopt(snapshot)
          if (!record.startFromZero && isGenerationTerminal(snapshot.status)) return finish()
          const response = await aiApi.subscribeGeneration(snapshot.generationId, snapshot.lastSeq, controller.signal)
          if (detached) { controller.abort(); return undefined }
          const reader = response.body?.getReader()
          if (!reader) throw new ApiError('500', '无法读取任务进度')
          record.startFromZero = false
          record.connection = snapshot.status === 'cancel_requested' ? 'stopping' : 'connected'
          publish()
          const decoder = new TextDecoder()
          let buffer = ''
          let ended = false
          let gap = false
          try {
            while (!detached && !ended && !gap) {
              const chunk = await readWithIdleTimeout(reader, 45_000, () => new ApiError('408', '任务订阅超时'))
              if (chunk.done) throw new ApiError('500', '任务订阅中断')
              const parsed = extractSseFrames(buffer + decoder.decode(chunk.value, { stream: true }))
              buffer = parsed.rest
              for (const frame of parsed.events) {
                const event = JSON.parse(frame.data) as {
                  generationId?: string; seq?: number; type?: string; status?: GenerationStatus
                  content?: string; reasoning?: string; sources?: unknown; errorCode?: string
                }
                const type = frame.event === 'message' ? event.type : frame.event
                if (event.generationId && event.generationId !== snapshot.generationId) {
                  gap = true
                  break
                }
                if (type === 'end') { ended = true; break }
                if (!['delta', 'completed', 'cancelled', 'failed'].includes(type || '')) continue
                const seq = event.seq ?? Number(frame.id)
                if (!Number.isSafeInteger(seq) || seq > record.snapshot!.lastSeq + 1) {
                  gap = true
                  break
                }
                if (seq <= record.snapshot!.lastSeq) continue
                const current = record.snapshot!
                if (type === 'delta') {
                  current.content += event.content || ''
                  current.reasoning += event.reasoning || ''
                  current.sources.push(...(normalizeSources(event.sources) || []))
                  if (current.status === 'queued') current.status = 'running'
                } else {
                  current.status = type as GenerationStatus
                  current.errorCode = event.errorCode || null
                  ended = true
                }
                // 先应用增量，再把内容和游标作为同一份记录保存。
                current.lastSeq = seq
                retry = 0
                publish()
                if (ended) break
              }
            }
          } finally {
            controller.abort()
            await reader.cancel().catch(() => {})
          }
          if (detached) return undefined
          if (gap) {
            record.connection = 'reconnecting'
            publish()
            continue
          }
          // 终态事件和 end 之后仍读取最终快照；取消前已保存的增量也会在这里补齐。
          controller = new AbortController()
          adopt(await aiApi.getGeneration(snapshot.generationId, controller.signal))
          if (isGenerationTerminal(record.snapshot!.status)) return finish()
        } catch (error) {
          if (detached) return undefined
          const status = httpStatus(error)
          if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
            record.connection = 'error'
            record.error = status === 401 ? '登录已失效，请重新登录后恢复对话' : generationErrorMessage(error)
            publish()
            // 已明确拒绝的创建不会产生任务；只有网络不确定或 401 才保留原请求。
            if (!record.snapshot && status !== 401) forgetGeneration(owner, record.key)
            callbacks.onError(error)
            return undefined
          }
          record.connection = record.cancelPending ? 'stop_pending' :
            record.snapshot?.status === 'cancel_requested' ? 'stopping' : 'reconnecting'
          record.error = undefined
          publish()
          if (isOnline()) await wait(Math.min(1000 * 2 ** retry++, 15_000))
        }
      }
      return undefined
    } finally {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      controller?.abort()
    }
  })()

  return {
    promise,
    abort: () => { detached = true; controller?.abort(); wake?.() },
    cancel: () => {
      const previous = { frozenSnapshot: record.frozenSnapshot, cancelPending: record.cancelPending, connection: record.connection }
      if (record.snapshot) record.frozenSnapshot = JSON.parse(JSON.stringify(record.snapshot)) as GenerationSnapshot
      record.cancelPending = true
      record.connection = navigator.onLine === false ? 'stop_pending' : 'stopping'
      // 保存成功才冻结 UI 和发出取消请求。
      try { publish() } catch (error) { Object.assign(record, previous); throw error }
      controller?.abort()
      wake?.()
    },
  }
}
