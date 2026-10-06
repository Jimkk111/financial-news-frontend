<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NIcon, NPopover, NSpin, NTag, useMessage } from 'naive-ui'
import {
  ArrowLeft,
  Clock,
  Eye,
  FileText,
  Heart,
  MoreVertical,
  Share2,
} from 'lucide-vue-next'
import { getNewsDetail, incrementViews, getNewsList } from '@/api/news'
import { addHistory } from '@/api/history'
import { addFavorite, removeFavorite, checkFavorite } from '@/api/favorite'
import { formatTime } from '@/utils/format'
import ArticleContent from '@/components/content/ArticleContent.vue'
import { normalizeContent } from '@/utils/content/validateContent'
import { useAuthStore } from '@/stores/auth'
import type { NewsDetail as NewsType, NewsItem } from '@/types'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const message = useMessage()

const newsId = ref(Number(route.params.id))
const uid = authStore.user?.uid || ''

const news = ref<NewsType | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const isFavorited = ref(false)
const favoriting = ref(false)
const menuOpen = ref(false)
const relatedNews = ref<NewsItem[]>([])

const addNewsHistory = async () => {
  if (!uid || !news.value) return

  try {
    await addHistory(newsId.value)
  } catch (err) {
    console.error('添加历史记录失败:', err)
  }
}

const checkFavoritedStatus = async () => {
  if (!uid) return

  try {
    const { is_favorite } = await checkFavorite(newsId.value)
    isFavorited.value = is_favorite
  } catch (err) {
    console.error('检查收藏状态失败:', err)
  }
}

const toggleFavorite = async () => {
  if (!uid || favoriting.value || !news.value) return

  favoriting.value = true

  try {
    if (isFavorited.value) {
      await removeFavorite(newsId.value)
      isFavorited.value = false
      message.success('已取消收藏')
    } else {
      await addFavorite(newsId.value)
      isFavorited.value = true
      message.success('已加入收藏')
    }
  } catch (error) {
    console.error('收藏操作失败:', error)
  } finally {
    favoriting.value = false
  }
}

const handleShare = async () => {
  if (!news.value) return

  const shareData = {
    title: news.value.title,
    text: news.value.summary,
    url: window.location.href,
  }

  if (navigator.share) {
    try {
      await navigator.share(shareData)
    } catch (err) {
      console.error('分享失败:', err)
    }
  } else {
    try {
      await navigator.clipboard.writeText(window.location.href)
      message.success('链接已复制')
    } catch (err) {
      console.error('复制链接失败:', err)
      message.error('复制链接失败')
    }
  }
}

const getRelatedNews = (currentNews: NewsType, allNews: NewsItem[]): NewsItem[] => {
  const sameTags = allNews.filter(
    (n) =>
      n.id !== currentNews.id &&
      n.tags?.some((t) => currentNews.tags?.some((ct) => ct.id === t.id))
  )

  const sameCategory = allNews.filter(
    (n) =>
      n.id !== currentNews.id && n.category?.id === currentNews.category?.id
  )

  const related = [...new Set([...sameTags, ...sameCategory])]
  return related.slice(0, 5)
}

const loadRelatedNews = async (currentNews: NewsType) => {
  try {
    const response = await getNewsList({
      page: 1,
      pageSize: 50,
      categoryId: currentNews.categoryId || undefined,
    })
    const related = getRelatedNews(currentNews, response.data)
    relatedNews.value = related
  } catch (error) {
    console.error('加载相关阅读失败:', error)
  }
}

// 后端正文已是块级 JSON，过一遍白名单归一化兜底后再渲染
const contentBlocks = computed(() => (news.value ? normalizeContent(news.value.content) : []))

const fetchNewsDetail = async () => {
  try {
    loading.value = true
    error.value = null
    const res = await getNewsDetail(newsId.value)
    news.value = res

    try {
      await incrementViews(newsId.value)
    } catch (viewError) {
      console.error('增加阅读量失败:', viewError)
    }

    await addNewsHistory()
    await checkFavoritedStatus()

    await loadRelatedNews(res)
  } catch (err) {
    error.value = '获取新闻详情失败，请稍后重试'
    console.error('获取新闻详情失败:', err)
  } finally {
    loading.value = false
  }
}

watch(() => newsId.value, fetchNewsDetail)

onMounted(() => {
  fetchNewsDetail()
})

onUnmounted(() => {
  menuOpen.value = false
})

const handleRelatedClick = (id: number) => {
  router.push(`/news/${id}`)
}
</script>

<template>
  <div v-if="loading" class="detail-loading">
    <n-spin size="large" />
  </div>

  <div v-else-if="error || !news" class="detail-loading">
    <p class="detail-loading__text">{{ error || '新闻不存在' }}</p>
  </div>

  <div v-else class="nb-page">
    <header class="nb-page-header">
      <div class="nb-page-header__inner nb-page-header__inner--wide">
        <button class="nb-icon-btn" title="返回" @click="router.push('/')">
          <n-icon :component="ArrowLeft" :size="18" />
        </button>
        <span class="nb-page-header__title">新闻详情</span>

        <div class="nb-page-header__side">
          <n-popover v-model:show="menuOpen" trigger="click" placement="bottom-end" :width="160">
            <template #trigger>
              <button class="nb-icon-btn" title="更多">
                <n-icon :component="MoreVertical" :size="18" />
              </button>
            </template>

            <div class="detail-menu">
              <button
                class="detail-menu__item"
                :class="{ 'is-active': isFavorited }"
                :disabled="!uid || favoriting"
                @click="toggleFavorite(); menuOpen = false"
              >
                <n-icon :component="Heart" :size="16" :class="{ 'is-filled': isFavorited }" />
                <span>{{ isFavorited ? '已收藏' : '收藏' }}</span>
              </button>

              <button class="detail-menu__item" @click="handleShare(); menuOpen = false">
                <n-icon :component="Share2" :size="16" />
                <span>分享</span>
              </button>
            </div>
          </n-popover>
        </div>
      </div>
    </header>

    <main class="nb-page-body">
      <article class="detail">
        <h1 class="detail__title">{{ news.title }}</h1>

        <div class="detail__meta">
          <span class="detail__source">{{ news.source }}</span>
          <span class="detail__meta-item">
            <n-icon :component="Clock" :size="13" />
            {{ formatTime(news.publishTime) }}
          </span>
          <span class="detail__meta-item">
            <n-icon :component="Eye" :size="13" />
            {{ news.views }} 阅读
          </span>
        </div>

        <!-- 新闻正文（块级 JSON 渲染，无 v-html） -->
        <div class="detail__content">
          <ArticleContent :content="contentBlocks" />
        </div>

        <!-- 新闻标签 -->
        <div v-if="news.tags && news.tags.length > 0" class="detail__tags">
          <n-tag
            v-for="tag in news.tags"
            :key="tag.id"
            size="small"
            round
            :bordered="false"
          >
            #{{ tag.name }}
          </n-tag>
        </div>

        <!-- 相关阅读 -->
        <section v-if="relatedNews.length > 0" class="detail__related">
          <h3 class="detail__related-title">相关阅读</h3>
          <ul class="detail__related-list">
            <li
              v-for="item in relatedNews"
              :key="item.id"
              class="detail__related-item"
              @click="handleRelatedClick(item.id)"
            >
              <h4 class="detail__related-name">{{ item.title }}</h4>
              <div class="detail__related-meta">
                <span class="detail__source">{{ item.source }}</span>
                <span>{{ formatTime(item.publishTime) }}</span>
              </div>
            </li>
          </ul>
        </section>
      </article>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;
@use '../styles/mixins' as *;

.detail-loading {
  @include flex(column, center, center, $sp-3);
  min-height: 100vh;
  background-color: var(--nb-bg-subtle);

  &__text {
    font-size: $fs-base;
    color: var(--nb-danger);
  }
}

.detail {
  max-width: $content-max-width;
  margin: 0 auto;
  padding: $sp-8 $sp-4 $sp-12;
  background-color: var(--nb-surface);

  &__title {
    font-size: 28px;
    font-weight: $fw-bold;
    line-height: 1.3;
    color: var(--nb-text);
    margin-bottom: $sp-4;
  }

  &__meta {
    @include flex(row, flex-start, center, $sp-3);
    flex-wrap: wrap;
    padding-bottom: $sp-4;
    font-size: $fs-xs;
    color: var(--nb-text-tertiary);
    border-bottom: 1px solid var(--nb-divider);
  }

  &__source {
    color: var(--nb-brand);
    font-weight: $fw-medium;
  }

  &__meta-item {
    @include flex(row, flex-start, center, 4px);
  }

  &__content {
    padding-top: $sp-5;
  }

  &__tags {
    @include flex(row, flex-start, center, $sp-2);
    flex-wrap: wrap;
    margin-top: $sp-6;
    padding-top: $sp-5;
    border-top: 1px solid var(--nb-divider);
  }

  &__related {
    margin-top: $sp-8;
    padding-top: $sp-5;
    border-top: 1px solid var(--nb-divider);
  }

  &__related-title {
    font-size: $fs-lg;
    font-weight: $fw-semibold;
    color: var(--nb-text);
    margin-bottom: $sp-3;
  }

  &__related-list {
    display: flex;
    flex-direction: column;
  }

  &__related-item {
    padding: $sp-3 $sp-2;
    margin: 0 (-$sp-2);
    border-radius: $radius-md;
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

  &__related-name {
    font-size: $fs-base;
    font-weight: $fw-medium;
    line-height: 1.5;
    color: var(--nb-text);
    margin-bottom: $sp-1;
    @include line-clamp(2);
  }

  &__related-meta {
    @include flex(row, flex-start, center, $sp-2);
    font-size: $fs-xs;
    color: var(--nb-text-tertiary);
  }
}

.detail-menu {
  display: flex;
  flex-direction: column;
  padding: $sp-1;

  &__item {
    @include flex(row, flex-start, center, $sp-2);
    width: 100%;
    padding: $sp-2 $sp-3;
    font-size: $fs-base;
    color: var(--nb-text);
    border-radius: $radius-md;
    transition: background-color $dur-fast $ease;

    &:hover:not(:disabled) {
      background-color: var(--nb-hover);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &.is-active {
      color: var(--nb-brand);
    }
  }
}

:deep(.is-filled) {
  fill: var(--nb-brand);
}
</style>
