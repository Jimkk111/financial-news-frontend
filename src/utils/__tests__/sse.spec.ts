import { describe, expect, it } from 'vitest'
import { extractSseEvents, extractSseFrames } from '../sse'

describe('extractSseFrames', () => {
  it('保留命名事件和游标，初始化和心跳使用默认事件', () => {
    const result = extractSseFrames('data: {"heartbeat":true}\n\nid: 43\nevent: delta\ndata: {"content":"正文","seq":43}\n\n')
    expect(result.events).toEqual([
      { event: 'message', data: '{"heartbeat":true}' },
      { event: 'delta', id: '43', data: '{"content":"正文","seq":43}' },
    ])
    expect(result.rest).toBe('')
  })

  it('空行边界跨分片时保留完整事件直到下一片', () => {
    const first = extractSseFrames('event: cancelled\r\nid: 9\r\ndata: {"seq":9}\r\n\r')
    expect(first.events).toEqual([])
    const second = extractSseFrames(first.rest + '\n')
    expect(second.events).toEqual([{ event: 'cancelled', id: '9', data: '{"seq":9}' }])
    expect(second.rest).toBe('')
  })

  it('忽略注释，合并多行数据，end 不需要游标', () => {
    const result = extractSseFrames(': keep alive\n\nevent: end\ndata: {\ndata: "status":"completed"}\n\n')
    expect(result.events).toEqual([{ event: 'end', data: '{\n"status":"completed"}' }])
  })
})

describe('extractSseEvents', () => {
  it('解析完整的单行 data 事件', () => {
    const { events, rest } = extractSseEvents('data:{"content":"hi"}\n')
    expect(events).toEqual(['{"content":"hi"}'])
    expect(rest).toBe('')
  })

  it('多行事件全部解析', () => {
    const text = 'data:{"a":1}\ndata:{"b":2}\n'
    const { events } = extractSseEvents(text)
    expect(events).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('不完整的行保留在 rest 中等待下个 chunk 拼接', () => {
    const { events, rest } = extractSseEvents('data:{"con')
    expect(events).toEqual([])
    expect(rest).toBe('data:{"con')
  })

  it('跨 chunk 的数据拼接后可解析', () => {
    // chunk 边界落在字符串中间：data:{"content":"你 | 好"}
    const first = extractSseEvents('data:{"content":"你')
    const second = extractSseEvents(first.rest + '好"}\n')
    expect(second.events).toEqual(['{"content":"你好"}'])
  })

  it('忽略非 data 行与空行', () => {
    const text = ': keep-alive\n\nevent: message\ndata:{"x":1}\n'
    const { events } = extractSseEvents(text)
    expect(events).toEqual(['{"x":1}'])
  })

  it('识别 [DONE] 结束标记', () => {
    const { events } = extractSseEvents('data:{"content":"a"}\ndata:[DONE]\n')
    expect(events).toEqual(['{"content":"a"}', '[DONE]'])
  })

  it('兼容 CRLF 换行', () => {
    const { events, rest } = extractSseEvents('data:{"a":1}\r\ndata:{"b":2}\r\n')
    expect(events).toEqual(['{"a":1}', '{"b":2}'])
    expect(rest).toBe('')
  })

  it('final=true 时把残余不完整行也解析掉', () => {
    const { events, rest } = extractSseEvents('data:{"content":"结尾"}', true)
    expect(events).toEqual(['{"content":"结尾"}'])
    expect(rest).toBe('')
  })
})
