import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Category } from '@/types'
import { getCategories } from '@/api/news'

/**
 * 新闻分类状态：categories + activeCategoryId 的唯一真源。
 * 消费方有三处——CategoryTabs（高亮/点击）、首页手势（switchByOffset）、
 * NewsList（经 Home 转发 prop）。列表组件刻意不直接读 store，保持受控展示器。
 */
export const useNewsCategoryStore = defineStore('newsCategory', () => {
  const categories = ref<Category[]>([])
  const activeCategoryId = ref<number | null>(null)
  const loading = ref(false)

  // 分类接口内容稳定，整个应用生命周期拉取一次即可
  let loaded = false

  // "全部"与具体分类统一参与下标运算：id 为 null 排在最前
  const items = computed<Array<{ id: number | null; name: string }>>(() => [
    { id: null, name: '全部' },
    ...categories.value,
  ])

  const activeIndex = computed(() =>
    items.value.findIndex(c => c.id === activeCategoryId.value),
  )

  async function fetchCategories() {
    if (loaded) return
    loading.value = true
    try {
      const response = (await getCategories()) as unknown
      // 后端历史上存在 { data: [...] } 包装与裸数组两种形态
      const raw = (response as { data?: Category[] }).data ?? (response as Category[])
      categories.value = raw
      loaded = true
    } finally {
      loading.value = false
    }
  }

  function switchTo(id: number | null) {
    if (id === activeCategoryId.value) return
    activeCategoryId.value = id
  }

  /** 手势入口：按当前下标偏移切换；到头钳制（第一个再右滑、最后一个再左滑均为 no-op） */
  function switchByOffset(offset: 1 | -1) {
    const index = activeIndex.value
    if (index < 0) return
    const next = items.value[index + offset]
    if (next) switchTo(next.id)
  }

  return { categories, activeCategoryId, loading, items, activeIndex, fetchCategories, switchTo, switchByOffset }
})
