import { ApiError } from '@/api/request'

/**
 * 从接口调用抛出的错误中提取可展示的文案：
 * ApiError（业务错误）取后端 msg，其余（网络错误等）用调用方提供的兜底文案
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback
}
