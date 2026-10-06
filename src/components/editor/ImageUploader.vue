<script setup lang="ts">
import { ref } from 'vue'
import { NIcon, NSpin } from 'naive-ui'
import { ImagePlus, X } from 'lucide-vue-next'
import { uploadImage } from '@/api/draft'
import { validateUploadFile, IMAGE_UPLOAD_RULE } from '@/utils/file'
import { getApiErrorMessage } from '@/utils/apiError'

interface Props {
  modelValue: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const isUploading = ref(false)
const error = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

const handleClick = () => {
  fileInputRef.value?.click()
}

const uploadFile = async (file: File) => {
  error.value = ''

  const validationMessage = validateUploadFile(file, IMAGE_UPLOAD_RULE)
  if (validationMessage) {
    error.value = validationMessage
    return
  }

  isUploading.value = true
  try {
    const { url } = await uploadImage(file)
    emit('update:modelValue', url)
  } catch (err) {
    error.value = getApiErrorMessage(err, '上传失败')
  } finally {
    isUploading.value = false
  }
}

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  await uploadFile(file)

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

const handleRemove = () => {
  emit('update:modelValue', null)
}

const handleDrop = async (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = false
  const file = event.dataTransfer?.files[0]
  if (!file) return
  await uploadFile(file)
}

const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = true
}

const handleDragLeave = () => {
  isDragging.value = false
}
</script>

<template>
  <div class="uploader">
    <div
      v-if="!modelValue"
      class="uploader__dropzone"
      :class="{ 'is-active': isDragging }"
      @click="handleClick"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
    >
      <div v-if="isUploading" class="uploader__state">
        <n-spin size="medium" />
        <span class="uploader__state-text">上传中...</span>
      </div>
      <div v-else class="uploader__state">
        <n-icon class="uploader__icon" :component="ImagePlus" :size="30" />
        <span class="uploader__text">点击或拖拽上传封面图</span>
        <span class="uploader__hint">支持 PNG、JPEG、GIF、WebP，最大 5MB</span>
      </div>
    </div>

    <div v-else class="uploader__preview">
      <img :src="modelValue" alt="封面图" loading="lazy" decoding="async" />

      <button class="uploader__remove" title="移除图片" @click="handleRemove">
        <n-icon :component="X" :size="15" />
      </button>

      <button class="uploader__replace" @click="handleClick">更换图片</button>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
      class="uploader__input"
      @change="handleFileChange"
    />

    <p v-if="error" class="uploader__error">{{ error }}</p>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;
@use '../../styles/mixins' as *;

.uploader {
  &__dropzone {
    @include flex(column, center, center, $sp-2);
    padding: $sp-10 $sp-4;
    text-align: center;
    cursor: pointer;
    border: 1px dashed var(--nb-border-strong);
    border-radius: $radius-lg;
    background-color: var(--nb-surface);
    transition: border-color $dur-base $ease, background-color $dur-base $ease;

    &:hover {
      border-color: var(--nb-brand);
      background-color: var(--nb-surface-subtle);
    }

    &.is-active {
      border-color: var(--nb-brand);
      background-color: var(--nb-brand-subtle);
    }
  }

  &__state {
    @include flex(column, center, center, $sp-1);
    min-height: 64px;
  }

  &__icon {
    color: var(--nb-text-tertiary);
  }

  &__text {
    font-size: $fs-base;
    color: var(--nb-text-secondary);
  }

  &__hint {
    font-size: $fs-xs;
    color: var(--nb-text-tertiary);
  }

  &__state-text {
    font-size: $fs-sm;
    color: var(--nb-text-secondary);
  }

  &__preview {
    position: relative;
    border-radius: $radius-lg;
    overflow: hidden;
    border: 1px solid var(--nb-border);

    img {
      width: 100%;
      height: 192px;
      object-fit: cover;
      display: block;
    }
  }

  &__remove {
    position: absolute;
    top: $sp-2;
    right: $sp-2;
    @include flex(row, center, center);
    width: 30px;
    height: 30px;
    border-radius: $radius-full;
    color: #fff;
    background-color: var(--nb-overlay);
    transition: background-color $dur-fast $ease;

    &:hover {
      background-color: rgba(0, 0, 0, 0.8);
    }
  }

  &__replace {
    position: absolute;
    right: $sp-2;
    bottom: $sp-2;
    padding: $sp-1 $sp-3;
    font-size: $fs-sm;
    color: #fff;
    border-radius: $radius-md;
    background-color: var(--nb-overlay);
    transition: background-color $dur-fast $ease;

    &:hover {
      background-color: rgba(0, 0, 0, 0.8);
    }
  }

  &__input {
    display: none;
  }

  &__error {
    margin-top: $sp-2;
    font-size: $fs-xs;
    color: var(--nb-danger);
  }
}
</style>
