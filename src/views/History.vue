<script setup lang="ts">
import { reactive, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NIcon, NSpin } from 'naive-ui'
import { ArrowLeft, BookOpen, Clock, Eye } from 'lucide-vue-next'
import { getHistory } from '@/api/history'
import { getApiErrorMessage } from '@/utils/apiError'
import { useAuthStore } from '@/stores/auth'
import { formatTime } from '@/utils/format'
import type { HistoryItem, PaginationInfo } from '@/types'

const router = useRouter()
const authStore = useAuthStore()

const uid = authStore.user?.uid || ''

const handleBack = () => {
  router.push('/profile')
}

const handleNewsClick = (id: number) => {
  router.push(`/news/${id}`)
}

const state = reactive<{
  items: HistoryItem[]
  loading: boolean
  error: string | null
  pagination: PaginationInfo
}>({
  items: [],
  loading: true,
  error: null,
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  },
})

const fetchHistory = async () => {
  if (!uid) {
    state.loading = false
    state.error = '用户未登录'
    return
  }

  state.loading = true
  state.error = null

  try {
    const response = await getHistory({
      page: state.pagination.page,
      pageSize: state.pagination.pageSize,
    })

    state.items = response.data
    state.pagination = response.pagination
    state.error = null
  } catch (error) {
    state.error = getApiErrorMessage(error, '获取浏览历史失败')
    console.error('获取浏览历史失败:', error)
  } finally {
    state.loading = false
  }
}

watch(() => uid, fetchHistory)
watch(() => state.pagination.page, fetchHistory)

onMounted(fetchHistory)
</script>

<template>
  <div class="nb-page">
    <header class="nb-page-header">
      <div class="nb-page-header__inner nb-page-header__inner--narrow">
        <button class="nb-icon-btn" title="返回" @click="handleBack">
          <n-icon :component="ArrowLeft" :size="18" />
        </button>
        <span class="nb-page-header__title">阅读历史</span>
        <div class="nb-page-header__side"></div>
      </div>
    </header>

    <main class="nb-page-body list-page">
      <div v-if="state.loading" class="list-page__state">
        <n-spin size="large" />
      </div>

      <div v-else-if="state.error" class="list-page__state">
        <p class="nb-alert nb-alert--error">{{ state.error }}</p>
      </div>

      <ul v-else-if="state.items.length > 0" class="list-page__list">
        <li
          v-for="item in state.items"
          :key="item.newsId"
          class="list-page__item"
          @click="handleNewsClick(item.newsId)"
        >
          <h3 class="list-page__title">{{ item.title }}</h3>

          <div class="list-page__meta">
            <span class="list-page__source">{{ item.source }}</span>
            <span class="list-page__meta-item">
              <n-icon :component="Clock" :size="12" />
              {{ formatTime(item.publishTime) }}
            </span>
            <span class="list-page__meta-item">
              <n-icon :component="Eye" :size="12" />
              {{ item.views }} 阅读
            </span>
          </div>

          <div class="list-page__viewed">
            <n-icon :component="Clock" :size="12" />
            <span>阅读于 {{ formatTime(item.viewedAt) }}</span>
          </div>
        </li>
      </ul>

      <div v-else class="nb-placeholder">
        <n-icon :component="BookOpen" :size="44" />
        <p class="nb-placeholder__title">暂无阅读历史</p>
        <p class="nb-placeholder__desc">浏览过的新闻会显示在这里</p>
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;
@use '../styles/mixins' as *;

.list-page {
  background-color: var(--nb-bg-subtle);
  min-height: 100vh;

  &__state {
    @include flex(row, center, center);
    padding: $sp-12 $sp-4;
  }

  &__list {
    background-color: var(--nb-surface);
    border-bottom: 1px solid var(--nb-border);
  }

  &__item {
    padding: $sp-4;
    cursor: pointer;
    border-bottom: 1px solid var(--nb-divider);
    transition: background-color $dur-fast $ease;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background-color: var(--nb-hover);
    }
  }

  &__title {
    font-size: $fs-lg;
    font-weight: $fw-medium;
    line-height: 1.6;
    color: var(--nb-text);
    margin-bottom: $sp-2;
  }

  &__meta {
    @include flex(row, flex-start, center, $sp-3);
    flex-wrap: wrap;
    font-size: $fs-xs;
    color: var(--nb-text-tertiary);
  }

  &__source {
    color: var(--nb-brand);
    font-weight: $fw-medium;
  }

  &__meta-item {
    @include flex(row, flex-start, center, 4px);
  }

  &__viewed {
    @include flex(row, flex-start, center, 4px);
    margin-top: $sp-2;
    font-size: $fs-xs;
    color: var(--nb-text-tertiary);
  }
}
</style>
