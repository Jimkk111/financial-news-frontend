<script setup lang="ts">
import { NIcon } from 'naive-ui'
import { Bot, Home, TrendingUp, User } from 'lucide-vue-next'

interface Props {
  activeTab?: string
}

const props = withDefaults(defineProps<Props>(), {
  activeTab: 'home',
})

const emit = defineEmits<{
  tabChange: [tab: string]
}>()

const navItems = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'market', label: '行情', icon: TrendingUp },
  { id: 'ai', label: 'AI助手', icon: Bot },
  { id: 'profile', label: '个人', icon: User },
]

const handleTabClick = (id: string) => {
  emit('tabChange', id)
}
</script>

<template>
  <nav class="nb-bottom-nav">
    <div class="nb-bottom-nav__inner">
      <button
        v-for="item in navItems"
        :key="item.id"
        class="nb-bottom-nav__item"
        :class="{ 'is-active': activeTab === item.id }"
        @click="handleTabClick(item.id)"
      >
        <n-icon :component="item.icon" :size="22" />
        <span class="nb-bottom-nav__label">{{ item.label }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;
@use '../styles/mixins' as *;

.nb-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: $z-header;
  background-color: var(--nb-surface);
  border-top: 1px solid var(--nb-border);
  padding: $sp-1 $sp-4;
  padding-bottom: calc(#{$sp-1} + env(safe-area-inset-bottom, 0px));

  &__inner {
    display: flex;
    align-items: center;
    justify-content: space-around;
    max-width: 480px;
    margin: 0 auto;
  }

  &__item {
    @include flex(column, center, center, 2px);
    padding: $sp-1 $sp-5;
    color: var(--nb-text-tertiary);
    transition: color $dur-fast $ease;

    &:hover {
      color: var(--nb-text-secondary);
    }

    &.is-active {
      color: var(--nb-brand);
    }
  }

  &__label {
    font-size: 10px;
    line-height: 1.2;

    .is-active & {
      font-weight: $fw-medium;
    }
  }
}
</style>
