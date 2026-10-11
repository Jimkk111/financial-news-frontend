<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { NIcon, NSpin } from 'naive-ui'
import { Globe, Send, Square } from 'lucide-vue-next'

const props = defineProps<{
  disabled: boolean
  isSending: boolean
  isLoading: boolean
  webSearch: boolean
  isStopping?: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
  stop: []
  toggleWebSearch: []
}>()

const inputValue = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function adjustHeight() {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
      textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 96)}px`
    }
  })
}

watch(inputValue, adjustHeight)

const canSend = computed(
  () =>
    inputValue.value.trim() !== '' && !props.disabled && !props.isSending && !props.isLoading
)

function handleSend() {
  if (!canSend.value) return
  emit('send', inputValue.value)
  inputValue.value = ''
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
    }
  })
}

function handleKeydown(e: KeyboardEvent) {
  // 输入法组合期间（如拼音候选确认）的回车不触发发送
  if (e.isComposing || e.keyCode === 229) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="composer">
    <div class="composer__inner">
      <div class="composer__box" :class="{ 'is-disabled': disabled }">
        <button
          class="composer__tool"
          :class="{ 'is-active': webSearch }"
          :title="webSearch ? '联网搜索已开启（由 AI 判断是否需要搜索）' : '开启联网搜索'"
          @click="emit('toggleWebSearch')"
        >
          <n-icon :component="Globe" :size="15" />
          <span>联网</span>
        </button>

        <textarea
          ref="textareaRef"
          v-model="inputValue"
          class="composer__textarea"
          rows="1"
          :placeholder="disabled ? '后端服务不可用' : '输入您的问题...'"
          :disabled="disabled || isSending || isLoading"
          @keydown="handleKeydown"
        />

        <button
          v-if="isSending"
          class="composer__send is-stop"
          :title="isStopping ? '等待停止确认' : '停止生成'"
          :disabled="isStopping"
          @click="emit('stop')"
        >
          <n-spin v-if="isStopping" size="small" />
          <n-icon v-else :component="Square" :size="12" />
        </button>
        <button
          v-else
          class="composer__send"
          :class="{ 'is-ready': canSend }"
          title="发送"
          :disabled="!canSend"
          @click="handleSend"
        >
          <n-spin v-if="isLoading" size="small" />
          <n-icon v-else :component="Send" :size="17" />
        </button>
      </div>

      <p class="composer__tip">AI 助手可能会出错，请谨慎对待投资建议</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;
@use '../../styles/mixins' as *;

.composer {
  background-color: var(--nb-bg);
  border-top: 1px solid var(--nb-border);

  &__inner {
    max-width: 720px;
    margin: 0 auto;
    padding: $sp-3 $sp-4 $sp-2;
  }

  &__box {
    @include flex(row, flex-start, flex-end, $sp-2);
    padding: $sp-2 $sp-2 $sp-2 $sp-3;
    background-color: var(--nb-surface);
    border: 1px solid var(--nb-border-strong);
    border-radius: $radius-lg;
    transition: border-color $dur-base $ease, box-shadow $dur-base $ease;

    &:focus-within {
      border-color: var(--nb-brand);
      box-shadow: 0 0 0 3px var(--nb-brand-subtle);
    }

    &.is-disabled {
      opacity: 0.6;
    }
  }

  &__tool {
    @include flex(row, center, center, 4px);
    flex-shrink: 0;
    align-self: flex-end;
    height: 28px;
    margin-bottom: 1px;
    padding: 0 10px;
    font-size: $fs-xs;
    color: var(--nb-text-tertiary);
    background-color: var(--nb-surface-subtle);
    border: 1px solid transparent;
    border-radius: $radius-full;
    transition: color $dur-fast $ease, background-color $dur-fast $ease, border-color $dur-fast $ease;

    &:hover {
      color: var(--nb-text);
    }

    &.is-active {
      color: var(--nb-brand);
      background-color: var(--nb-brand-subtle);
      border-color: var(--nb-brand);
    }
  }

  &__textarea {
    flex: 1;
    min-width: 0;
    max-height: 96px;
    padding: 4px 0;
    font-size: $fs-base;
    line-height: 1.5;
    color: var(--nb-text);
    background: transparent;
    border: none;
    outline: none;
    resize: none;

    &::placeholder {
      color: var(--nb-text-tertiary);
    }

    &:disabled {
      cursor: not-allowed;
    }
  }

  &__send {
    @include flex(row, center, center);
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border-radius: $radius-md;
    color: var(--nb-text-tertiary);
    background-color: var(--nb-surface-subtle);
    transition: background-color $dur-fast $ease, color $dur-fast $ease;

    &.is-ready {
      color: #fff;
      background-color: var(--nb-brand);

      &:hover {
        background-color: var(--nb-brand-hover);
      }
    }

    &.is-stop {
      color: #fff;
      background-color: var(--nb-brand);

      &:hover {
        background-color: var(--nb-brand-hover);
        opacity: 0.9;
      }
    }

    &:disabled {
      cursor: not-allowed;
    }
  }

  &__tip {
    margin-top: $sp-2;
    text-align: center;
    font-size: 11px;
    color: var(--nb-text-tertiary);
  }
}
</style>
