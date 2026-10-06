<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NIcon, NPagination, NPopconfirm, NSpin } from 'naive-ui'
import { ArrowLeft, Clock, Eye, FileText, Trash2 } from 'lucide-vue-next'
import { getPublishedNews, deletePublishedNews } from '@/api/draft'
import { formatTime } from '@/utils/format'
import type { PublishedNews, PaginationInfo } from '@/types'

const router = useRouter()

const handleBack = () => {
  router.push('/profile')
}

const handleNewsClick = (id: number) => {
  router.push(`/news/${id}`)
}

const publishedList = ref<PublishedNews[]>([])
const loading = ref(true)
const pagination = ref<PaginationInfo>({
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 0,
})

const loadPublished = async (page: number = 1) => {
  loading.value = true
  try {
    const response = await getPublishedNews(page, pagination.value.pageSize)
    publishedList.value = response.data
    pagination.value = response.pagination
  } catch (error) {
    console.error('获取已发布列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleDelete = async (id: number) => {
  try {
    await deletePublishedNews(id)
    loadPublished(pagination.value.page)
  } catch (error) {
    console.error('删除已发布新闻失败:', error)
  }
}

const handlePageChange = (page: number) => {
  loadPublished(page)
}

onMounted(() => {
  loadPublished()
})
</script>

<template>
  <div class="nb-page">
    <header class="nb-page-header">
      <div class="nb-page-header__inner nb-page-header__inner--wide">
        <button class="nb-icon-btn" title="返回" @click="handleBack">
          <n-icon :component="ArrowLeft" :size="18" />
        </button>
        <span class="nb-page-header__title">我的发布</span>
        <div class="nb-page-header__side"></div>
      </div>
    </header>

    <main class="nb-page-body published">
      <div class="published__inner">
        <div v-if="loading" class="published__state">
          <n-spin size="large" />
        </div>

        <div v-else-if="publishedList.length === 0" class="nb-placeholder">
          <n-icon :component="FileText" :size="44" />
          <p class="nb-placeholder__title">暂无发布的新闻</p>
          <p class="nb-placeholder__desc">发布后可以在这里查看</p>
        </div>

        <template v-else>
          <ul class="published__list">
            <li v-for="news in publishedList" :key="news.id" class="published__card">
              <h3 class="published__title" @click="handleNewsClick(news.id)">
                {{ news.title }}
              </h3>
              <p class="published__summary">{{ news.summary }}</p>

              <div class="published__footer">
                <div class="published__meta">
                  <span class="published__meta-item">
                    <n-icon :component="Clock" :size="14" />
                    {{ formatTime(news.publishTime) }}
                  </span>
                  <span class="published__meta-item">
                    <n-icon :component="Eye" :size="14" />
                    {{ news.views }}
                  </span>
                </div>

                <n-popconfirm
                  positive-text="删除"
                  negative-text="取消"
                  :positive-button-props="{ type: 'error' }"
                  @positive-click="handleDelete(news.id)"
                >
                  <template #trigger>
                    <button class="published__delete">
                      <n-icon :component="Trash2" :size="14" />
                      <span>删除</span>
                    </button>
                  </template>
                  确定删除这篇新闻吗？此操作不可撤销。
                </n-popconfirm>
              </div>
            </li>
          </ul>

          <div v-if="pagination.totalPages > 1" class="published__pager">
            <n-pagination
              :page="pagination.page"
              :page-count="pagination.totalPages"
              :page-size="pagination.pageSize"
              :item-count="pagination.total"
              @update:page="handlePageChange"
            />
          </div>

          <p class="published__total">共 {{ pagination.total }} 条记录</p>
        </template>
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;
@use '../styles/mixins' as *;

.published {
  background-color: var(--nb-bg-subtle);
  min-height: 100vh;

  &__inner {
    max-width: 900px;
    margin: 0 auto;
    padding: $sp-4;
  }

  &__state {
    @include flex(row, center, center);
    padding: $sp-12 $sp-4;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: $sp-3;
  }

  &__card {
    @include card($radius-lg);
    padding: $sp-4;
    transition: box-shadow $dur-base $ease;

    &:hover {
      box-shadow: var(--nb-shadow-sm);
    }
  }

  &__title {
    font-size: $fs-lg;
    font-weight: $fw-semibold;
    line-height: 1.45;
    color: var(--nb-text);
    margin-bottom: $sp-2;
    cursor: pointer;
    @include line-clamp(2);
    transition: color $dur-fast $ease;

    &:hover {
      color: var(--nb-brand);
    }
  }

  &__summary {
    font-size: $fs-base;
    line-height: 1.6;
    color: var(--nb-text-secondary);
    margin-bottom: $sp-3;
    @include line-clamp(2);
  }

  &__footer {
    @include flex(row, space-between, center, $sp-3);
  }

  &__meta {
    @include flex(row, flex-start, center, $sp-3);
    font-size: $fs-xs;
    color: var(--nb-text-tertiary);
  }

  &__meta-item {
    @include flex(row, flex-start, center, 4px);
  }

  &__delete {
    @include flex(row, center, center, 4px);
    padding: $sp-1 $sp-2;
    font-size: $fs-sm;
    color: var(--nb-text-tertiary);
    border-radius: $radius-md;
    transition: color $dur-fast $ease, background-color $dur-fast $ease;

    &:hover {
      color: var(--nb-danger);
      background-color: var(--nb-danger-subtle);
    }
  }

  &__pager {
    @include flex(row, center, center);
    margin-top: $sp-6;
  }

  &__total {
    margin-top: $sp-4;
    text-align: center;
    font-size: $fs-sm;
    color: var(--nb-text-tertiary);
  }
}
</style>
