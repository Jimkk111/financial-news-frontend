import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'

// ============================================================
// 统一 Axios 实例
// ============================================================

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

const request: AxiosInstance = axios.create({
  baseURL,
  timeout: 10000,
  // JWT 改用 HttpOnly Cookie 传输：跨域请求需携带凭据（Cookie）
  withCredentials: true,
})

function clearAuthState() {
  // Axios 和 fetch 共用登录失效处理。
  import('@/stores/auth')
    .then(({ useAuthStore }) => useAuthStore().clearAuth())
    .catch(() => {})
}

// ---------- 响应拦截器：解包统一响应壳 + 401 处理 ----------
// 后端统一格式：{ code: string, data: T, msg: string }
// code === "200" 表示成功，其他为业务错误

request.interceptors.response.use(
  (response) => {
    const body = response.data

    // 非标准包装格式，直接透传（兼容 SSE、blob 等非 JSON 场景）
    if (!body || typeof body !== 'object' || !('code' in body)) {
      return body
    }

    // 业务失败 —— 统一抛 ApiError
    // VALIDATION_ERROR 时 data 为字段错误数组，传给 details 供表单展示
    if (body.code !== '200') {
      if (String(body.code) === '401') clearAuthState()
      return Promise.reject(
        new ApiError(
          body.code,
          body.msg || '请求失败',
          Array.isArray(body.data) ? body.data : undefined,
        ),
      )
    }

    // 成功 —— 解包 data
    const inner = body.data

    // 分页响应：data 含 records 时，映射为 { data, pagination } 结构与现有代码对齐
    if (inner && typeof inner === 'object' && 'records' in inner) {
      return {
        data: inner.records,
        pagination: {
          page: inner.page,
          pageSize: inner.pageSize,
          total: inner.total,
          totalPages: Math.ceil(inner.total / inner.pageSize),
        },
      }
    }

    // 普通响应 —— 直接返回 data
    return inner
  },
  (error) => {
    if (error.response?.status === 401) {
      // 401 表示 Cookie 失效/过期：清空内存登录态，由路由守卫拦截跳转登录页
      clearAuthState()
    }
    return Promise.reject(error)
  },
)

// ============================================================
// ApiError —— 业务错误
// ============================================================

export class ApiError extends Error {
  code: string
  details?: Array<{ field: string; message: string }>

  constructor(
    code: string,
    message: string,
    details?: Array<{ field: string; message: string }>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
  }
}

// ============================================================
// 类型
// ============================================================

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

// ============================================================
// 基础 HTTP 方法（在 axios 实例之上按业务习惯封装）
// ============================================================

export function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return request.get(url, config) as Promise<T>
}

export function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return request.post(url, data, config) as Promise<T>
}

export function put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return request.put(url, data, config) as Promise<T>
}

export function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return request.delete(url, config) as Promise<T>
}

export function getPaginated<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<PaginatedResponse<T>> {
  return request.get(url, config) as Promise<PaginatedResponse<T>>
}

// ============================================================
// Streaming / fetch 场景辅助工具
// 对于 SSE 等 axios 无法原生支持的场景，提供统一的方式拼接 URL
// ============================================================

/** 根据相对路径拼接完整请求 URL */
export function resolveUrl(path: string): string {
  return `${baseURL}${path}`
}

/** 发起 SSE 请求，统一携带 Cookie 并处理 HTTP 错误；事件消费交给服务层。 */
export async function postStream(url: string, data: unknown, signal?: AbortSignal): Promise<Response> {
  return requestStream(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
    signal,
  })
}

export function getStream(url: string, signal?: AbortSignal): Promise<Response> {
  return requestStream(url, { method: 'GET', credentials: 'include', signal })
}

async function requestStream(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(resolveUrl(url), init)

  if (!response.ok) {
    const body = await response.json().catch(() => null) as {
      msg?: unknown
      error?: { message?: unknown }
    } | null
    if (response.status === 401) clearAuthState()
    const message = typeof body?.msg === 'string' && body.msg
      ? body.msg
      : typeof body?.error?.message === 'string' && body.error.message
        ? body.error.message
        : `请求失败（${response.status}）`
    throw new ApiError(String(response.status), message)
  }

  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new ApiError('500', '响应不是流式数据')
  }

  return response
}

export default request
