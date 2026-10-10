<script setup lang="ts">
import { NIcon, NTag } from 'naive-ui'
import { Clock } from 'lucide-vue-next'
import { formatViews } from '@/utils/format'
import type { Tag } from '@/types'
import NewsSelection from './NewsSelection.vue'

interface Props {
  id: number
  title: string
  source: string | null
  time: string
  views: number
  tags?: Tag[]
}

withDefaults(defineProps<Props>(), {
  tags: () => [],
})

const emit = defineEmits<{
  click: [id: number]
}>()

</script>

<template>
  <NewsSelection
    mode="item"
    :news-id="id"
    :news-title="title"
    class="nb-news-item"
    @click="emit('click', id)"
  >
    <h3 class="nb-news-item__title">{{ title }}</h3>

    <div v-if="tags.length > 0" class="nb-news-item__tags">
      <n-tag v-for="tag in tags" :key="tag.id" size="small" round :bordered="false">
        {{ tag.name }}
      </n-tag>
    </div>

    <div class="nb-news-item__meta">
      <span class="nb-news-item__source">{{ source }}</span>
      <span class="nb-news-item__dot">·</span>
      <span class="nb-news-item__time">
        <n-icon :component="Clock" :size="12" />
        {{ time }}
      </span>
      <span class="nb-news-item__views">{{ formatViews(views) }} 阅读</span>
    </div>
  </NewsSelection>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;
@use '../styles/mixins' as *;

.nb-news-item {
  padding: $sp-3 $sp-4;
  cursor: pointer;
  user-select: none;
  background-color: var(--nb-surface);
  border-bottom: 1px solid var(--nb-divider);
  transition: background-color $dur-fast $ease;

  &:hover {
    background-color: var(--nb-hover);
  }

  &:active {
    background-color: var(--nb-active);
  }

  &__title {
    font-size: $fs-lg;
    font-weight: $fw-semibold;
    line-height: 1.45;
    color: var(--nb-text);
    margin-bottom: $sp-2;
    @include line-clamp(2);
  }

  &__tags {
    @include flex(row, flex-start, center, $sp-2);
    flex-wrap: wrap;
    margin-bottom: $sp-2;
    overflow-wrap: anywhere;

    :deep(.n-tag) {
      max-width: 100%;
      height: auto;
      min-height: 22px;
      white-space: normal;
    }
  }

  &__meta {
    @include flex(row, flex-start, center, $sp-1);
    font-size: $fs-xs;
    color: var(--nb-text-tertiary);
  }

  &__source {
    color: var(--nb-text-secondary);
    font-weight: $fw-medium;
    @include ellipsis;
    max-width: 40%;
  }

  &__dot {
    color: var(--nb-text-disabled);
  }

  &__time {
    @include flex(row, flex-start, center, 3px);
  }

  &__views {
    margin-left: auto;
    flex-shrink: 0;
  }
}
</style>
