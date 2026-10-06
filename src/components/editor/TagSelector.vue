<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NIcon } from 'naive-ui'
import { X } from 'lucide-vue-next'
import { getTags } from '@/api/news'
import type { Tag } from '@/types'

interface Props {
  modelValue: number[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: number[]]
}>()

const tags = ref<Tag[]>([])

const loadTags = async () => {
  try {
    tags.value = await getTags()
  } catch {
    // 加载失败时保持空数组
  }
}

onMounted(() => {
  loadTags()
})

const selectedTags = computed<Tag[]>(() => {
  return props.modelValue
    .map((id) => tags.value.find((t: Tag) => t.id === id))
    .filter((t): t is Tag => t !== undefined)
})

const availableTags = computed<Tag[]>(() => {
  return tags.value.filter((t: Tag) => !props.modelValue.includes(t.id))
})

const addTag = (tagId: number) => {
  if (!props.modelValue.includes(tagId)) {
    emit('update:modelValue', [...props.modelValue, tagId])
  }
}

const removeTag = (tagId: number) => {
  emit('update:modelValue', props.modelValue.filter((id) => id !== tagId))
}
</script>

<template>
  <div class="tag-selector">
    <div class="tag-selector__row">
      <span v-for="tag in selectedTags" :key="tag.id" class="tag-selector__chip is-selected">
        #{{ tag.name }}
        <button class="tag-selector__chip-remove" title="移除" @click="removeTag(tag.id)">
          <n-icon :component="X" :size="12" />
        </button>
      </span>

      <span v-if="selectedTags.length === 0" class="tag-selector__empty">未选择标签</span>
    </div>

    <div v-if="availableTags.length > 0" class="tag-selector__row">
      <button
        v-for="tag in availableTags"
        :key="tag.id"
        class="tag-selector__chip"
        @click="addTag(tag.id)"
      >
        + {{ tag.name }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;
@use '../../styles/mixins' as *;

.tag-selector {
  @include flex(column, flex-start, flex-start, $sp-2);

  &__row {
    @include flex(row, flex-start, center, $sp-2);
    flex-wrap: wrap;
  }

  &__chip {
    @include flex(row, center, center, 4px);
    padding: $sp-1 $sp-3;
    font-size: $fs-sm;
    color: var(--nb-text-secondary);
    background-color: var(--nb-surface-subtle);
    border-radius: $radius-full;
    transition: background-color $dur-fast $ease, color $dur-fast $ease;

    &:hover {
      background-color: var(--nb-hover);
    }

    &.is-selected {
      color: var(--nb-brand);
      background-color: var(--nb-brand-subtle);
    }
  }

  &__chip-remove {
    @include flex(row, center, center);
    width: 16px;
    height: 16px;
    border-radius: $radius-full;
    color: inherit;
    transition: background-color $dur-fast $ease;

    &:hover {
      background-color: var(--nb-brand-subtle);
    }
  }

  &__empty {
    font-size: $fs-sm;
    color: var(--nb-text-tertiary);
  }
}
</style>
