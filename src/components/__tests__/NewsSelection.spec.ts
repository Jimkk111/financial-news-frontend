import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import NewsSelection from '../NewsSelection.vue'
import NewsItem from '../NewsItem.vue'
import { getNewsDetail } from '@/api/news'

const mocks = vi.hoisted(() => ({
  push: vi.fn(), queue: vi.fn(), init: vi.fn(), authenticated: true,
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/stores/aiSession', () => ({ useAiSessionStore: () => ({ queueNewsQuestion: mocks.queue }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({
  init: mocks.init, get isAuthenticated() { return mocks.authenticated },
}) }))
vi.mock('@/utils/toast', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/api/news', () => ({ getNewsDetail: vi.fn() }))

let app: App
let container: HTMLDivElement
const newsClick = vi.fn()

async function selectText(outside = false) {
  const title = outside ? document.createElement('p') : container.querySelector('p')!
  if (outside) {
    title.textContent = '外部文字'
    document.body.appendChild(title)
  }
  const range = document.createRange()
  range.selectNodeContents(title)
  vi.spyOn(range, 'getBoundingClientRect').mockReturnValue({
    left: 30, top: 100, right: 180, bottom: 120, width: 150, height: 20,
  } as DOMRect)
  window.getSelection()!.removeAllRanges()
  window.getSelection()!.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
  await nextTick()
}

describe('新闻划词问 AI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticated = true
    mocks.init.mockResolvedValue(undefined)
    mocks.push.mockResolvedValue(undefined)
    container = document.createElement('div')
    document.body.appendChild(container)
    app = createApp(() => h(NewsSelection, {}, { default: () => h('p', '央行发布最新消息') }))
    app.mount(container)
  })

  afterEach(() => {
    vi.useRealTimers()
    app.unmount()
    window.getSelection()?.removeAllRanges()
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it('正文选区显示提示，点击后携带选中原文跳转且不重复发送', async () => {
    await selectText()
    const button = document.querySelector<HTMLButtonElement>('.news-selection-ask')!
    expect(button.textContent).toContain('问 AI')
    button.click()
    button.click()
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(mocks.queue).toHaveBeenCalledExactlyOnceWith('央行发布最新消息')
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'aiAssistant' })
  })

  it('未登录保留问题并要求登录后返回 AI 页', async () => {
    mocks.authenticated = false
    await selectText()
    document.querySelector<HTMLButtonElement>('.news-selection-ask')!.click()
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(mocks.queue).toHaveBeenCalledWith('央行发布最新消息')
    expect(mocks.push).toHaveBeenCalledWith({ name: 'login', query: { redirect: '/ai' } })
  })

  it('外部选区不显示提示，清除选区或滚动后收起', async () => {
    await selectText(true)
    expect(document.querySelector('.news-selection-ask')).toBeNull()
    await selectText()
    window.getSelection()!.removeAllRanges()
    document.dispatchEvent(new Event('selectionchange'))
    await nextTick()
    expect(document.querySelector('.news-selection-ask')).toBeNull()
    await selectText()
    container.querySelector('p')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    container.querySelector('p')!.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(document.querySelector('.news-selection-ask')).toBeNull()
    await selectText()
    window.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(document.querySelector('.news-selection-ask')).toBeNull()
  })
})

describe('新闻列表项问 AI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticated = true
    mocks.init.mockResolvedValue(undefined)
    mocks.push.mockResolvedValue(undefined)
    vi.mocked(getNewsDetail).mockResolvedValue({
      id: 1, title: '新闻标题', source: '来源',
      content: [{ type: 'paragraph', children: [{ type: 'text', text: '完整新闻正文' }] }],
    } as Awaited<ReturnType<typeof getNewsDetail>>)
    container = document.createElement('div')
    document.body.appendChild(container)
    app = createApp(() => h(NewsItem, {
      id: 1, title: '新闻标题', source: '来源', time: '现在', views: 1, onClick: newsClick,
    }))
    app.mount(container)
  })

  afterEach(() => {
    app.unmount()
    vi.useRealTimers()
    window.getSelection()?.removeAllRanges()
    document.body.replaceChildren()
  })

  function pointer(type: string, x = 20, y = 100) {
    return new PointerEvent(type, {
      bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: x, clientY: y,
    })
  }

  it('右击显示菜单且不打开详情，问 AI 获取并发送完整正文', async () => {
    const item = container.querySelector('.nb-news-item')!
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 100 })
    item.dispatchEvent(event)
    await nextTick()
    expect(event.defaultPrevented).toBe(true)
    expect(newsClick).not.toHaveBeenCalled()
    const button = document.querySelector<HTMLButtonElement>('.news-selection-ask')!
    expect(button.textContent).toContain('问 AI')
    button.click()
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(getNewsDetail).toHaveBeenCalledWith(1)
    expect(mocks.queue).toHaveBeenCalledWith(expect.stringContaining('完整新闻正文'))
    expect(mocks.push).toHaveBeenCalledWith({ name: 'aiAssistant' })
  })

  it('长按 500ms 显示菜单，松手后的 click 不打开详情', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const item = container.querySelector('.nb-news-item')!
    item.dispatchEvent(pointer('pointerdown'))
    await vi.advanceTimersByTimeAsync(500)
    expect(document.querySelector('.news-selection-ask')).not.toBeNull()
    item.dispatchEvent(pointer('pointerup'))
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(newsClick).not.toHaveBeenCalled()
    expect(mocks.queue).not.toHaveBeenCalled()
  })

  it('短按立即打开详情，滑动和 pointercancel 取消长按', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const item = container.querySelector('.nb-news-item')!
    item.dispatchEvent(pointer('pointerdown'))
    item.dispatchEvent(pointer('pointerup'))
    item.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }))
    expect(newsClick).toHaveBeenCalledExactlyOnceWith(1)
    item.dispatchEvent(pointer('pointerdown'))
    item.dispatchEvent(pointer('pointermove', 20, 125))
    await vi.advanceTimersByTimeAsync(600)
    expect(document.querySelector('.news-selection-ask')).toBeNull()
    item.dispatchEvent(pointer('pointerdown'))
    item.dispatchEvent(pointer('pointercancel'))
    await vi.advanceTimersByTimeAsync(600)
    expect(document.querySelector('.news-selection-ask')).toBeNull()
  })
})
