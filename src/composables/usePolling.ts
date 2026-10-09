import { getCurrentInstance, onUnmounted } from 'vue'
import { isRateLimitError } from '@/api/quote'
import { toast } from '@/utils/toast'

// ============================================================
// 行情轮询 composable（docs/quote-frontend-design.md §4.3）
//
// 行为规格（对接文档 §7）：
// 1. setInterval 周期执行；每轮先过 canRun() 门（false 则本轮跳过）
// 2. visibilitychange：hidden 暂停；回到前台立即刷一次再恢复定时器
// 3. 429（RATE_LIMIT_EXCEEDED）：暂停 ≥60s 后恢复，Toast 只提示一次
// 4. 组件卸载自动清理；keep-alive 场景由调用方在
//    onActivated/onDeactivated 中接 resume()/pause()
// ============================================================

const DEFAULT_INTERVAL_MS = 30_000
const RATE_LIMIT_BACKOFF_MS = 60_000

export interface UsePollingOptions {
  intervalMs?: number
  /** 门条件：返回 false 时本轮跳过（如 tradeStatus !== 'OPEN'） */
  canRun?: () => boolean
}

export interface UsePollingReturn {
  start: () => void
  pause: () => void
  resume: () => void
  /** 是否处于 429 退避期 */
  isBackingOff: () => boolean
}

export function usePolling(
  fn: () => Promise<void>,
  options: UsePollingOptions = {},
): UsePollingReturn {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS

  let timer: ReturnType<typeof setInterval> | null = null
  let backoffTimer: ReturnType<typeof setTimeout> | null = null
  let backingOff = false

  // ---------- 定时器管理 ----------

  function clearTimer() {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  function clearBackoff() {
    if (backoffTimer !== null) {
      clearTimeout(backoffTimer)
      backoffTimer = null
    }
    backingOff = false
  }

  // ---------- 执行 ----------

  async function runOnce() {
    if (backingOff) return
    if (options.canRun && !options.canRun()) return
    try {
      await fn()
    } catch (e) {
      if (isRateLimitError(e)) enterBackoff()
      // 其余错误由 fn 内部落到分段错误态，这里不再上抛
    }
  }

  let rateLimitToasted = false
  function enterBackoff() {
    pause()
    backingOff = true
    // Toast 去重：同一退避周期只提示一次（对接文档 §7）
    if (!rateLimitToasted) {
      rateLimitToasted = true
      toast.warning('请求过于频繁，行情刷新已暂停，稍后自动恢复')
    }
    backoffTimer = setTimeout(() => {
      backoffTimer = null
      backingOff = false
      rateLimitToasted = false
      resume()
    }, RATE_LIMIT_BACKOFF_MS)
  }

  // ---------- 对外 API ----------

  function start() {
    if (timer !== null) return
    timer = setInterval(() => void runOnce(), intervalMs)
  }

  function pause() {
    clearTimer()
  }

  function resume() {
    if (timer !== null) return
    // 回到前台/退避结束：立即刷一次再恢复节奏（对接文档 §7）
    void runOnce()
    start()
  }

  function isBackingOff() {
    return backingOff
  }

  // ---------- 页面可见性 ----------

  function handleVisibility() {
    if (document.visibilityState === 'hidden') {
      pause()
    } else {
      resume()
    }
  }

  document.addEventListener('visibilitychange', handleVisibility)

  // 组件上下文中自动清理；测试等无实例场景由调用方手动 stop
  if (getCurrentInstance()) {
    onUnmounted(() => {
      document.removeEventListener('visibilitychange', handleVisibility)
      clearTimer()
      clearBackoff()
    })
  }

  return { start, pause, resume, isBackingOff }
}
