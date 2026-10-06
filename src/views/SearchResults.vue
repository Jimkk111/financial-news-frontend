<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NEmpty, NIcon, NSpin } from 'naive-ui'
import { ArrowLeft, FileText } from 'lucide-vue-next'
import { searchNews } from '@/api/news'
import { formatTime } from '@/utils/format'
import BottomNav from '@/components/BottomNav.vue'
import NewsItem from '@/components/NewsItem.vue'
import type { NewsItem as NewsItemType } from '@/types'

const router = useRouter()
const route = useRoute()

const keyword = computed(() => (route.query.q as string) || '')

const results = ref<NewsItemType[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const performSearch = async () => {
  if (!keyword.value.trim()) {
    results.value = []
    loading.value = false
    error.value = null
    return
  }

  try {
    loading.value = true
    error.value = null
    const response = await searchNews({ keyword: keyword.value.trim(), pageSize: 20 })
    results.value = response.data || []
  } catch (err) {
    error.value = '搜索失败，请稍后重试'
    results.value = []
  } finally {
    loading.value = false
  }
}

watch(() => keyword.value, performSearch)

const handleBack = () => {
  router.push('/')
}

const handleNewsClick = (id: number) => {
  router.push(`/news/${id}`)
}

const handleTabChange = (tab: string) => {
  const routePath = tab === 'home' ? '/' : `/${tab}`
  router.push(routePath)
}

onMounted(performSearch)
</script>

<template>
  <div class="nb-page search">
    <header class="nb-page-header">
      <div class="nb-page-header__inner nb-page-header__inner--narrow">
        <button class="nb-icon-btn" title="返回" @click="handleBack">
          <n-icon :component="ArrowLeft" :size="18" />
        </button>
        <span class="nb-page-header__title">搜索结果</span>
        <div class="nb-page-header__side"></div>
      </div>
    </header>

    <main class="nb-page-body nb-page-body--with-nav search__body">
      <div class="search__summary">
        <p class="search__summary-line">
          搜索关键词：<strong class="search__keyword">{{ keyword }}</strong>
        </p>
        <p class="search__summary-line">找到 {{ results.length }} 条相关新闻</p>
      </div>

      <div v-if="loading" class="search__state">
        <n-spin size="medium" />
        <span class="search__state-text">搜索中...</span>
      </div>

      <div v-else-if="error" class="search__state">
        <p class="nb-alert nb-alert--error">{{ error }}</p>
      </div>

      <div v-else-if="results.length === 0" class="nb-placeholder">
        <n-empty description="未找到相关新闻">
          <template #icon>
            <n-icon :component="FileText" />
          </template>
          <template #extra>
            <span class="search__hint">请尝试使用其他关键词</span>
          </template>
        </n-empty>
      </div>

      <div v-else class="search__results">
        <NewsItem
          v-for="item in results"
          :key="item.id"
          :id="item.id"
          :title="item.title"
          :source="item.source"
          :time="formatTime(item.publishTime)"
          :views="item.views"
          @click="handleNewsClick"
        />
      </div>
    </main>

    <BottomNav active-tab="home" @tab-change="handleTabChange" />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;
@use '../styles/mixins' as *;

.search {
  background-color: var(--nb-bg-subtle);

  &__body {
    max-width: 720px;
    margin: 0 auto;
  }

  &__summary {
    padding: $sp-4;
    border-bottom: 1px solid var(--nb-divider);
  }

  &__summary-line {
    font-size: $fs-sm;
    color: var(--nb-text-secondary);
    line-height: 1.7;
  }

  &__keyword {
    font-weight: $fw-semibold;
    color: var(--nb-text);
  }

  &__state {
    @include flex(column, center, center, $sp-3);
    padding: $sp-12 $sp-4;
  }

  &__state-text {
    font-size: $fs-sm;
    color: var(--nb-text-tertiary);
  }

  &__hint {
    font-size: $fs-sm;
    color: var(--nb-text-tertiary);
  }

  &__results {
    background-color: var(--nb-surface);
  }
}
</style>
