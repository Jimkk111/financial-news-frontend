import type { AiSource, ChatMessage, SessionInfo } from '@/types'

// ============================================================
// AI 接口字段归一化
// 后端接口历史上存在 snake_case / camelCase 及包装结构混用，
// 统一在本层归一化为前端类型，调用方不再做兜底转换。
// ============================================================

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function pickString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value) return value
  }
  return ''
}

export function normalizeSession(raw: unknown): SessionInfo {
  const source = asRecord(raw)
  const fallback = new Date().toISOString()
  return {
    sessionId: source ? pickString(source, ['sessionId', 'session_id', 'id']) : '',
    title: (source ? pickString(source, ['title']) : '') || '未命名会话',
    createdAt: source ? pickString(source, ['createdAt', 'created_at']) || fallback : fallback,
    updatedAt: source ? pickString(source, ['updatedAt', 'updated_at']) || fallback : fallback,
  }
}

/** 兼容 数组 / { sessions } / { data } 三种返回形态 */
function unwrapList(raw: unknown, keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw
  const source = asRecord(raw)
  if (!source) return []
  for (const key of keys) {
    const value = source[key]
    if (Array.isArray(value)) return value
  }
  return []
}

export function normalizeSessions(raw: unknown): SessionInfo[] {
  return unwrapList(raw, ['sessions', 'data']).map(normalizeSession)
}

export function normalizeChatMessages(raw: unknown): ChatMessage[] {
  return unwrapList(raw, ['messages', 'data'])
    .map((item) => {
      const source = asRecord(item)
      if (!source) return null
      const role = source.role === 'assistant' ? 'assistant' : 'user'
      const content = typeof source.content === 'string' ? source.content : ''
      if (!content) return null
      // 思考型模型的 assistant 回复带完整思考链，兼容 camelCase / snake_case，可能缺失
      const reasoning = pickString(source, ['reasoningContent', 'reasoning_content'])
      const sources = normalizeSources(source.sources)
      return {
        role,
        content,
        ...(reasoning ? { reasoning } : {}),
        ...(sources ? { sources } : {}),
      }
    })
    .filter((item): item is ChatMessage => item !== null)
}

function normalizeAiSource(raw: unknown): AiSource | null {
  const source = asRecord(raw)
  if (!source) return null
  const url = pickString(source, ['url'])
  if (!url) return null
  return {
    url,
    title: pickString(source, ['title']) || url,
    summary: pickString(source, ['summary']) || undefined,
    siteName: pickString(source, ['siteName', 'site_name']) || undefined,
    publishTime: pickString(source, ['publishTime', 'publish_time']) || undefined,
    logoUrl: pickString(source, ['logoUrl', 'logo_url']) || undefined,
  }
}

/**
 * 归一化引用来源：流式事件与非流式响应为 JSON 数组，
 * 历史接口为 JSON 字符串（DB 列原样返回），统一解析并过滤无效项
 */
export function normalizeSources(raw: unknown): AiSource[] | undefined {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return undefined
    }
  }
  if (!Array.isArray(value)) return undefined
  const sources = value.map(normalizeAiSource).filter((item): item is AiSource => item !== null)
  return sources.length > 0 ? sources : undefined
}
