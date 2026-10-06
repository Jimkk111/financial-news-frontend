<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NIcon, NInput } from 'naive-ui'
import { ArrowLeft, Eye, EyeOff } from 'lucide-vue-next'
import { register, sendVerificationCode } from '@/api/auth'
import type { RegisterRequest } from '@/types'
import { getApiErrorMessage } from '@/utils/apiError'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const code = ref('')
const showPassword = ref(false)
const error = ref('')
const loading = ref(false)
const codeSent = ref(false)
const codeLoading = ref(false)
const countdown = ref(0)

let countdownTimer: ReturnType<typeof setInterval> | null = null

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
  }
})

const handleSendCode = async () => {
  if (!email.value.trim()) {
    error.value = '请输入邮箱'
    return
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.value)) {
    error.value = '请输入有效的邮箱格式'
    return
  }

  try {
    codeLoading.value = true
    await sendVerificationCode(email.value)
    codeSent.value = true
    error.value = ''
    countdown.value = 60
    countdownTimer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        clearInterval(countdownTimer!)
        countdownTimer = null
      }
    }, 1000)
  } catch (err) {
    error.value = getApiErrorMessage(err, '发送验证码失败，请稍后重试')
  } finally {
    codeLoading.value = false
  }
}

const handleSubmit = async (e: Event) => {
  e.preventDefault()
  error.value = ''

  if (!username.value.trim() || !email.value.trim() || !password.value || !confirmPassword.value || !code.value.trim()) {
    error.value = '所有字段均为必填项'
    return
  }

  const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_]{2,49}$/
  if (!usernameRegex.test(username.value.trim())) {
    error.value = '用户名需3-50字符，字母开头，仅含字母数字下划线'
    return
  }

  if (password.value.length < 8 || password.value.length > 128) {
    error.value = '密码长度需为8-128字符'
    return
  }

  const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)/
  if (!passwordRegex.test(password.value)) {
    error.value = '密码需包含字母和数字'
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }

  const codeRegex = /^\d{6}$/
  if (!codeRegex.test(code.value.trim())) {
    error.value = '验证码需为6位数字'
    return
  }

  try {
    loading.value = true

    const registerRequest: RegisterRequest = {
      username: username.value.trim(),
      email: email.value.trim(),
      password: password.value,
      code: code.value.trim(),
    }

    const { user } = await register(registerRequest)
    authStore.login(user)
    router.push('/')
  } catch (err) {
    error.value = getApiErrorMessage(err, '注册失败，请稍后重试')
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
        <span class="nb-page-header__title">注册</span>
        <div class="nb-page-header__side"></div>
      </div>
    </header>

    <main class="auth__main">
      <div class="auth__card">
        <div class="auth__head">
          <h1 class="auth__title">创建新账号</h1>
          <p class="auth__subtitle">加入我们，探索更多精彩</p>
        </div>

        <form class="auth__form" @submit="handleSubmit">
          <div class="nb-field">
            <label class="nb-field__label" for="reg-username">用户名</label>
            <n-input
              id="reg-username"
              v-model:value="username"
              size="large"
              placeholder="请输入用户名"
            />
          </div>

          <div class="nb-field">
            <label class="nb-field__label" for="reg-email">邮箱</label>
            <n-input
              id="reg-email"
              v-model:value="email"
              size="large"
              placeholder="请输入邮箱"
            />
          </div>

          <div class="nb-field">
            <label class="nb-field__label" for="reg-code">验证码</label>
            <div class="auth__code-row">
              <n-input
                id="reg-code"
                v-model:value="code"
                size="large"
                placeholder="请输入6位验证码"
                :maxlength="6"
              />
              <n-button
                size="large"
                secondary
                type="primary"
                class="auth__code-btn"
                :loading="codeLoading"
                :disabled="codeLoading || countdown > 0"
                @click="handleSendCode"
              >
                {{ codeLoading ? '发送中...' : countdown > 0 ? `${countdown}秒后重发` : '发送验证码' }}
              </n-button>
            </div>
          </div>

          <div class="nb-field">
            <label class="nb-field__label" for="reg-password">密码</label>
            <n-input
              id="reg-password"
              v-model:value="password"
              size="large"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入8-128位密码(需含字母和数字)"
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

          <div class="nb-field">
            <label class="nb-field__label" for="reg-confirm">确认密码</label>
            <n-input
              id="reg-confirm"
              v-model:value="confirmPassword"
              size="large"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请再次输入密码"
              @keyup.enter="handleSubmit"
            />
          </div>

          <p v-if="error" class="nb-alert nb-alert--error">{{ error }}</p>

          <n-button
            type="primary"
            size="large"
            block
            attr-type="submit"
            :loading="loading"
            :disabled="loading"
          >
            {{ loading ? '注册中...' : '注册' }}
          </n-button>
        </form>
      </div>

      <p class="auth__footer">
        <span class="auth__footer-text">已有账号？</span>
        <n-button quaternary size="small" type="primary" @click="router.push('/login')">
          立即登录
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

  &__code-row {
    @include flex(row, flex-start, center, $sp-2);
  }

  &__code-btn {
    flex-shrink: 0;
    min-width: 116px;
  }

  &__eye {
    @include flex(row, center, center);
    color: var(--nb-text-tertiary);
    transition: color $dur-fast $ease;

    &:hover {
      color: var(--nb-text);
    }
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
