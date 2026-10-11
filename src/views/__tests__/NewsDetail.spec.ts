import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { getNewsDetail, getNewsList, incrementViews } from '@/api/news'
import NewsDetail from '../NewsDetail.vue'
import type { NewsDetail as News } from '@/types'

vi.mock('@/api/news', () => ({
  getNewsDetail: vi.fn(),
  getNewsList: vi.fn(),
  incrementViews: vi.fn(),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: null }) }))
vi.mock('naive-ui', async (importOriginal) => ({
  ...await importOriginal<typeof import('naive-ui')>(),
  useMessage: () => ({ success: vi.fn(), error: vi.fn() }),
}))
vi.mock('@/components/content/ArticleContent.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/NewsSelection.vue', () => ({
  default: { setup: (_: unknown, { slots }: { slots: Record<string, () => ReturnType<typeof h>[]> }) => () => h('div', slots.default?.()) },
}))

let app: App | undefined
let container: HTMLDivElement

afterEach(() => {
  app?.unmount()
  container?.remove()
  vi.clearAllMocks()
})

it('点击相关阅读后加载新文章，浏览器返回时恢复原文章', async () => {
  const articles = [1, 2].map((id): News => ({
    id, title: `新闻 ${id}`, content: [], source: '来源', views: 0,
    publishTime: null, categoryId: 1, category: { id: 1, name: '财经' },
    tags: [], createdAt: '', updatedAt: '',
  }))
  vi.mocked(getNewsDetail).mockImplementation(async (id) => articles.find((article) => article.id === id)!)
  vi.mocked(incrementViews).mockResolvedValue({ views: 1 })
  vi.mocked(getNewsList).mockResolvedValue({
    data: articles, pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/news/:id', component: NewsDetail }],
  })
  await router.push('/news/1')
  container = document.createElement('div')
  document.body.appendChild(container)
  app = createApp(() => h(RouterView))
  app.use(router)
  app.mount(container)
  await vi.waitFor(() => expect(container.querySelector('h1')?.textContent).toBe('新闻 1'))
  await vi.waitFor(() => expect(container.querySelector('.detail__related-item')).not.toBeNull())

  container.querySelector<HTMLElement>('.detail__related-item')!.click()
  await vi.waitFor(() => expect(router.currentRoute.value.params.id).toBe('2'))
  await vi.waitFor(() => expect(container.querySelector('h1')?.textContent).toBe('新闻 2'))
  expect(getNewsDetail).toHaveBeenCalledWith(2)
  expect(incrementViews).toHaveBeenCalledWith(2)

  router.back()
  await vi.waitFor(() => expect(router.currentRoute.value.params.id).toBe('1'))
  await nextTick()
  await vi.waitFor(() => expect(container.querySelector('h1')?.textContent).toBe('新闻 1'))
  expect(getNewsDetail).toHaveBeenCalledTimes(3)
})
