import { get, post, put, del, postStream, getStream } from './request'
import type {
  CreateSessionResponse,
  ChatRequest,
  ChatCompletionResponse,
  StreamChatRequest,
  GenerationCreated,
  GenerationSnapshot,
} from '@/types'

export function createSession(): Promise<CreateSessionResponse> {
  return post('/ai/sessions')
}

// 历史返回格式由服务层归一化，API 层保留原始响应。
export function getSessions(): Promise<unknown> {
  return get('/ai/sessions')
}

export function getSessionMessages(sessionId: string): Promise<unknown> {
  return get(`/ai/sessions/${sessionId}/messages`)
}

export function deleteSession(sessionId: string): Promise<{ message: string }> {
  return del(`/ai/sessions/${sessionId}`)
}

export function updateSessionTitle(sessionId: string, title: string): Promise<{ message: string }> {
  return put(`/ai/sessions/${sessionId}`, { title })
}

export function chatCompletion(data: ChatRequest): Promise<ChatCompletionResponse> {
  return post('/ai/chat', data)
}

export function healthCheck(): Promise<{ status: string }> {
  return get('/ai/health')
}

export function streamChat(data: StreamChatRequest, signal?: AbortSignal): Promise<Response> {
  return postStream('/ai/chat/stream', data, signal)
}

export function createGeneration(data: StreamChatRequest, key: string, signal?: AbortSignal): Promise<GenerationCreated> {
  return post('/ai/generations', data, { headers: { 'Idempotency-Key': key }, signal })
}

export function getGeneration(id: string, signal?: AbortSignal): Promise<GenerationSnapshot> {
  return get(`/ai/generations/${id}`, { signal })
}

export function subscribeGeneration(id: string, afterSeq: number, signal?: AbortSignal): Promise<Response> {
  return getStream(`/ai/generations/${id}/events?afterSeq=${afterSeq}`, signal)
}

export function cancelGeneration(id: string, signal?: AbortSignal): Promise<GenerationSnapshot> {
  return post(`/ai/generations/${id}/cancel`, undefined, { signal })
}
