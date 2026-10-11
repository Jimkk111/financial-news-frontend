/**
 * 从 SSE 文本流中提取 data 事件。
 *
 * SSE 以换行分帧；切片边界可能落在行中间，非 final 模式下
 * 最后一行视为不完整，通过 rest 返回并与下个 chunk 拼接。
 */
export function extractSseEvents(
  text: string,
  final = false,
): { events: string[]; rest: string } {
  // 一个data行以\n结尾
  const lines = text.split('\n')
  // 不完整行，用于更新buffer，留待下一轮处理
  const rest = final ? '' : (lines.pop() ?? '')

  const events: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('data:')) {
      events.push(trimmed.slice(5).trim())
    }
  }
  return { events, rest }
}

export interface SseFrame {
  event: string
  id?: string
  data: string
}

/** 按空行分帧，保留命名事件和 id，支持多行 data 和跨网络分片。 */
export function extractSseFrames(text: string): { events: SseFrame[]; rest: string } {
  const events: SseFrame[] = []
  const separator = /\r?\n\r?\n/g
  let start = 0
  let match: RegExpExecArray | null
  while ((match = separator.exec(text))) {
    const block = text.slice(start, match.index)
    start = match.index + match[0].length
    let event = 'message'
    let id: string | undefined
    const data: string[] = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon < 0 ? line : line.slice(0, colon)
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
      if (field === 'event') event = value
      else if (field === 'id') id = value
      else if (field === 'data') data.push(value)
    }
    if (data.length) events.push({ event, id, data: data.join('\n') })
  }
  return { events, rest: text.slice(start) }
}
