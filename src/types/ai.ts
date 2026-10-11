export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** 思考型模型的完整思考链：仅历史消息归一化时填充，不回传后端 */
  reasoning?: string
  /** 联网搜索引用来源：仅历史消息归一化时填充，不回传后端；下标与正文 [n] 引用对应 */
  sources?: AiSource[]
  generationId?: string
  status?: GenerationStatus
  lastSeq?: number
  messageId?: number
  errorCode?: string | null
}

/** 联网搜索引用来源 */
export interface AiSource {
  title: string
  url: string
  summary?: string
  siteName?: string
  publishTime?: string
  logoUrl?: string
}

export interface SessionInfo {
  sessionId: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface CreateSessionResponse {
  sessionId?: string
  session_id?: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  sessionId?: string
  webSearch?: boolean
  stream?: boolean
}

export type StreamChatRequest = Omit<ChatRequest, 'stream'>

export interface ChatCompletionResponse {
  content: string
  sessionId?: string
  reasoning?: string
  sources?: unknown
}

export type GenerationStatus = 'queued' | 'running' | 'cancel_requested' | 'completed' | 'cancelled' | 'failed'

export interface GenerationCreated {
  generationId: string
  sessionId: string
  messageId: number
  status: GenerationStatus
  lastSeq: number
}

export interface GenerationSnapshot extends GenerationCreated {
  content: string
  reasoning: string
  sources: AiSource[]
  errorCode: string | null
}

export type GenerationConnection = 'creating' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'stopping' | 'stop_pending' | 'error' | 'complete'

export interface GenerationRecord {
  key: string
  request: StreamChatRequest
  userMessageId: string
  assistantMessageId: string
  createdAt: string
  snapshot?: GenerationSnapshot
  frozenSnapshot?: GenerationSnapshot
  cancelPending: boolean
  connection: GenerationConnection
  error?: string
}

export interface GenerationHandle {
  promise: Promise<GenerationSnapshot | undefined>
  /** 只关闭本机订阅，不取消服务端任务。 */
  abort: () => void
  /** 持久化取消意图，再调用服务端取消接口。 */
  cancel: () => void
}

/** 聊天气泡的视图模型（在 ChatMessage 基础上增加渲染所需的展示字段） */
export type MessageStatus = 'streaming' | 'complete'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** 思考链增量拼接结果，非思考型模型为空 */
  reasoning?: string
  /** 思考耗时（秒），正文开始到达时记录，用于「已深度思考（用时 X 秒）」 */
  reasoningSeconds?: number
  /** 联网搜索引用来源，未开搜索或模型未触发搜索时缺失 */
  sources?: AiSource[]
  timestamp: Date
  status?: MessageStatus
  generationId?: string
  generationStatus?: GenerationStatus
  lastSeq?: number
  errorCode?: string | null
}
