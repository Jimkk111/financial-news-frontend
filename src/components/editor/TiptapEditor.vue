<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount, computed, type Component } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { NIcon, NSpin } from 'naive-ui'
import { Video as VideoExtension } from './extensions/Video'
import type { ArticleContent } from '@/types/content'
import { tiptapToBlocks } from '@/utils/content/tiptapToBlocks'
import { blocksToTiptap } from '@/utils/content/blocksToTiptap'
import StarterKit from '@tiptap/starter-kit'
import { Image } from './extensions/Image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Undo2,
  Video,
} from 'lucide-vue-next'
import { uploadImage, uploadVideo } from '@/api/draft'
import { validateUploadFile, IMAGE_UPLOAD_RULE, VIDEO_UPLOAD_RULE } from '@/utils/file'

const props = defineProps<{
  modelValue: ArticleContent
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ArticleContent]
}>()

const isComposing = ref(false)
let updatingFromEditor = false

const fileInputRef = ref<HTMLInputElement | null>(null)
const isUploadingImage = ref(false)

const videoFileInputRef = ref<HTMLInputElement | null>(null)
const isUploadingVideo = ref(false)

// 编辑器内部是 ProseMirror 文档树，props.modelValue 是块级 JSON（ArticleContent）：
// 初始化时经 blocksToTiptap 转成文档树；文档树变化时 onUpdate 经 tiptapToBlocks 通知父组件；
// 父组件更新 modelValue 时，watch 再经 blocksToTiptap 解析回文档树。
const editor = useEditor({
  content: blocksToTiptap(props.modelValue),
  extensions: [
    StarterKit,
    Image,
    // 链接在编辑态不可点击跳转；样式交由 .news-prose 作用域控制
    Link.configure({
      openOnClick: false,
    }),
    Placeholder.configure({
      placeholder: '请输入新闻正文...',
    }),
    VideoExtension,
  ],
  editorProps: {
    // 编辑器的属性
    attributes: {
      class: 'news-prose tiptap-body',
    },
    // 中文输入过程只触发一次onUpdate
    handleDOMEvents: {
      // 组合事件开始
      compositionstart: () => {
        isComposing.value = true
      },
      // 组合事件结束
      compositionend: () => {
        isComposing.value = false
      },
    },
  },
  // onUpdate的作用是通知父元素更新props
  onUpdate: () => {
    if (isComposing.value) return
    updatingFromEditor = true
    emit('update:modelValue', tiptapToBlocks(editor.value?.getJSON()))
    nextTick(() => {
      updatingFromEditor = false
    })
  },
})

// 这个watch的作用是监听props.modelValue的改变，块级JSON被解析回内部文档树
watch(
  () => props.modelValue,
  (val) => {
    if (updatingFromEditor) return
    if (editor.value) {
      editor.value.commands.setContent(blocksToTiptap(val), { emitUpdate: false })
    }
  }
)

onBeforeUnmount(() => {
  editor.value?.destroy()
})

interface ToolbarItem {
  key: string
  icon: Component
  title: string
  isActive: () => boolean
  run: () => void
  disabled?: () => boolean
}

const chain = () => editor.value?.chain().focus()

const toolbarGroups = computed<ToolbarItem[][]>(() => [
  [
    {
      key: 'bold',
      icon: Bold,
      title: '粗体',
      isActive: () => editor.value?.isActive('bold') ?? false,
      run: () => chain()?.toggleBold().run(),
    },
    {
      key: 'italic',
      icon: Italic,
      title: '斜体',
      isActive: () => editor.value?.isActive('italic') ?? false,
      run: () => chain()?.toggleItalic().run(),
    },
  ],
  [
    {
      key: 'h1',
      icon: Heading1,
      title: '标题1',
      isActive: () => editor.value?.isActive('heading', { level: 1 }) ?? false,
      run: () => chain()?.toggleHeading({ level: 1 }).run(),
    },
    {
      key: 'h2',
      icon: Heading2,
      title: '标题2',
      isActive: () => editor.value?.isActive('heading', { level: 2 }) ?? false,
      run: () => chain()?.toggleHeading({ level: 2 }).run(),
    },
    {
      key: 'h3',
      icon: Heading3,
      title: '标题3',
      isActive: () => editor.value?.isActive('heading', { level: 3 }) ?? false,
      run: () => chain()?.toggleHeading({ level: 3 }).run(),
    },
  ],
  [
    {
      key: 'bulletList',
      icon: List,
      title: '无序列表',
      isActive: () => editor.value?.isActive('bulletList') ?? false,
      run: () => chain()?.toggleBulletList().run(),
    },
    {
      key: 'orderedList',
      icon: ListOrdered,
      title: '有序列表',
      isActive: () => editor.value?.isActive('orderedList') ?? false,
      run: () => chain()?.toggleOrderedList().run(),
    },
  ],
  [
    {
      key: 'blockquote',
      icon: Quote,
      title: '引用',
      isActive: () => editor.value?.isActive('blockquote') ?? false,
      run: () => chain()?.toggleBlockquote().run(),
    },
    {
      key: 'codeBlock',
      icon: Code,
      title: '代码块',
      isActive: () => editor.value?.isActive('codeBlock') ?? false,
      run: () => chain()?.toggleCodeBlock().run(),
    },
    {
      key: 'hr',
      icon: Minus,
      title: '分割线',
      isActive: () => false,
      run: () => chain()?.setHorizontalRule().run(),
    },
  ],
  [
    {
      key: 'link',
      icon: LinkIcon,
      title: '链接',
      isActive: () => editor.value?.isActive('link') ?? false,
      run: () => addLink(),
    },
    {
      key: 'image',
      icon: ImagePlus,
      title: '插入图片',
      isActive: () => false,
      disabled: () => isUploadingImage.value,
      run: () => addImage(),
    },
    {
      key: 'video',
      icon: Video,
      title: '插入视频',
      isActive: () => false,
      disabled: () => isUploadingVideo.value,
      run: () => addVideo(),
    },
  ],
  [
    {
      key: 'undo',
      icon: Undo2,
      title: '撤销',
      isActive: () => false,
      disabled: () => !editor.value?.can().undo(),
      run: () => chain()?.undo().run(),
    },
    {
      key: 'redo',
      icon: Redo2,
      title: '重做',
      isActive: () => false,
      disabled: () => !editor.value?.can().redo(),
      run: () => chain()?.redo().run(),
    },
  ],
])

const addImage = () => {
  fileInputRef.value?.click()
}

const handleImageUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }

  // 编辑器内无错误展示区，文件不合法时静默忽略
  if (validateUploadFile(file, IMAGE_UPLOAD_RULE)) return

  isUploadingImage.value = true
  try {
    const { url } = await uploadImage(file)
    editor.value?.chain().focus().setImage({ src: url }).run()
  } catch (error) {
    console.error('上传图片失败:', error)
  } finally {
    isUploadingImage.value = false
  }
}

const addLink = () => {
  const previousUrl = editor.value?.getAttributes('link').href
  const url = window.prompt('请输入链接地址', previousUrl)
  if (url === null) return
  if (url === '') {
    editor.value?.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.value?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

const addVideo = () => {
  videoFileInputRef.value?.click()
}

const handleVideoUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (videoFileInputRef.value) {
    videoFileInputRef.value.value = ''
  }

  if (validateUploadFile(file, VIDEO_UPLOAD_RULE)) return

  isUploadingVideo.value = true
  try {
    const { url } = await uploadVideo(file)
    editor.value?.chain().focus().insertContent({
      type: 'video',
      attrs: { src: url },
    }).run()
  } catch (error) {
    console.error('上传视频失败:', error)
  } finally {
    isUploadingVideo.value = false
  }
}
</script>

<template>
  <div class="tiptap-editor">
    <!-- Toolbar -->
    <div v-if="editor" class="tiptap-editor__toolbar">
      <template v-for="(group, gi) in toolbarGroups" :key="gi">
        <span v-if="gi > 0" class="tiptap-editor__divider" />
        <button
          v-for="item in group"
          :key="item.key"
          type="button"
          class="tiptap-editor__btn"
          :class="{ 'is-active': item.isActive() }"
          :title="item.title"
          :disabled="item.disabled?.()"
          @click="item.run()"
        >
          <n-icon :component="item.icon" :size="16" />
        </button>
      </template>

      <span class="tiptap-editor__status">
        <n-spin v-if="isUploadingImage || isUploadingVideo" />
      </span>
    </div>

    <!-- Editor Content -->
    <EditorContent :editor="editor" />

    <input
      ref="fileInputRef"
      type="file"
      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
      class="tiptap-editor__file"
      @change="handleImageUpload"
    />
    <input
      ref="videoFileInputRef"
      type="file"
      accept="video/mp4,video/webm,video/ogg"
      class="tiptap-editor__file"
      @change="handleVideoUpload"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;
@use '../../styles/mixins' as *;

.tiptap-editor {
  border: 1px solid var(--nb-border);
  border-radius: $radius-lg;
  overflow: hidden;
  background-color: var(--nb-surface);
  transition: border-color $dur-base $ease, box-shadow $dur-base $ease;

  &:focus-within {
    border-color: var(--nb-brand);
    box-shadow: 0 0 0 3px var(--nb-brand-subtle);
  }

  &__toolbar {
    @include flex(row, flex-start, center, 2px);
    flex-wrap: wrap;
    padding: $sp-1 $sp-2;
    border-bottom: 1px solid var(--nb-border);
    background-color: var(--nb-surface-subtle);
  }

  &__btn {
    @include flex(row, center, center);
    width: 28px;
    height: 28px;
    border-radius: $radius-md;
    color: var(--nb-text-secondary);
    transition: background-color $dur-fast $ease, color $dur-fast $ease;

    &:hover:not(:disabled) {
      background-color: var(--nb-hover);
      color: var(--nb-text);
    }

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    &.is-active {
      background-color: var(--nb-brand-subtle);
      color: var(--nb-brand);
    }
  }

  &__divider {
    width: 1px;
    height: 18px;
    margin: 0 $sp-2;
    background-color: var(--nb-border-strong);
  }

  &__status {
    margin-left: auto;
    @include flex(row, center, center);
    min-width: 16px;
  }

  &__file {
    display: none;
  }
}

/* 编辑器正文区：高度与内边距 */
:deep(.tiptap-body) {
  min-height: 300px;
  padding: $sp-4 $sp-4;
  outline: none;
}
</style>
