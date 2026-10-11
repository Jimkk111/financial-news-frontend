<script setup lang="ts">
import { ref, computed, watch, watchEffect, nextTick } from 'vue'
import { NIcon } from 'naive-ui'
import { Brain, Check, ChevronDown, Copy, Globe, RefreshCw, Sparkles } from 'lucide-vue-next'
import { renderMarkdown } from '@/utils/markdown'
import type { Message } from '@/types'

const props = defineProps<{
  message: Message
  /** 仅最后一条 AI 回复允许重新生成 */
  canRegenerate?: boolean
}>()

const emit = defineEmits<{
  regenerate: []
}>()

const renderedContent = computed(() => renderMarkdown(props.message.content))

const formattedTime = computed(() => {
  return props.message.timestamp.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
})

const isUser = computed(() => props.message.role === 'user')
const isStreaming = computed(() => props.message.status === 'streaming')

// ---- 深度思考面板 ----
const hasReasoning = computed(() => !!props.message.reasoning)

// 思考中：思考链已在滚动但正文未到，面板保持展开
const thinkingActive = computed(
  () => isStreaming.value && !props.message.content && hasReasoning.value
)

const reasoningExpanded = ref(false)
// 思考开始自动展开、正文到达自动折叠；期间手动折叠不被覆盖（依赖未变不会重跑）
watchEffect(() => {
  reasoningExpanded.value = thinkingActive.value
})

const reasoningBodyRef = ref<HTMLElement | null>(null)
// 思考链滚动期间吸附底部，类似终端输出
watch(
  () => props.message.reasoning,
  () => {
    if (!thinkingActive.value) return
    nextTick(() => {
      const el = reasoningBodyRef.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }
)

const reasoningTitle = computed(() => {
  if (thinkingActive.value) return '思考中…'
  const seconds = props.message.reasoningSeconds
  return seconds ? `已深度思考（用时 ${seconds} 秒）` : '已深度思考'
})

function toggleReasoning() {
  reasoningExpanded.value = !reasoningExpanded.value
}

// ---- 联网搜索引用来源 ----
const sourcesList = computed(() => props.message.sources ?? [])
const hasSources = computed(() => sourcesList.value.length > 0)

// 受理后、首个增量前：来源/思考链/正文均未到达的等待态，显示「思考中」
const isWaiting = computed(
  () =>
    isStreaming.value && !props.message.content && !props.message.reasoning && !hasSources.value
)

// favicon 加载失败后回退到地球图标
const brokenLogos = ref(new Set<string>())
function handleLogoError(url: string) {
  brokenLogos.value.add(url)
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

// navigator.clipboard 仅在 https/localhost 可用，非安全上下文降级到 execCommand
async function copyContent() {
  const text = props.message.content
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
    } finally {
      textarea.remove()
    }
  }

  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 1500)
}

function handleRegenerate() {
  emit('regenerate')
}
</script>

<template>
  <div class="bubble" :class="isUser ? 'bubble--user' : 'bubble--ai'">
    <div v-if="!isUser" class="bubble__avatar">
      <n-icon :component="Sparkles" :size="14" />
    </div>

    <div class="bubble__main">
      <div v-if="!isUser" class="bubble__name">AI 助手</div>

      <div class="bubble__content">
        <!-- 深度思考面板：思考链为纯文本（pre-wrap），不走 Markdown 渲染 -->
        <div v-if="!isUser && hasReasoning" class="bubble__reasoning">
          <button
            class="bubble__reasoning-toggle"
            :aria-expanded="reasoningExpanded"
            @click="toggleReasoning"
          >
            <n-icon :component="Brain" :size="13" />
            <span>{{ reasoningTitle }}</span>
            <n-icon
              class="bubble__reasoning-chevron"
              :class="{ 'bubble__reasoning-chevron--open': reasoningExpanded }"
              :component="ChevronDown"
              :size="13"
            />
          </button>
          <!-- 思考中限高内部滚动吸附底部；结束后展开完整阅读 -->
          <div
            v-show="reasoningExpanded"
            ref="reasoningBodyRef"
            class="bubble__reasoning-body"
            :class="{ 'bubble__reasoning-body--live': thinkingActive }"
          >
            <p>{{ message.reasoning }}</p>
          </div>
        </div>

        <!-- 联网搜索引用来源：卡片编号与正文 [n] 引用对应，点击新窗口打开 -->
        <div v-if="!isUser && hasSources" class="bubble__sources">
          <a
            v-for="(source, index) in sourcesList"
            :key="`${index}-${source.url}`"
            :href="source.url"
            target="_blank"
            rel="noopener noreferrer"
            class="bubble__source"
            :title="source.summary || source.title"
          >
            <span class="bubble__source-index">{{ index + 1 }}</span>
            <img
              v-if="source.logoUrl && !brokenLogos.has(source.logoUrl)"
              :src="source.logoUrl"
              class="bubble__source-logo"
              alt=""
              @error="handleLogoError(source.logoUrl!)"
            />
            <n-icon v-else :component="Globe" :size="14" class="bubble__source-icon" />
            <span class="bubble__source-info">
              <span class="bubble__source-title">{{ source.title }}</span>
              <span class="bubble__source-site">
                {{ source.siteName || sourceHost(source.url) }}
                <template v-if="source.publishTime"> · {{ source.publishTime }}</template>
              </span>
            </span>
          </a>
        </div>

        <!-- 等待态：受理后首个增量（来源/思考/正文）到达前 -->
        <p v-if="!isUser && isWaiting" class="bubble__thinking">
          思考中<span v-for="i in 3" :key="i" class="bubble__thinking-dot" />
        </p>

        <!-- AI 回复经 renderMarkdown 消毒后渲染，防注入 -->
        <div
          v-if="!isUser"
          class="nb-markdown"
          v-html="renderedContent"
        />
        <p v-else class="bubble__text">{{ message.content }}</p>

        <span v-if="isStreaming && !isWaiting" class="bubble__cursor" />
      </div>

      <div class="bubble__footer">
        <span v-if="message.generationStatus === 'cancelled'" class="bubble__time">已停止</span>
        <span v-else-if="message.generationStatus === 'failed'" class="bubble__time">
          {{ message.errorCode === 'WORKER_INTERRUPTED' ? '生成中断，已保留部分内容' : '生成失败，已保留部分内容' }}
        </span>
        <span class="bubble__time">{{ formattedTime }}</span>

        <template v-if="!isUser && !isStreaming">
          <button class="bubble__action" :title="copied ? '已复制' : '复制'" @click="copyContent">
            <n-icon :component="copied ? Check : Copy" :size="13" />
          </button>
          <button
            v-if="canRegenerate"
            class="bubble__action"
            title="重新生成"
            @click="handleRegenerate"
          >
            <n-icon :component="RefreshCw" :size="13" />
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;
@use '../../styles/mixins' as *;

.bubble {
  display: flex;
  gap: $sp-2;
  width: 100%;

  &--user {
    justify-content: flex-end;
  }

  &__avatar {
    flex-shrink: 0;
    @include flex(row, center, center);
    width: 26px;
    height: 26px;
    margin-top: 2px;
    border-radius: $radius-full;
    color: #fff;
    background-color: var(--nb-brand);
  }

  &__main {
    max-width: 85%;
    min-width: 0;

    .bubble--user & {
      max-width: 78%;
    }
  }

  &__name {
    margin-bottom: $sp-1;
    font-size: $fs-xs;
    color: var(--nb-text-tertiary);
  }

  &__content {
    padding: $sp-3 $sp-4;
    border-radius: $radius-lg;

    .bubble--ai & {
      background-color: var(--nb-surface);
      border: 1px solid var(--nb-border);
      border-top-left-radius: $radius-sm;
    }

    .bubble--user & {
      color: #fff;
      background-color: var(--nb-brand);
      border-top-right-radius: $radius-sm;
    }
  }

  &__text {
    font-size: $fs-base;
    line-height: $lh-relaxed;
    white-space: pre-line;
    word-break: break-word;
  }

  &__reasoning {
    margin-bottom: $sp-2;
    background-color: var(--nb-hover);
    border-radius: $radius-md;
  }

  &__reasoning-toggle {
    @include flex(row, flex-start, center, $sp-1);
    width: 100%;
    padding: $sp-2 $sp-3;
    font-size: $fs-xs;
    text-align: left;
    color: var(--nb-text-secondary);
    background: none;
    border: none;
    cursor: pointer;
    transition: color $dur-fast $ease;

    &:hover {
      color: var(--nb-text);
    }
  }

  &__reasoning-chevron {
    transition: transform $dur-fast $ease;

    &--open {
      transform: rotate(180deg);
    }
  }

  &__reasoning-body {
    padding: 0 $sp-3 $sp-2;
    font-size: $fs-xs;
    line-height: $lh-relaxed;
    color: var(--nb-text-secondary);

    p {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
    }

    // 思考中限高内部滚动，避免整页被思考链拽着滚动
    &--live {
      max-height: 32vh;
      overflow-y: auto;
    }
  }

  &__sources {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: $sp-2;
    margin-bottom: $sp-2;
  }

  &__source {
    @include flex(row, flex-start, center, $sp-2);
    min-width: 0;
    padding: $sp-2 $sp-3;
    text-decoration: none;
    background-color: var(--nb-bg);
    border: 1px solid var(--nb-border);
    border-radius: $radius-md;
    transition: border-color $dur-fast $ease, background-color $dur-fast $ease;

    &:hover {
      background-color: var(--nb-hover);
      border-color: var(--nb-border-strong);
    }
  }

  &__source-index {
    @include flex(row, center, center);
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    font-size: 10px;
    color: var(--nb-brand);
    background-color: var(--nb-brand-subtle);
    border-radius: $radius-sm;
  }

  &__source-logo,
  &__source-icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
  }

  &__source-logo {
    border-radius: $radius-sm;
    object-fit: cover;
  }

  &__source-icon {
    color: var(--nb-text-tertiary);
  }

  &__source-info {
    @include flex(column, flex-start, flex-start, 2px);
    min-width: 0;
  }

  &__source-title {
    max-width: 100%;
    overflow: hidden;
    font-size: $fs-xs;
    color: var(--nb-text);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__source-site {
    max-width: 100%;
    overflow: hidden;
    font-size: 11px;
    color: var(--nb-text-tertiary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__cursor {
    display: inline-block;
    width: 2px;
    height: 15px;
    margin-left: 2px;
    vertical-align: text-bottom;
    background-color: var(--nb-text);
    animation: bubble-blink 1s step-end infinite;
  }

  &__thinking {
    @include flex(row, flex-start, center);
    margin: 0;
    font-size: $fs-base;
    color: var(--nb-text-tertiary);
  }

  &__thinking-dot {
    width: 4px;
    height: 4px;
    margin-left: 4px;
    border-radius: $radius-full;
    background-color: currentColor;
    animation: bubble-thinking 1.2s ease-in-out infinite;

    &:nth-of-type(2) {
      animation-delay: 0.2s;
    }

    &:nth-of-type(3) {
      animation-delay: 0.4s;
    }
  }

  &__footer {
    @include flex(row, flex-start, center, $sp-1);
    margin-top: $sp-1;
    padding: 0 2px;

    .bubble--user & {
      justify-content: flex-end;
    }
  }

  &__time {
    font-size: 11px;
    color: var(--nb-text-tertiary);
  }

  &__action {
    @include flex(row, center, center);
    width: 20px;
    height: 20px;
    border-radius: $radius-sm;
    color: var(--nb-text-tertiary);
    transition: background-color $dur-fast $ease, color $dur-fast $ease;

    &:hover {
      background-color: var(--nb-hover);
      color: var(--nb-text);
    }
  }
}

@keyframes bubble-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

@keyframes bubble-thinking {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  30% {
    transform: translateY(-3px);
    opacity: 1;
  }
}
</style>
