<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { NIcon } from 'naive-ui'
import { Sparkles } from 'lucide-vue-next'
import { useAiSessionStore } from '@/stores/aiSession'
import MessageBubble from './MessageBubble.vue'

const store = useAiSessionStore()
const router = useRouter()
const scrollContainerRef = ref<HTMLElement | null>(null)

const quickQuestions = [
  '今日A股行情如何？',
  '如何选择基金？',
  '什么是量化交易？',
  '新手如何理财？',
]

// 仅当用户停留在底部附近时才自动跟随滚动，避免阅读历史内容时被强行拽回
const isNearBottom = ref(true)
let scrollRaf = 0

function scrollToBottom(instant = false) {
  const el = scrollContainerRef.value
  if (!el) return
  if (instant) {
    el.scrollTop = el.scrollHeight
  } else {
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }
}

function handleScroll() {
  const el = scrollContainerRef.value
  if (!el) return
  isNearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

watch(
  () => store.messages.length,
  () => {
    if (isNearBottom.value) scrollToBottom()
  }
)

// 流式期间高频更新：rAF 合帧 + 即时滚动，避免 smooth 动画堆积卡顿
watch(
  () => store.messages[store.messages.length - 1]?.content,
  () => {
    if (!isNearBottom.value || scrollRaf) return
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0
      scrollToBottom(true)
    })
  }
)

// 切换会话后强制回到底部
watch(
  () => store.currentSessionId,
  () => {
    isNearBottom.value = true
    nextTick(() => scrollToBottom(true))
  }
)

onMounted(() => {
  scrollToBottom(true)
})

onBeforeUnmount(() => {
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
})

function handleQuickQuestion(question: string) {
  store.sendMessage(question)
}
</script>

<template>
  <div ref="scrollContainerRef" class="chat" @scroll.passive="handleScroll">
    <div class="chat__inner">
      <p v-if="store.error && store.error !== store.connectionNotice" class="nb-alert nb-alert--error chat__error">
        {{ store.error }}
      </p>

      <div v-if="store.connectionNotice || store.needsLogin" class="chat__error" role="status" aria-live="polite">
        {{ store.needsLogin ? '登录已失效，请重新登录后恢复对话' : store.connectionNotice }}
        <button v-if="store.needsLogin" class="chat__quick-item" @click="router.push({ name: 'login', query: { redirect: '/ai' } })">重新登录</button>
        <button v-else-if="store.canRetryConnection" class="chat__quick-item" @click="store.retryConnection()">重试连接</button>
      </div>

      <div v-if="store.hasMessages" class="chat__messages">
        <MessageBubble
          v-for="(message, index) in store.messages"
          :key="message.id"
          :message="message"
          :can-regenerate="!store.isSending && index === store.messages.length - 1 && message.role === 'assistant'"
          @regenerate="store.regenerate()"
        />
      </div>

      <div v-else class="chat__welcome">
        <div class="chat__welcome-icon">
          <n-icon :component="Sparkles" :size="24" />
        </div>
        <h3 class="chat__welcome-title">Hello！我是您的 AI 助手</h3>
        <p class="chat__welcome-desc">请问有什么可以帮助您的？</p>

        <p class="chat__quick-label">快速提问</p>
        <div class="chat__quick">
          <button
            v-for="question in quickQuestions"
            :key="question"
            class="chat__quick-item"
            @click="handleQuickQuestion(question)"
          >
            {{ question }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;
@use '../../styles/mixins' as *;

.chat {
  height: 100%;
  overflow-y: auto;

  &__inner {
    max-width: 720px;
    margin: 0 auto;
    padding: $sp-4;
  }

  &__error {
    margin-bottom: $sp-4;
  }

  &__messages {
    display: flex;
    flex-direction: column;
    gap: $sp-5;
  }

  &__welcome {
    @include flex(column, flex-start, center, $sp-2);
    padding-top: 16vh;
    text-align: center;
  }

  &__welcome-icon {
    @include flex(row, center, center);
    width: 56px;
    height: 56px;
    margin-bottom: $sp-2;
    border-radius: $radius-full;
    color: #fff;
    background-color: var(--nb-brand);
  }

  &__welcome-title {
    font-size: $fs-lg;
    font-weight: $fw-semibold;
    color: var(--nb-text);
  }

  &__welcome-desc {
    font-size: $fs-sm;
    color: var(--nb-text-secondary);
  }

  &__quick-label {
    align-self: flex-start;
    margin-top: $sp-6;
    margin-bottom: $sp-2;
    font-size: $fs-xs;
    color: var(--nb-text-tertiary);
  }

  &__quick {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: $sp-2;
    width: 100%;
  }

  &__quick-item {
    padding: $sp-3;
    font-size: $fs-sm;
    text-align: left;
    color: var(--nb-text);
    background-color: var(--nb-surface);
    border: 1px solid var(--nb-border);
    border-radius: $radius-md;
    transition: background-color $dur-fast $ease, border-color $dur-fast $ease;

    &:hover {
      background-color: var(--nb-hover);
      border-color: var(--nb-border-strong);
    }

    &:active {
      background-color: var(--nb-active);
    }
  }
}
</style>
