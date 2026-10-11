/** 单次流读取的空闲超时；任一分片（包含心跳）到达即结束本次计时。 */
export function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleTimeout: number,
  timeoutError: () => Error,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    reader.read(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(timeoutError())
        // 取消底层读取，避免超时后连接悬挂。
        try {
          reader.cancel().catch(() => {})
        } catch {
          // 已关闭的读取器无需再次清理。
        }
      }, idleTimeout)
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}
