import { describe, expect, it } from 'vitest'
import { articleToText } from '../articleToText'

describe('articleToText', () => {
  it('保留段落、列表、嵌套引用和换行，忽略视频和分隔线', () => {
    expect(articleToText([
      { type: 'heading', children: [{ type: 'text', text: '标题' }] },
      { type: 'paragraph', children: [{ type: 'text', text: '第一行' }, { type: 'hardBreak' }, { type: 'text', text: '第二行' }] },
      { type: 'bulletList', items: [{ children: [{ type: 'text', text: '列表项' }] }] },
      { type: 'blockquote', children: [{ type: 'paragraph', children: [{ type: 'text', text: '引用正文' }] }] },
      { type: 'divider' },
      { type: 'video', src: 'https://example.com/video.mp4' },
    ])).toBe('标题\n\n第一行\n第二行\n\n列表项\n\n引用正文')
  })
})
