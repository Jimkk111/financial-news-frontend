<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NButton, NIcon, NInput, NSelect } from 'naive-ui'
import { ArrowLeft, Save, Send } from 'lucide-vue-next'
import ImageUploader from '@/components/editor/ImageUploader.vue'
import TagSelector from '@/components/editor/TagSelector.vue'
import TiptapEditor from '@/components/editor/TiptapEditor.vue'
import {
  getDraft,
  createDraft,
  updateDraft,
  publishDraft,
} from '@/api/draft'
import { getCategories } from '@/api/news'
import { getApiErrorMessage } from '@/utils/apiError'
import type { Category } from '@/types'
import type { ArticleContent } from '@/types/content'
import { normalizeContent } from '@/utils/content/validateContent'

const router = useRouter()
const route = useRoute()

const draftId = computed(() => route.query.draftId as string | undefined)

const title = ref('')
const coverImage = ref<string | null>(null)
const selectedTags = ref<number[]>([])
const selectedCategory = ref<number | null>(null)
const content = ref<ArticleContent>([])
const currentDraftId = ref<string | null>(null)
const saving = ref(false)
const publishing = ref(false)
const error = ref('')
const successMessage = ref('')
const categories = ref<Category[]>([])

let autoSaveTimer: ReturnType<typeof setInterval> | null = null

// 自动保存脏检查：记录上次保存成功时的快照，仅当有改动时才保存
let lastSavedSnapshot = ''

const buildSnapshot = () =>
  JSON.stringify({
    title: title.value,
    coverImage: coverImage.value,
    categoryId: selectedCategory.value,
    tags: selectedTags.value,
    content: content.value,
  })

const categoryOptions = computed(() =>
  categories.value.map((cat) => ({ label: cat.name, value: cat.id }))
)

const loadCategories = async () => {
  try {
    categories.value = await getCategories()
  } catch {
    error.value = '加载分类失败'
  }
}

const handleBack = () => {
  router.push('/profile')
}

const loadDraft = async () => {
  const id = draftId.value
  if (!id) return

  try {
    const draft = await getDraft(id)
    currentDraftId.value = draft.id
    title.value = draft.title
    coverImage.value = draft.coverImage
    selectedCategory.value = draft.categoryId
    selectedTags.value = draft.tags ?? []
    content.value = normalizeContent(draft.content)
    lastSavedSnapshot = buildSnapshot()
  } catch (error) {
    console.error('加载草稿失败:', error)
  }
}

watch(
  () => draftId,
  () => {
    loadDraft()
  },
  { immediate: true }
)

const saveDraft = async (showSuccess = true) => {
  if (saving.value) return
  saving.value = true
  error.value = ''

  const payload = {
    title: title.value || '未命名草稿',
    content: content.value,
    coverImage: coverImage.value,
    categoryId: selectedCategory.value,
    tags: selectedTags.value,
  }

  try {
    if (currentDraftId.value) {
      await updateDraft(currentDraftId.value, payload)
    } else {
      const draft = await createDraft(payload)
      currentDraftId.value = draft.id
    }

    if (showSuccess) {
      successMessage.value = '草稿已保存'
      setTimeout(() => {
        successMessage.value = ''
      }, 2000)
    }

    lastSavedSnapshot = buildSnapshot()
  } catch (err) {
    error.value = getApiErrorMessage(err, '保存失败')
  } finally {
    saving.value = false
  }
}

const publish = async () => {
  if (!title.value.trim()) {
    error.value = '请输入新闻标题'
    return
  }
  if (content.value.length === 0) {
    error.value = '请输入新闻内容'
    return
  }

  publishing.value = true
  error.value = ''

  // 先保存，确保发布的是最新内容，并保证 currentDraftId 存在
  await saveDraft(false)

  if (!currentDraftId.value) {
    error.value = '草稿保存失败，无法发布'
    publishing.value = false
    return
  }

  try {
    const published = await publishDraft(currentDraftId.value)
    router.push(`/news/${published.id}`)
  } catch (err) {
    error.value = getApiErrorMessage(err, '发布失败')
  } finally {
    publishing.value = false
  }
}

onMounted(() => {
  loadCategories()
  autoSaveTimer = setInterval(() => {
    if ((title.value || content.value.length) && buildSnapshot() !== lastSavedSnapshot) {
      saveDraft()
    }
  }, 30000)
})

onUnmounted(() => {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer)
  }
})
</script>

<template>
  <div class="nb-page">
    <header class="nb-page-header">
      <div class="nb-page-header__inner nb-page-header__inner--wide">
        <button class="nb-icon-btn" title="返回" @click="handleBack">
          <n-icon :component="ArrowLeft" :size="18" />
        </button>
        <span class="nb-page-header__title">发布新闻</span>

        <div class="nb-page-header__side">
          <n-button
            size="small"
            quaternary
            :loading="saving"
            :disabled="saving"
            @click="saveDraft()"
          >
            <template #icon>
              <n-icon :component="Save" />
            </template>
            存草稿
          </n-button>

          <n-button
            size="small"
            type="primary"
            :loading="publishing"
            :disabled="publishing"
            @click="publish"
          >
            <template #icon>
              <n-icon :component="Send" />
            </template>
            发布
          </n-button>
        </div>
      </div>
    </header>

    <main class="nb-page-body editor">
      <div class="editor__inner">
        <p v-if="successMessage" class="nb-alert nb-alert--success">{{ successMessage }}</p>
        <p v-if="error" class="nb-alert nb-alert--error">{{ error }}</p>

        <div class="nb-field">
          <label class="nb-field__label">封面图片</label>
          <ImageUploader v-model="coverImage" />
        </div>

        <div class="nb-field">
          <label class="nb-field__label" for="editor-title">标题</label>
          <n-input
            id="editor-title"
            v-model:value="title"
            size="large"
            type="text"
            placeholder="请输入新闻标题"
            maxlength="100"
            show-count
          />
        </div>

        <div class="nb-field">
          <label class="nb-field__label" for="editor-category">分类</label>
          <n-select
            id="editor-category"
            v-model:value="selectedCategory"
            size="large"
            placeholder="请选择分类"
            :options="categoryOptions"
          />
        </div>

        <div class="nb-field">
          <label class="nb-field__label">标签</label>
          <TagSelector v-model="selectedTags" />
        </div>

        <div class="nb-field">
          <label class="nb-field__label">正文</label>
          <TiptapEditor v-model="content" />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.editor {
  background-color: var(--nb-bg-subtle);
  min-height: 100vh;

  &__inner {
    max-width: 900px;
    margin: 0 auto;
    padding: $sp-6 $sp-4 $sp-12;
    display: flex;
    flex-direction: column;
  }
}
</style>
