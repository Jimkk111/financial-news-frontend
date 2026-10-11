<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { NDrawer, NDrawerContent, NIcon, NSpin } from 'naive-ui'
import { MessageSquare, Plus } from 'lucide-vue-next'
import { useAiSessionStore } from '@/stores/aiSession'
import BottomNav from '@/components/BottomNav.vue'
import ChatArea from './ChatArea.vue'
import InputArea from './InputArea.vue'
import SessionSidebar from './SessionSidebar.vue'

const router = useRouter()
const store = useAiSessionStore()

const sidebarOpen = computed({
  get: () => store.sidebarOpen,
  set: (value) => {
    if (value) store.openSidebar()
    else store.closeSidebar()
  },
})

const handleTabChange = (tab: string) => {
  const routePath = tab === 'home' ? '/' : `/${tab}`
  router.push(routePath)
}

function handleSend(content: string) {
  store.sendMessage(content)
}

function handleNewConversation() {
  store.createNewSession()
}

const HEALTH_CHECK_INTERVAL = 30_000
let healthTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  void store.init()
  // 持续探测服务可用性，宕机/恢复都能及时反映到输入框状态
  healthTimer = setInterval(() => {
    void store.checkHealth()
  }, HEALTH_CHECK_INTERVAL)
})

onUnmounted(() => {
  if (healthTimer !== undefined) clearInterval(healthTimer)
})
</script>

<template>
  <div class="ai">
    <header class="ai__header">
      <div class="ai__header-inner">
        <button class="nb-icon-btn ai__header-btn" title="历史会话" @click="store.toggleSidebar">
          <n-icon :component="MessageSquare" :size="18" />
        </button>

        <div class="ai__brand">
          <span class="ai__brand-dot" />
          <span class="ai__brand-text">AI 助手</span>
        </div>

        <button
          class="nb-icon-btn ai__header-btn"
          title="新建会话"
          :disabled="store.isLoading"
          @click="handleNewConversation"
        >
          <n-spin v-if="store.isLoading" size="small" />
          <n-icon v-else :component="Plus" :size="18" />
        </button>
      </div>
    </header>

    <main class="ai__main">
      <ChatArea />
    </main>

    <div class="ai__input">
      <InputArea
        :disabled="!store.isServiceHealthy"
        :is-sending="store.isSending"
        :is-loading="store.isLoading"
        :is-stopping="store.isStopping"
        :web-search="store.webSearchEnabled"
        @send="handleSend"
        @stop="store.stopGeneration"
        @toggle-web-search="store.toggleWebSearch"
      />
    </div>

    <BottomNav active-tab="ai" @tab-change="handleTabChange" />

    <n-drawer v-model:show="sidebarOpen" placement="left" :width="300" :auto-focus="false">
      <n-drawer-content title="历史会话" closable body-content-style="padding: 0">
        <SessionSidebar />
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;
@use '../../styles/mixins' as *;

.ai {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--nb-bg);

  &__header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: $z-header;
    height: $header-height;
    background-color: var(--nb-surface);
    border-bottom: 1px solid var(--nb-border);
  }

  &__header-inner {
    max-width: 720px;
    height: 100%;
    margin: 0 auto;
    padding: 0 $sp-3;
    @include flex(row, space-between, center);
  }

  &__header-btn {
    color: var(--nb-text-secondary);
  }

  &__brand {
    @include flex(row, center, center, $sp-2);
  }

  &__brand-dot {
    width: 7px;
    height: 7px;
    border-radius: $radius-full;
    background-color: var(--nb-brand);
  }

  &__brand-text {
    font-size: $fs-md;
    font-weight: $fw-medium;
    color: var(--nb-text);
  }

  &__main {
    flex: 1;
    min-height: 0;
    padding-top: $header-height;
    padding-bottom: calc(#{$bottom-nav-height} + 120px);
  }

  &__input {
    position: fixed;
    left: 0;
    right: 0;
    bottom: $bottom-nav-height;
    z-index: $z-sticky;
    background-color: var(--nb-bg);
  }
}
</style>
