<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NIcon, NPopconfirm, NSpin } from 'naive-ui'
import { ArrowLeft, Edit, FileText, Trash2 } from 'lucide-vue-next'
import { getDrafts, deleteDraft } from '@/api/draft'
import { formatTime } from '@/utils/format'
import type { NewsDraft } from '@/types'

const router = useRouter()

const handleBack = () => {
  router.push('/profile')
}

const handleEdit = (id: string) => {
  router.push({ path: '/editor', query: { draftId: id } })
}

const drafts = ref<NewsDraft[]>([])
const loading = ref(true)

const loadDrafts = async () => {
  loading.value = true
  try {
    drafts.value = await getDrafts()
  } catch (error) {
    console.error('获取草稿列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleDelete = async (id: string) => {
  try {
    await deleteDraft(id)
    loadDrafts()
  } catch (error) {
    console.error('删除草稿失败:', error)
  }
}

onMounted(() => {
  loadDrafts()
})
</script>

<template>
  <div class="nb-page">
    <header class="nb-page-header">
      <div class="nb-page-header__inner nb-page-header__inner--narrow">
        <button class="nb-icon-btn" title="返回" @click="handleBack">
          <n-icon :component="ArrowLeft" :size="18" />
        </button>
        <span class="nb-page-header__title">草稿箱</span>
        <div class="nb-page-header__side"></div>
      </div>
    </header>

    <main class="nb-page-body drafts">
      <div v-if="loading" class="drafts__state">
        <n-spin size="large" />
      </div>

      <div v-else-if="drafts.length === 0" class="nb-placeholder">
        <n-icon :component="FileText" :size="44" />
        <p class="nb-placeholder__title">暂无草稿</p>
      </div>

      <ul v-else class="drafts__list">
        <li v-for="draft in drafts" :key="draft.id" class="drafts__card">
          <div class="drafts__body">
            <div v-if="draft.coverImage" class="drafts__cover">
              <img
                :src="draft.coverImage"
                :alt="draft.title"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div v-else class="drafts__cover drafts__cover--empty">
              <n-icon :component="FileText" :size="22" />
            </div>

            <div class="drafts__info">
              <h3 class="drafts__title">{{ draft.title || '无标题' }}</h3>
              <p class="drafts__time">{{ formatTime(draft.updatedAt) }}</p>

              <div class="drafts__actions">
                <button class="drafts__action drafts__action--primary" @click="handleEdit(draft.id)">
                  <n-icon :component="Edit" :size="13" />
                  <span>继续编辑</span>
                </button>

                <n-popconfirm
                  positive-text="删除"
                  negative-text="取消"
                  :positive-button-props="{ type: 'error' }"
                  @positive-click="handleDelete(draft.id)"
                >
                  <template #trigger>
                    <button class="drafts__action drafts__action--danger">
                      <n-icon :component="Trash2" :size="13" />
                      <span>删除</span>
                    </button>
                  </template>
                  确定删除这份草稿吗？
                </n-popconfirm>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;
@use '../styles/mixins' as *;

.drafts {
  background-color: var(--nb-bg-subtle);
  min-height: 100vh;

  &__state {
    @include flex(row, center, center);
    padding: $sp-12 $sp-4;
  }

  &__list {
    max-width: 640px;
    margin: 0 auto;
    padding: $sp-4;
    display: flex;
    flex-direction: column;
    gap: $sp-3;
  }

  &__card {
    @include card($radius-lg);
    transition: box-shadow $dur-base $ease;

    &:hover {
      box-shadow: var(--nb-shadow-sm);
    }
  }

  &__body {
    @include flex(row, flex-start, flex-start, $sp-3);
    padding: $sp-4;
  }

  &__cover {
    flex-shrink: 0;
    width: 76px;
    height: 76px;
    border-radius: $radius-md;
    overflow: hidden;
    background-color: var(--nb-surface-subtle);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    &--empty {
      @include flex(row, center, center);
      color: var(--nb-text-tertiary);
    }
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__title {
    font-size: $fs-lg;
    font-weight: $fw-medium;
    line-height: 1.45;
    color: var(--nb-text);
    margin-bottom: $sp-1;
    @include line-clamp(2);
  }

  &__time {
    font-size: $fs-xs;
    color: var(--nb-text-tertiary);
    margin-bottom: $sp-3;
  }

  &__actions {
    @include flex(row, flex-start, center, $sp-2);
  }

  &__action {
    @include flex(row, center, center, 4px);
    padding: $sp-1 $sp-2;
    font-size: $fs-xs;
    border-radius: $radius-md;
    transition: background-color $dur-fast $ease, color $dur-fast $ease;

    &--primary {
      color: var(--nb-brand);
      background-color: var(--nb-brand-subtle);

      &:hover {
        background-color: var(--nb-hover);
      }
    }

    &--danger {
      color: var(--nb-text-tertiary);

      &:hover {
        color: var(--nb-danger);
        background-color: var(--nb-danger-subtle);
      }
    }
  }
}
</style>
