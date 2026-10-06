import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { watch } from 'vue'
import type { Category } from '@/types'

vi.mock('@/api/news', () => ({
  getCategories: vi.fn(),
}))

import { useNewsCategoryStore } from '../newsCategory'
import { getCategories } from '@/api/news'

const getCategoriesMock = vi.mocked(getCategories)

const CATEGORIES: Category[] = [
  { id: 1, name: '科技' },
  { id: 2, name: '财经' },
  { id: 3, name: '体育' },
]

describe('useNewsCategoryStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchCategories 加载分类，items 以"全部"为首项', async () => {
    // 后端历史形态：{ data: [...] } 包装
    getCategoriesMock.mockResolvedValue({ data: CATEGORIES } as never)

    const store = useNewsCategoryStore()
    await store.fetchCategories()

    expect(getCategoriesMock).toHaveBeenCalledTimes(1)
    expect(store.categories).toHaveLength(3)
    expect(store.items[0]).toEqual({ id: null, name: '全部' })
    expect(store.items[1]).toMatchObject({ id: 1, name: '科技' })
  })

  it('裸数组返回形态同样兼容', async () => {
    getCategoriesMock.mockResolvedValue(CATEGORIES)

    const store = useNewsCategoryStore()
    await store.fetchCategories()

    expect(store.categories).toHaveLength(3)
  })

  it('已加载后再次调用不重复请求', async () => {
    getCategoriesMock.mockResolvedValue(CATEGORIES)

    const store = useNewsCategoryStore()
    await store.fetchCategories()
    await store.fetchCategories()

    expect(getCategoriesMock).toHaveBeenCalledTimes(1)
  })

  it('switchByOffset 按顺序切换且边界钳制', async () => {
    getCategoriesMock.mockResolvedValue(CATEGORIES)
    const store = useNewsCategoryStore()
    await store.fetchCategories()

    // 初始"全部"：右滑（-1）到头无效果
    store.switchByOffset(-1)
    expect(store.activeCategoryId).toBeNull()

    // 左滑（+1）逐个前进
    store.switchByOffset(1)
    expect(store.activeCategoryId).toBe(1)
    store.switchByOffset(1)
    expect(store.activeCategoryId).toBe(2)
    store.switchByOffset(1)
    expect(store.activeCategoryId).toBe(3)

    // 最后一个分类：左滑（+1）到头无效果
    store.switchByOffset(1)
    expect(store.activeCategoryId).toBe(3)

    // 右滑（-1）回退
    store.switchByOffset(-1)
    expect(store.activeCategoryId).toBe(2)
  })

  it('switchTo 同值不触发响应式更新', async () => {
    getCategoriesMock.mockResolvedValue(CATEGORIES)
    const store = useNewsCategoryStore()
    await store.fetchCategories()

    store.switchTo(1)
    const spy = vi.fn()
    watch(() => store.activeCategoryId, spy)

    store.switchTo(1)
    expect(spy).not.toHaveBeenCalled()
    expect(store.activeCategoryId).toBe(1)
  })
})
