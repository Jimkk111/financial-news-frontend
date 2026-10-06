<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NIcon, NInput } from 'naive-ui'
import { ArrowLeft } from 'lucide-vue-next'
import { sendVerificationCode, resetPassword } from '@/api/auth'
import type { ResetPasswordRequest } from '@/types'
import { getApiErrorMessage } from '@/utils/apiError'

const router = useRouter()

const emit = defineEmits<{
  backToLogin: []
}>()

const username = ref('')
const email = ref('')
const code = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)
const codeLoading = ref(false)
const countdown = ref(0)
const isCodeSent = ref(false)

let countdownTimer: ReturnType<typeof setInterval> | null = null

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
  }
})

const handleSendCode = async () => {
  error.value = ''
  success.value = ''

  if (!username.value.trim()) {
    error.value = '请输入用户名'
    return
  }

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
    await sendVerificationCode(email.value, username.value)
    isCodeSent.value = true
    error.value = ''
    success.value = '验证码已发送，请查收邮件'
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

const handleResetPassword = async (e: Event) => {
  e.preventDefault()
  error.value = ''
  success.value = ''

  if (!username.value.trim()) {
    error.value = '请输入用户名'
    return
  }

  if (!email.value.trim()) {
    error.value = '请输入邮箱'
    return
  }

  if (!code.value.trim()) {
    error.value = '请输入验证码'
    return
  }

  if (!password.value) {
    error.value = '请输入新密码'
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

    const resetRequest: ResetPasswordRequest = {
      username: username.value.trim(),
      email: email.value.trim(),
      code: code.value.trim(),
      password: password.value,
    }

    await resetPassword(resetRequest)
    success.value = '密码重置成功，请使用新密码登录'
    setTimeout(() => {
      router.push('/login')
    }, 2000)
  } catch (err) {
    error.value = getApiErrorMessage(err, '密码重置失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

// 路由跳转，返回
const handleBack = () => {
  emit('backToLogin')
}
</script>

<template>
  <div class="nb-page auth">
    <header class="nb-page-header">
      <div class="nb-page-header__inner nb-page-header__inner--narrow">
        <button class="nb-icon-btn" title="返回" @click="handleBack">
          <n-icon :component="ArrowLeft" :size="18" />
        </button>
        <span class="nb-page-header__title">找回密码</span>
        <div class="nb-page-header__side"></div>
      </div>
    </header>

    <main class="auth__main">
      <div class="auth__card">
        <form class="auth__form" @submit="handleResetPassword">
          <p v-if="error" class="nb-alert nb-alert--error">{{ error }}</p>
          <p v-if="success" class="nb-alert nb-alert--success">{{ success }}</p>

          <div class="nb-field">
            <label class="nb-field__label" for="fp-username">用户名</label>
            <n-input
              id="fp-username"
              v-model:value="username"
              size="large"
              placeholder="请输入您的用户名"
              :disabled="isCodeSent"
            />
          </div>

          <div class="nb-field">
            <label class="nb-field__label" for="fp-email">邮箱地址</label>
            <n-input
              id="fp-email"
              v-model:value="email"
              size="large"
              placeholder="请输入您的邮箱地址"
              :disabled="isCodeSent"
            />
          </div>

          <div class="nb-field">
            <label class="nb-field__label" for="fp-code">验证码</label>
            <n-input
              id="fp-code"
              v-model:value="code"
              size="large"
              placeholder="请输入6位验证码"
              :maxlength="6"
            >
              <template #suffix>
                <n-button
                  quaternary
                  size="tiny"
                  type="primary"
                  :loading="codeLoading"
                  :disabled="countdown > 0 || codeLoading"
                  @click="handleSendCode"
                >
                  {{ countdown > 0 ? `${countdown}s后重发` : codeLoading ? '发送中...' : '发送验证码' }}
                </n-button>
              </template>
            </n-input>
          </div>

          <div class="nb-field">
            <label class="nb-field__label" for="fp-password">新密码</label>
            <n-input
              id="fp-password"
              v-model:value="password"
              size="large"
              type="password"
              placeholder="请输入新密码(8-128位,需含字母和数字)"
            />
          </div>

          <div class="nb-field">
            <label class="nb-field__label" for="fp-confirm">确认新密码</label>
            <n-input
              id="fp-confirm"
              v-model:value="confirmPassword"
              size="large"
              type="password"
              placeholder="请再次输入新密码"
              @keyup.enter="handleResetPassword"
            />
          </div>

          <n-button
            type="primary"
            size="large"
            block
            attr-type="submit"
            :loading="loading"
            :disabled="loading"
          >
            {{ loading ? '重置中...' : '确认重置' }}
          </n-button>
        </form>
      </div>

      <p class="auth__footer">
        <n-button quaternary size="small" type="primary" @click="handleBack">
          返回登录
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

  &__footer {
    @include flex(row, center, center, $sp-1);
    margin-top: $sp-4;
  }
}
</style>
