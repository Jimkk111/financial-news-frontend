<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NIcon, NInput } from 'naive-ui'
import { ArrowLeft, Eye, EyeOff } from 'lucide-vue-next'
import { login } from '@/api/auth'
import type { LoginRequest } from '@/types'
import { getApiErrorMessage } from '@/utils/apiError'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const error = ref('')
const loading = ref(false)

const handleSubmit = async (e: Event) => {
  e.preventDefault()
  error.value = ''

  if (!username.value.trim()) {
    error.value = '请输入用户名或邮箱'
    return
  }

  if (!password.value) {
    error.value = '请输入密码'
    return
  }

  if (password.value.length < 6) {
    error.value = '密码长度至少为6位'
    return
  }

  try {
    loading.value = true

    const loginRequest: LoginRequest = {
      username: username.value.trim(),
      password: password.value,
    }

    const { user } = await login(loginRequest)
    authStore.login(user)
    router.push('/')
  } catch (err) {
    error.value = getApiErrorMessage(err, '登录失败，请检查用户名和密码')
    console.error(err)
  } finally {
    loading.value = false
  }
}

// 路由跳转，返回
// 应该返回到登录前的页面，而不是固定返回首页
const handleBack = () => {
  router.push('/')
}
</script>

<template>
  <div class="nb-page auth">
    <header class="nb-page-header">
      <div class="nb-page-header__inner nb-page-header__inner--narrow">
        <button class="nb-icon-btn" title="返回" @click="handleBack">
          <n-icon :component="ArrowLeft" :size="18" />
        </button>
        <span class="nb-page-header__title">登录</span>
        <div class="nb-page-header__side"></div>
      </div>
    </header>

    <main class="auth__main">
      <div class="auth__card">
        <div class="auth__head">
          <h1 class="auth__title">欢迎回来</h1>
          <p class="auth__subtitle">登录您的账号，继续精彩体验</p>
        </div>

        <form class="auth__form" @submit="handleSubmit">
          <div class="nb-field">
            <label class="nb-field__label" for="login-username">用户名或邮箱</label>
            <n-input
              id="login-username"
              v-model:value="username"
              size="large"
              placeholder="请输入用户名或邮箱"
              :input-props="{ autocomplete: 'username' }"
            />
          </div>

          <div class="nb-field">
            <label class="nb-field__label" for="login-password">密码</label>
            <n-input
              id="login-password"
              v-model:value="password"
              size="large"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              :input-props="{ autocomplete: 'current-password' }"
              @keyup.enter="handleSubmit"
            >
              <template #suffix>
                <button
                  type="button"
                  class="auth__eye"
                  :title="showPassword ? '隐藏密码' : '显示密码'"
                  @click="showPassword = !showPassword"
                >
                  <n-icon :component="showPassword ? EyeOff : Eye" :size="18" />
                </button>
              </template>
            </n-input>
          </div>

          <p v-if="error" class="nb-alert nb-alert--error">{{ error }}</p>

          <div class="auth__row-end">
            <n-button quaternary size="small" type="primary" @click="router.push('/forgot-password')">
              忘记密码？
            </n-button>
          </div>

          <n-button
            type="primary"
            size="large"
            block
            attr-type="submit"
            :loading="loading"
            :disabled="loading"
          >
            {{ loading ? '登录中...' : '登录' }}
          </n-button>
        </form>
      </div>

      <p class="auth__footer">
        <span class="auth__footer-text">还没有账号？</span>
        <n-button quaternary size="small" type="primary" @click="router.push('/register')">
          立即注册
        </n-button>
      </p>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;
@use '../styles/mixins' as *;

.auth {
  background-color: var(--nb-bg-subtle);

  &__main {
    min-height: 100vh;
    padding: calc(#{$header-height} + #{$sp-8}) $sp-4 $sp-8;
    @include flex(column, flex-start, center, 0);
  }

  &__card {
    width: 100%;
    max-width: 400px;
    padding: $sp-8;
    background-color: var(--nb-surface);
    border: 1px solid var(--nb-border);
    border-radius: $radius-lg;
    box-shadow: var(--nb-shadow-sm);
  }

  &__head {
    text-align: center;
    margin-bottom: $sp-6;
  }

  &__title {
    font-size: $fs-3xl;
    font-weight: $fw-bold;
    color: var(--nb-text);
    margin-bottom: $sp-2;
  }

  &__subtitle {
    font-size: $fs-sm;
    color: var(--nb-text-secondary);
  }

  &__form {
    display: block;
  }

  &__eye {
    @include flex(row, center, center);
    color: var(--nb-text-tertiary);
    transition: color $dur-fast $ease;

    &:hover {
      color: var(--nb-text);
    }
  }

  &__row-end {
    @include flex(row, flex-end, center);
    margin-bottom: $sp-4;
  }

  &__footer {
    @include flex(row, center, center, $sp-1);
    margin-top: $sp-4;
  }

  &__footer-text {
    font-size: $fs-sm;
    color: var(--nb-text-secondary);
  }
}
</style>
