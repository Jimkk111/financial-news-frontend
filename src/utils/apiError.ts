import { ApiError } from '@/api/request'
import axios from 'axios'

/**
 * 从接口调用抛出的错误中提取可展示的文案：
 * 业务错误和 HTTP 错误优先取后端 msg；大小、超时错误提供明确提示，其余使用兜底文案
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) return error.message
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.msg
    if (typeof message === 'string' && message) return message
    if (error.response?.status === 413) return '文件过大，请缩小文件后重试'
    if (error.code === 'ECONNABORTED') return '请求超时，请检查网络后重试'
  }
  return fallback
}
