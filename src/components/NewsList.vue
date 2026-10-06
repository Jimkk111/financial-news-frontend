<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { NEmpty, NSpin, NIcon } from 'naive-ui'
import { FileText } from 'lucide-vue-next'
import { getNewsList } from '@/api/news'
import { formatTime } from '@/utils/format'
import NewsItem from './NewsItem.vue'
import NewsListSkeleton from './NewsListSkeleton.vue'
import type { NewsItem as NewsItemType } from '@/types'

interface Props {
  categoryId?: number | null
}

interface LocalNewsItem {
  id: number
  title: string
  source: string | null
  time: string
  views: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  newsClick: [id: number]
}>()

const newsData = ref<LocalNewsItem[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const page = ref(1)
const hasMore = ref(true)
const isLoadingLocked = ref(false)
const observerRef = ref<HTMLDivElement | null>(null)
let observer: IntersectionObserver | null = null

const fetchNews = async () => {
  if (isLoadingLocked.value) return
  isLoadingLocked.value = true
  try {
    if (page.value === 1) {
      loading.value = true
    } else {
      loadingMore.value = true
    }
    error.value = null

    const response = await getNewsList({
      page: page.value,
      pageSize: 20,
      categoryId: props.categoryId || undefined,
      sort: 'newest'
    })

    const formattedNews: LocalNewsItem[] = response.data.map((news: NewsItemType) => ({
      id: news.id,
      title: news.title,
      source: news.source,
      time: formatTime(news.publishTime),
      views: news.views,
    }))

    if (page.value === 1) {
      newsData.value = formattedNews
    } else {
      newsData.value = [...newsData.value, ...formattedNews]
    }

    hasMore.value = page.value < response.pagination.totalPages
  } catch (err) {
    error.value = '获取新闻列表失败，请稍后重试'
  } finally {
    loading.value = false
    loadingMore.value = false
    isLoadingLocked.value = false
  }
}

watch(
  () => props.categoryId,
  () => {
    page.value = 1
    newsData.value = []
    hasMore.value = true
    fetchNews()
    nextTick(() => setupObserver())
  }
)

/*
  observer 的作用是监听是否到达了页面底部，动态增加页数从而加载数据。
*/
watch(page, (newPage) => {
  if (newPage > 1) {
    fetchNews()
  }
})

const setupObserver = () => {
  if (observer) {
    observer.disconnect()
  }

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0] && entries[0].isIntersecting && hasMore.value && !isLoadingLocked.value) {
        page.value++
      }
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px 200px 0px',
    }
  )

  if (observerRef.value) {
    observer.observe(observerRef.value)
  }
}

onMounted(async () => {
  await fetchNews()
  await nextTick()
  setupObserver()
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
})
</script>

<template>
  <div class="nb-news-list">
    <!-- 首屏加载用骨架屏占位，形状与 NewsItem 一致 -->
    <NewsListSkeleton v-if="loading && newsData.length === 0" />

    <div v-else-if="error && newsData.length === 0" class="nb-news-list__state">
      <n-empty description="获取新闻列表失败，请稍后重试">
        <template #icon>
          <n-icon :component="FileText" />
        </template>
      </n-empty>
    </div>

    <div v-else-if="newsData.length === 0" class="nb-news-list__state">
      <n-empty description="该分类暂无新闻">
        <template #icon>
          <n-icon :component="FileText" />
        </template>
        <template #extra>
          <span class="nb-news-list__hint">请尝试选择其他分类</span>
        </template>
      </n-empty>
    </div>

    <!--
      虚拟列表容器：只渲染可视区域内的 DOM 节点，而不是渲染全部列表项。
    -->
    <DynamicScroller
      v-else
      :items="newsData"
      :min-item-size="80"
      key-field="id"
      page-mode
    >
      <template #default="{ item, active }">
        <!-- 虚拟列表子项包装器 -->
        <DynamicScrollerItem
          :item="item"
          :active="active"
          :size-dependencies="[item.title]"
        >
          <NewsItem
            :id="item.id"
            :title="item.title"
            :source="item.source"
            :time="item.time"
            :views="item.views"
            @click="emit('newsClick', $event)"
          />
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>

    <div v-if="loadingMore" class="nb-news-list__more">
      <n-spin size="small" />
      <span>加载更多新闻...</span>
    </div>

    <div v-if="hasMore" ref="observerRef" class="nb-news-list__sentinel"></div>

    <div v-if="!hasMore && newsData.length > 0" class="nb-news-list__end">
      已加载全部新闻
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;
@use '../styles/mixins' as *;

.nb-news-list {
  &__state {
    @include flex(column, center, center, $sp-3);
    padding: $sp-12 $sp-4;
    color: var(--nb-text-tertiary);
  }

  &__hint {
    font-size: $fs-sm;
    color: var(--nb-text-tertiary);
  }

  &__more {
    @include flex(row, center, center, $sp-2);
    padding: $sp-4;
    font-size: $fs-sm;
    color: var(--nb-text-tertiary);
  }

  &__sentinel {
    height: 1px;
  }

  &__end {
    padding: $sp-4;
    text-align: center;
    font-size: $fs-sm;
    color: var(--nb-text-tertiary);
  }
}
</style>
