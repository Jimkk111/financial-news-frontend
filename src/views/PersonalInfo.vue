<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NIcon, NSpin } from 'naive-ui'
import { ArrowLeft, Camera, User } from 'lucide-vue-next'
import Avatar from '@/components/Avatar.vue'
import { uploadAvatar } from '@/api/user'
import { validateUploadFile, IMAGE_UPLOAD_RULE } from '@/utils/file'
import { getApiErrorMessage } from '@/utils/apiError'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = computed(() => authStore.user?.username || '')
const uid = computed(() => authStore.user?.uid || '')
const email = computed(() => authStore.user?.email || '')
const avatar = computed(() => authStore.user?.avatar || null)

const isUploading = ref(false)
const error = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

const getAvatarUrl = (avatarPath: string | null) => {
  if (!avatarPath) return null
  if (avatarPath.startsWith('blob:') || avatarPath.startsWith('http')) return avatarPath
  return avatarPath
}

const handleAvatarClick = () => {
  fileInputRef.value?.click()
}

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  const validationMessage = validateUploadFile(file, IMAGE_UPLOAD_RULE)
  if (validationMessage) {
    error.value = validationMessage
    return
  }

  error.value = ''
  isUploading.value = true

  try {
    const { avatar } = await uploadAvatar(file)
    authStore.user = { ...authStore.user!, avatar }
  } catch (err) {
    error.value = getApiErrorMessage(err, '头像上传失败，请稍后重试')
  } finally {
    isUploading.value = false
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  }
}

const handleBack = () => {
  router.push('/profile')
}

const handleLogout = () => {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="nb-page">
    <header class="nb-page-header">
      <div class="nb-page-header__inner nb-page-header__inner--narrow">
        <button class="nb-icon-btn" title="返回" @click="handleBack">
          <n-icon :component="ArrowLeft" :size="18" />
        </button>
        <span class="nb-page-header__title">个人信息</span>
        <div class="nb-page-header__side"></div>
      </div>
    </header>

    <main class="nb-page-body info">
      <div class="nb-card nb-card--padded info__card">
        <div class="info__avatar-block">
          <div class="info__avatar-wrap">
            <button
              class="info__avatar-btn"
              :disabled="isUploading"
              title="点击更换头像"
              @click="handleAvatarClick"
            >
              <Avatar :src="getAvatarUrl(avatar) || undefined" :alt="username" :size="80">
                <n-icon :component="User" :size="36" />
              </Avatar>
            </button>
            <span class="info__avatar-badge">
              <n-icon :component="Camera" :size="13" />
            </span>
            <div v-if="isUploading" class="info__avatar-mask">
              <n-spin size="small" />
            </div>
          </div>

          <input
            ref="fileInputRef"
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
            class="info__file-input"
            @change="handleFileChange"
          />

          <p class="info__avatar-tip">点击更换头像</p>
          <p v-if="error" class="info__avatar-error">{{ error }}</p>
          <h2 class="info__name">{{ username }}</h2>
        </div>

        <dl class="info__list">
          <div class="info__item">
            <dt class="info__item-label">ID</dt>
            <dd class="info__item-value">{{ uid }}</dd>
          </div>
          <div class="info__item">
            <dt class="info__item-label">用户名</dt>
            <dd class="info__item-value">{{ username }}</dd>
          </div>
          <div class="info__item">
            <dt class="info__item-label">邮箱</dt>
            <dd class="info__item-value">{{ email }}</dd>
          </div>
        </dl>

        <div class="info__logout">
          <n-button block size="large" type="error" secondary @click="handleLogout">
            退出登录
          </n-button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;
@use '../styles/mixins' as *;

.info {
  background-color: var(--nb-bg-subtle);
  min-height: 100vh;

  &__card {
    max-width: 520px;
    margin: $sp-6 auto;
  }

  &__avatar-block {
    @include flex(column, flex-start, center, $sp-1);
    padding-bottom: $sp-6;
    border-bottom: 1px solid var(--nb-divider);
  }

  &__avatar-wrap {
    position: relative;
    width: 80px;
    height: 80px;
  }

  &__avatar-btn {
    display: flex;
    border-radius: $radius-full;
    overflow: hidden;

    &:disabled {
      cursor: progress;
    }
  }

  &__avatar-badge {
    position: absolute;
    right: 0;
    bottom: 0;
    @include flex(row, center, center);
    width: 26px;
    height: 26px;
    border-radius: $radius-full;
    color: #fff;
    background-color: var(--nb-brand);
    border: 2px solid var(--nb-surface);
  }

  &__avatar-mask {
    position: absolute;
    inset: 0;
    @include flex(row, center, center);
    border-radius: $radius-full;
    background-color: var(--nb-overlay);
  }

  &__file-input {
    display: none;
  }

  &__avatar-tip {
    margin-top: $sp-2;
    font-size: $fs-xs;
    color: var(--nb-text-tertiary);
  }

  &__avatar-error {
    font-size: $fs-xs;
    color: var(--nb-danger);
  }

  &__name {
    margin-top: $sp-2;
    font-size: $fs-2xl;
    font-weight: $fw-bold;
    color: var(--nb-text);
  }

  &__list {
    padding: $sp-4 0;
  }

  &__item {
    @include flex(row, space-between, center, $sp-4);
    padding: $sp-3 0;
    border-bottom: 1px solid var(--nb-divider);

    &:last-child {
      border-bottom: none;
    }
  }

  &__item-label {
    font-size: $fs-base;
    color: var(--nb-text-secondary);
  }

  &__item-value {
    font-size: $fs-base;
    font-weight: $fw-medium;
    color: var(--nb-text);
    @include ellipsis;
  }

  &__logout {
    padding-top: $sp-2;
  }
}
</style>
