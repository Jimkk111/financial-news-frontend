<script setup lang="ts">
import { onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Sparkles } from 'lucide-vue-next'
import { useAiSessionStore } from '@/stores/aiSession'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/utils/toast'
import { getNewsDetail } from '@/api/news'
import { articleToText } from '@/utils/content/articleToText'

const props = withDefaults(defineProps<{
  mode?: 'selection' | 'item'
  newsId?: number
  newsTitle?: string
}>(), { mode: 'selection' })

const router = useRouter()
const store = useAiSessionStore()
const auth = useAuthStore()
const root = ref<HTMLElement | null>(null)
const button = ref<HTMLButtonElement | null>(null)
const selectedText = ref('')
const position = ref({ left: 0, top: 0 })
const opening = ref(false)
let listening = false
let pressTimer: ReturnType<typeof setTimeout> | undefined
let pressStart: { x: number; y: number; pointerId: number } | null = null
let suppressClick = false

function cancelPress() {
  if (pressTimer !== undefined) clearTimeout(pressTimer)
  pressTimer = undefined
  pressStart = null
}

function hide() {
  selectedText.value = ''
  cancelPress()
}

function updateSelection() {
  if (props.mode !== 'selection') return
  if (opening.value || document.activeElement === button.value) return
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.rangeCount || !root.value) {
    hide()
    return
  }
  const range = selection.getRangeAt(0)
  if (!root.value.contains(range.startContainer) || !root.value.contains(range.endContainer)) {
    hide()
    return
  }
  const text = selection.toString().trim()
  const rect = range.getBoundingClientRect()
  if (!text || !rect.width || !rect.height) {
    hide()
    return
  }
  selectedText.value = text
  // 固定定位，优先放在选区上方，并留出视口边距。
  position.value = {
    left: Math.max(8, Math.min(rect.left + rect.width / 2 - 48, window.innerWidth - 104)),
    top: Math.max(8, Math.min(rect.top >= 52 ? rect.top - 44 : rect.bottom + 8, window.innerHeight - 44)),
  }
}

function showItemMenu(x: number, y: number) {
  if (opening.value) return
  selectedText.value = props.newsTitle || '这条新闻'
  position.value = {
    left: Math.max(8, Math.min(x, window.innerWidth - 104)),
    top: Math.max(8, Math.min(y, window.innerHeight - 44)),
  }
}

function startPress(event: PointerEvent) {
  if (props.mode !== 'item') return
  cancelPress()
  suppressClick = false
  if (event.pointerType !== 'touch' || !event.isPrimary) return
  pressStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  pressTimer = setTimeout(() => {
    pressTimer = undefined
    if (!pressStart) return
    suppressClick = true
    showItemMenu(pressStart.x, pressStart.y)
  }, 500)
}

function movePress(event: PointerEvent) {
  if (pressStart && (event.pointerId !== pressStart.pointerId ||
    Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 10)) cancelPress()
}

function handleContextMenu(event: MouseEvent) {
  if (props.mode !== 'item') return
  event.preventDefault()
  if (pressStart) suppressClick = true
  cancelPress()
  const rect = root.value?.getBoundingClientRect()
  showItemMenu(event.clientX || rect?.left || 8, event.clientY || rect?.top || 8)
}

function handleClick(event: MouseEvent | TouchEvent) {
  if (!suppressClick) return
  event.preventDefault()
  event.stopPropagation()
}

function handlePointerDown(event: PointerEvent) {
  if (button.value?.contains(event.target as Node)) return
  // root 的 pointerdown 会先启动长按计时，冒泡到 document 时不应取消它。
  if (props.mode === 'item' && root.value?.contains(event.target as Node)) {
    selectedText.value = ''
    return
  }
  hide()
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') hide()
}

function handleKeyUp(event: KeyboardEvent) {
  if (event.key !== 'Escape') updateSelection()
}

async function askAi() {
  if (!selectedText.value || opening.value) return
  let content = selectedText.value
  opening.value = true
  try {
    await auth.init()
    if (props.mode === 'item' && props.newsId !== undefined) {
      const news = await getNewsDetail(props.newsId)
      const body = articleToText(news.content) || news.summary || ''
      content = `请帮我解读以下新闻：\n\n标题：${news.title}\n${news.source ? `来源：${news.source}\n` : ''}\n${body}`
    }
    store.queueNewsQuestion(content)
    const failure = await router.push(auth.isAuthenticated
      ? { name: 'aiAssistant' }
      : { name: 'login', query: { redirect: '/ai' } })
    if (failure) {
      store.queueNewsQuestion('')
      toast.error('打开 AI 助手失败，请重试')
      return
    }
    window.getSelection()?.removeAllRanges()
    hide()
  } catch {
    store.queueNewsQuestion('')
    toast.error('打开 AI 助手失败，请重试')
  } finally {
    opening.value = false
  }
}

function attachListeners() {
  if (listening) return
  listening = true
  if (props.mode === 'selection') document.addEventListener('selectionchange', updateSelection)
  document.addEventListener('pointerdown', handlePointerDown)
  document.addEventListener('keydown', handleKeyDown)
  window.addEventListener('scroll', hide, true)
  window.addEventListener('resize', hide)
}

function detachListeners() {
  listening = false
  hide()
  document.removeEventListener('selectionchange', updateSelection)
  document.removeEventListener('pointerdown', handlePointerDown)
  document.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('scroll', hide, true)
  window.removeEventListener('resize', hide)
}

onMounted(attachListeners)
onActivated(attachListeners)
onDeactivated(detachListeners)
onUnmounted(detachListeners)
</script>

<template>
  <div
    ref="root"
    :class="{ 'news-item-menu': mode === 'item' }"
    @pointerdown="startPress"
    @pointermove="movePress"
    @pointerup="cancelPress(); updateSelection()"
    @pointercancel="cancelPress"
    @contextmenu="handleContextMenu"
    @click.capture="handleClick"
    @touchend.capture="handleClick"
    @keyup="handleKeyUp"
  >
    <slot />
    <Teleport to="body">
      <button
        v-if="selectedText"
        ref="button"
        type="button"
        class="news-selection-ask"
        :style="{ left: `${position.left}px`, top: `${position.top}px` }"
        :disabled="opening"
        @pointerdown.prevent.stop
        @click.stop="askAi"
      >
        <Sparkles :size="15" aria-hidden="true" />
        {{ opening ? '跳转中…' : '问 AI' }}
      </button>
    </Teleport>
  </div>
</template>

<style scoped>
.news-item-menu {
  -webkit-touch-callout: none;
  user-select: none;
}

.news-selection-ask {
  position: fixed;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 96px;
  height: 36px;
  border-radius: 8px;
  background: var(--nb-brand);
  color: #fff;
  font-size: 13px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 18%);
  user-select: none;
}

.news-selection-ask:focus-visible {
  outline: 2px solid var(--nb-brand);
  outline-offset: 3px;
}

.news-selection-ask:disabled {
  opacity: 0.7;
}
</style>
