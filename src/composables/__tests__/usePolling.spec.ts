import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/request'

vi.mock('@/utils/toast', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
  errorMessage: vi.fn((_e: unknown, fallback: string) => fallback),
}))

import { usePolling } from '../usePolling'
import { toast } from '@/utils/toast'

const toastMock = vi.mocked(toast)

/** flushPromises 替代：当前 vitest 版本无 vi.flushPromises，微任务链冲刷 3 层足够 */
async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

// 在组件上下文之外调用（getCurrentInstance() 为空），
// 生命周期钩子被跳过，visibilitychange 监听需手动清理由 pause 后无需关心——
// 这里通过 mock document.addEventListener 获取监听器以便测试与清理
let visibilityHandler: (() => void) | null = null
const addEventSpy = vi.spyOn(document, 'addEventListener')
const removeEventSpy = vi.spyOn(document, 'removeEventListener')

function fireVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  visibilityHandler?.()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  addEventSpy.mockClear()
  removeEventSpy.mockClear()
  visibilityHandler = null
  addEventSpy.mockImplementation(((type: string, listener: () => void) => {
    if (type === 'visibilitychange') visibilityHandler = listener
  }) as typeof document.addEventListener)
})

afterEach(() => {
  vi.useRealTimers()
  removeEventSpy.mock.calls
    .filter(([type]) => type === 'visibilitychange')
    .forEach(([type, listener]) =>
      document.removeEventListener(type, listener as () => void),
    )
})

describe('usePolling', () => {
  it('按 intervalMs 周期执行，启动时不立即执行（首屏加载由页面自己负责）', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const poller = usePolling(fn, { intervalMs: 30_000 })

    poller.start()
    expect(fn).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(30_000)
    expect(fn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('canRun 门条件为 false 时本轮跳过（如非 OPEN 状态停止请求）', async () => {
    let open = false
    const fn = vi.fn().mockResolvedValue(undefined)
    const poller = usePolling(fn, { intervalMs: 30_000, canRun: () => open })

    poller.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fn).not.toHaveBeenCalled()

    open = true
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('页面隐藏暂停、回到前台立即刷一次再恢复节奏（对接文档 §7）', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const poller = usePolling(fn, { intervalMs: 30_000 })
    poller.start()

    fireVisibility('hidden')
    await vi.advanceTimersByTimeAsync(90_000)
    expect(fn).not.toHaveBeenCalled()

    fireVisibility('visible')
    await flush()
    expect(fn).toHaveBeenCalledTimes(1) // 回前台立即执行

    await vi.advanceTimersByTimeAsync(30_000)
    expect(fn).toHaveBeenCalledTimes(2) // 随后恢复周期
  })

  it('429 进入 60s 退避：暂停轮询、Toast 一次、期满自动恢复', async () => {
    const err = new ApiError('RATE_LIMIT_EXCEEDED', '请求过于频繁')
    // 仅首次拒绝（触发退避），期满恢复后成功，避免二次退避干扰断言
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue(undefined)
    const poller = usePolling(fn, { intervalMs: 30_000 })
    poller.start()

    await vi.advanceTimersByTimeAsync(30_000)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(toastMock.warning).toHaveBeenCalledTimes(1)
    expect(poller.isBackingOff()).toBe(true)

    // 退避期内不再执行
    await vi.advanceTimersByTimeAsync(59_000)
    expect(fn).toHaveBeenCalledTimes(1)

    // 60s 期满：立即执行一次并恢复周期
    await vi.advanceTimersByTimeAsync(1_000)
    await flush()
    expect(fn).toHaveBeenCalledTimes(2)
    expect(poller.isBackingOff()).toBe(false)
  })

  it('非 429 错误不进入退避，轮询继续', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiError('QUOTE_UPSTREAM_FAILED', '上游不可用'))
    const poller = usePolling(fn, { intervalMs: 30_000 })
    poller.start()

    await vi.advanceTimersByTimeAsync(90_000)
    expect(fn).toHaveBeenCalledTimes(3)
    expect(toastMock.warning).not.toHaveBeenCalled()
    expect(poller.isBackingOff()).toBe(false)
  })

  it('pause 后 resume 立即执行一次（keep-alive 回返接线用）', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const poller = usePolling(fn, { intervalMs: 30_000 })
    poller.start()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fn).toHaveBeenCalledTimes(1)

    poller.pause()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fn).toHaveBeenCalledTimes(1)

    poller.resume()
    await flush()
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
